import mongoose, { Schema } from 'mongoose';
import { getDataProvider } from './data-mode';
import { connectToDatabase } from './database';
import { recordActivity } from './activity-log-repository';
import {
  createDebtPaymentSchema,
  createDebtSchema,
  updateDebtPaymentSchema,
  updateDebtSchema,
  type CreateDebtInput,
  type CreateDebtPaymentInput,
  type UpdateDebtInput,
  type UpdateDebtPaymentInput,
} from './debt-validation';
import type { DebtPayment, DebtRecord, DebtStatus, DebtTotals } from './debt-types';

type DebtDocument = Omit<DebtRecord, 'totalPaid' | 'remainingAmount' | 'status'>;
type MockDebtStore = { debts: DebtRecord[] };

declare global {
  var matchaMockDebtStore: MockDebtStore | undefined;
}

const mockStore = globalThis.matchaMockDebtStore
  ?? (globalThis.matchaMockDebtStore = { debts: [] });

const paymentSchema = new Schema<DebtPayment>({
  id: { type: String, required: true },
  amount: { type: Number, required: true, min: 0.01, max: 10_000_000 },
  paymentDate: { type: String, required: true },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  createdAt: { type: String, required: true, immutable: true },
  updatedAt: { type: String, required: true },
}, { _id: false });

const debtSchema = new Schema<DebtDocument>({
  id: { type: String, required: true, unique: true },
  person: { type: String, required: true, trim: true, maxlength: 200 },
  originalAmount: { type: Number, required: true, min: 0.01, max: 10_000_000 },
  debtDate: { type: String, required: true, index: true },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  notes: { type: String, trim: true, maxlength: 1000 },
  payments: { type: [paymentSchema], default: [] },
  createdAt: { type: String, required: true, immutable: true },
  updatedAt: { type: String, required: true },
}, { versionKey: false, collection: 'cafe_debts' });

const DebtModel = (mongoose.models.CafeDebt as mongoose.Model<DebtDocument> | undefined)
  ?? mongoose.model<DebtDocument>('CafeDebt', debtSchema);

type ActivityActor = { id: string; username: string };

async function logDebtActivity(
  actor: ActivityActor | undefined,
  action: string,
  debtId: string,
  details: Record<string, string | number | boolean | null>,
  session?: mongoose.ClientSession,
) {
  if (!actor) return;
  await recordActivity({
    actorId: actor.id,
    actorName: actor.username,
    action,
    entityType: 'manual-debt',
    entityId: debtId,
    details,
  }, session);
}

export class DebtOperationError extends Error {
  constructor(
    public readonly code: 'DEBT_NOT_FOUND' | 'PAYMENT_NOT_FOUND' | 'OVERPAYMENT' | 'BELOW_PAID_AMOUNT',
    message: string,
  ) {
    super(message);
    this.name = 'DebtOperationError';
  }
}

function cents(amount: number) {
  return Math.round(amount * 100);
}

function money(valueInCents: number) {
  return valueInCents / 100;
}

function getTotalsForPayments(payments: DebtPayment[]) {
  return payments.reduce((total, payment) => total + cents(payment.amount), 0);
}

function withBalance(debt: DebtDocument | DebtRecord): DebtRecord {
  const totalPaid = money(getTotalsForPayments(debt.payments));
  const remainingAmount = money(cents(debt.originalAmount) - cents(totalPaid));
  const status: DebtStatus = totalPaid === 0 ? 'UNPAID' : remainingAmount === 0 ? 'PAID' : 'PARTIAL';
  return { ...debt, payments: debt.payments.map((payment) => ({ ...payment })), totalPaid, remainingAmount, status };
}

function toDebt(document: DebtDocument): DebtRecord {
  return withBalance(document);
}

function ensurePaymentFits(debt: DebtDocument | DebtRecord, paymentAmount: number, replacingPaymentId?: string) {
  const paidWithoutReplacement = debt.payments.reduce(
    (total, payment) => total + (payment.id === replacingPaymentId ? 0 : cents(payment.amount)),
    0,
  );
  if (paidWithoutReplacement + cents(paymentAmount) > cents(debt.originalAmount)) {
    throw new DebtOperationError('OVERPAYMENT', 'Payment exceeds the remaining debt balance');
  }
}

function validateId(id: string) {
  if (!id || !id.trim()) throw new TypeError('A debt ID is required');
}

export async function listDebts(): Promise<{ debts: DebtRecord[]; totals: DebtTotals }> {
  let debts: DebtRecord[];
  if (getDataProvider() === 'mock') {
    debts = mockStore.debts.map((debt) => withBalance(structuredClone(debt)));
  } else {
    await connectToDatabase();
    const documents = await DebtModel.find({}).sort({ debtDate: -1, createdAt: -1 }).lean();
    debts = documents.map(toDebt);
  }
  const totals: DebtTotals = debts.reduce((result, debt) => ({
    originalAmount: money(cents(result.originalAmount) + cents(debt.originalAmount)),
    paidAmount: money(cents(result.paidAmount) + cents(debt.totalPaid)),
    remainingAmount: money(cents(result.remainingAmount) + cents(debt.remainingAmount)),
    unpaidCount: result.unpaidCount + Number(debt.status === 'UNPAID'),
    partiallyPaidCount: result.partiallyPaidCount + Number(debt.status === 'PARTIAL'),
    paidCount: result.paidCount + Number(debt.status === 'PAID'),
  }), { originalAmount: 0, paidAmount: 0, remainingAmount: 0, unpaidCount: 0, partiallyPaidCount: 0, paidCount: 0 });
  return { debts, totals };
}

export async function createDebt(input: CreateDebtInput, actor?: ActivityActor): Promise<DebtRecord> {
  const parsed = createDebtSchema.parse(input);
  const now = new Date().toISOString();
  const debt: DebtDocument = {
    ...parsed,
    id: `debt-${crypto.randomUUID()}`,
    payments: [],
    createdAt: now,
    updatedAt: now,
  };
  if (getDataProvider() === 'mock') {
    const record = withBalance(debt);
    mockStore.debts.unshift(structuredClone(record));
    await logDebtActivity(actor, 'DEBT_CREATED', record.id, {
      person: record.person,
      originalAmount: record.originalAmount,
    });
    return structuredClone(record);
  }
  const connection = await connectToDatabase();
  const session = await connection.startSession();
  try {
    let result: DebtRecord | null = null;
    await session.withTransaction(async () => {
      const [document] = await DebtModel.create([debt], { session });
      result = toDebt(document.toObject());
      await logDebtActivity(actor, 'DEBT_CREATED', debt.id, {
        person: debt.person,
        originalAmount: debt.originalAmount,
      }, session);
    });
    if (!result) throw new Error('Unable to create debt');
    return result;
  } finally {
    await session.endSession();
  }
}

export async function updateDebt(id: string, input: UpdateDebtInput, actor?: ActivityActor): Promise<DebtRecord | null> {
  validateId(id);
  const parsed = updateDebtSchema.parse(input);
  if (getDataProvider() === 'mock') {
    const debt = mockStore.debts.find((item) => item.id === id);
    if (!debt) return null;
    const nextOriginalAmount = parsed.originalAmount ?? debt.originalAmount;
    if (cents(nextOriginalAmount) < getTotalsForPayments(debt.payments)) {
      throw new DebtOperationError('BELOW_PAID_AMOUNT', 'Original amount cannot be less than recorded payments');
    }
    Object.assign(debt, parsed, { updatedAt: new Date().toISOString() });
    await logDebtActivity(actor, 'DEBT_UPDATED', debt.id, { person: debt.person, originalAmount: debt.originalAmount });
    return withBalance(structuredClone(debt));
  }
  const connection = await connectToDatabase();
  const session = await connection.startSession();
  let result: DebtRecord | null = null;
  try {
    await session.withTransaction(async () => {
      const document = await DebtModel.findOne({ id }).session(session);
      if (!document) return;
      const nextOriginalAmount = parsed.originalAmount ?? document.originalAmount;
      if (cents(nextOriginalAmount) < getTotalsForPayments(document.payments)) {
        throw new DebtOperationError('BELOW_PAID_AMOUNT', 'Original amount cannot be less than recorded payments');
      }
      Object.assign(document, parsed, { updatedAt: new Date().toISOString() });
      await document.save({ session });
      result = toDebt(document.toObject());
      await logDebtActivity(actor, 'DEBT_UPDATED', id, {
        person: document.person,
        originalAmount: document.originalAmount,
      }, session);
    });
  } finally {
    await session.endSession();
  }
  return result;
}

export async function deleteDebt(id: string, actor?: ActivityActor): Promise<boolean> {
  validateId(id);
  if (getDataProvider() === 'mock') {
    const index = mockStore.debts.findIndex((debt) => debt.id === id);
    if (index < 0) return false;
    const [debt] = mockStore.debts.splice(index, 1);
    await logDebtActivity(actor, 'DEBT_DELETED', id, { person: debt.person, originalAmount: debt.originalAmount });
    return true;
  }
  const connection = await connectToDatabase();
  const session = await connection.startSession();
  try {
    let deleted = false;
    await session.withTransaction(async () => {
      const debt = await DebtModel.findOne({ id }).session(session);
      if (!debt) return;
      await DebtModel.deleteOne({ id }, { session });
      await logDebtActivity(actor, 'DEBT_DELETED', id, { person: debt.person, originalAmount: debt.originalAmount }, session);
      deleted = true;
    });
    return deleted;
  } finally {
    await session.endSession();
  }
}

async function mutatePayment(
  id: string,
  mutation: (debt: DebtDocument | DebtRecord) => void,
  action: string,
  actor?: ActivityActor,
  details: Record<string, string | number | boolean | null> = {},
): Promise<DebtRecord | null> {
  validateId(id);
  if (getDataProvider() === 'mock') {
    const debt = mockStore.debts.find((item) => item.id === id);
    if (!debt) return null;
    mutation(debt);
    debt.updatedAt = new Date().toISOString();
    await logDebtActivity(actor, action, id, { ...details, remainingAmount: withBalance(debt).remainingAmount });
    return withBalance(structuredClone(debt));
  }

  const connection = await connectToDatabase();
  const session = await connection.startSession();
  let result: DebtRecord | null = null;
  try {
    await session.withTransaction(async () => {
      const debt = await DebtModel.findOne({ id }).session(session);
      if (!debt) return;
      mutation(debt);
      debt.updatedAt = new Date().toISOString();
      await debt.save({ session });
      result = toDebt(debt.toObject());
      await logDebtActivity(actor, action, id, { ...details, remainingAmount: result.remainingAmount }, session);
    });
  } finally {
    await session.endSession();
  }
  return result;
}

export async function addDebtPayment(id: string, input: CreateDebtPaymentInput, actor?: ActivityActor): Promise<DebtRecord | null> {
  const parsed = createDebtPaymentSchema.parse(input);
  const paymentId = `payment-${crypto.randomUUID()}`;
  return mutatePayment(id, (debt) => {
    ensurePaymentFits(debt, parsed.amount);
    const now = new Date().toISOString();
    debt.payments.push({
      id: paymentId,
      ...parsed,
      createdAt: now,
      updatedAt: now,
    });
  }, 'DEBT_PAYMENT_CREATED', actor, { paymentId, amount: parsed.amount });
}

export async function updateDebtPayment(
  id: string,
  paymentId: string,
  input: UpdateDebtPaymentInput,
  actor?: ActivityActor,
): Promise<DebtRecord | null> {
  validateId(paymentId);
  const parsed = updateDebtPaymentSchema.parse(input);
  return mutatePayment(id, (debt) => {
    const payment = debt.payments.find((item) => item.id === paymentId);
    if (!payment) throw new DebtOperationError('PAYMENT_NOT_FOUND', 'Payment not found');
    if (parsed.amount !== undefined) ensurePaymentFits(debt, parsed.amount, paymentId);
    Object.assign(payment, parsed, { updatedAt: new Date().toISOString() });
  }, 'DEBT_PAYMENT_UPDATED', actor, { paymentId, ...parsed });
}

export async function deleteDebtPayment(id: string, paymentId: string, actor?: ActivityActor): Promise<DebtRecord | null> {
  validateId(paymentId);
  return mutatePayment(id, (debt) => {
    const index = debt.payments.findIndex((item) => item.id === paymentId);
    if (index < 0) throw new DebtOperationError('PAYMENT_NOT_FOUND', 'Payment not found');
    debt.payments.splice(index, 1);
  }, 'DEBT_PAYMENT_DELETED', actor, { paymentId });
}

export function clearMockDebts() {
  mockStore.debts = [];
}
