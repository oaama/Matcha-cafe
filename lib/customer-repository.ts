import mongoose, { Schema } from 'mongoose';
import type { CustomerFollowUpStatus, CustomerRecord, OrderRecord } from './types';
import { getDataProvider } from './data-mode';

type CustomerFollowUp = {
  phoneKey: string;
  status: CustomerFollowUpStatus;
  note: string;
  lastContactedAt?: string;
};

type CustomerFollowUpUpdate = {
  status?: CustomerFollowUpStatus;
  note?: string;
  markContacted?: boolean;
};

type MockCustomerStore = { followUps: Map<string, CustomerFollowUp> };
declare global {
  var matchaMockCustomerStore: MockCustomerStore | undefined;
}

const mockStore = globalThis.matchaMockCustomerStore
  ?? (globalThis.matchaMockCustomerStore = { followUps: new Map() });

const customerFollowUpSchema = new Schema<CustomerFollowUp>({
  phoneKey: { type: String, required: true, unique: true },
  status: { type: String, enum: ['NEW', 'CONTACTED', 'FOLLOW_UP', 'NO_FOLLOW_UP'], required: true, default: 'NEW' },
  note: { type: String, required: true, default: '' },
  lastContactedAt: String,
}, { versionKey: false, collection: 'customer_follow_ups' });
const CustomerFollowUpModel = (mongoose.models.CustomerFollowUp as mongoose.Model<CustomerFollowUp> | undefined)
  ?? mongoose.model<CustomerFollowUp>('CustomerFollowUp', customerFollowUpSchema);

function isMock() {
  return getDataProvider() === 'mock';
}

export function normalizeCustomerPhone(phone: string) {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0020')) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length === 11) digits = `20${digits.slice(1)}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function buildCustomerDirectory(orders: OrderRecord[], followUps: CustomerFollowUp[] = []): CustomerRecord[] {
  const customers = new Map<string, CustomerRecord>();
  const sortedOrders = [...orders].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

  for (const order of sortedOrders) {
    if (!order.customerPhone) continue;
    const phoneKey = normalizeCustomerPhone(order.customerPhone);
    if (!phoneKey) continue;
    const customer = customers.get(phoneKey);
    if (customer) {
      customer.orderCount += 1;
      customer.completedOrderCount += order.status === 'COMPLETED' ? 1 : 0;
      customer.totalSpent += order.status === 'COMPLETED' ? order.total : 0;
      if (Date.parse(order.createdAt) < Date.parse(customer.firstOrderAt)) customer.firstOrderAt = order.createdAt;
      if (!customer.name && order.customerName) customer.name = order.customerName;
      if (!customer.address && order.customerAddress) customer.address = order.customerAddress;
      continue;
    }

    customers.set(phoneKey, {
      phoneKey,
      phone: order.customerPhone,
      name: order.customerName ?? '',
      address: order.customerAddress,
      firstOrderAt: order.createdAt,
      lastOrderAt: order.createdAt,
      orderCount: 1,
      completedOrderCount: order.status === 'COMPLETED' ? 1 : 0,
      totalSpent: order.status === 'COMPLETED' ? order.total : 0,
      lastOrderNumber: order.orderNumber,
      lastOrderStatus: order.status,
      followUpStatus: 'NEW',
      note: '',
    });
  }

  for (const followUp of followUps) {
    const customer = customers.get(followUp.phoneKey);
    if (!customer) continue;
    customer.followUpStatus = followUp.status;
    customer.note = followUp.note;
    customer.lastContactedAt = followUp.lastContactedAt;
  }

  return [...customers.values()].sort((left, right) => Date.parse(right.lastOrderAt) - Date.parse(left.lastOrderAt));
}

export async function listCustomerFollowUps() {
  if (isMock()) return [...mockStore.followUps.values()].map((followUp) => ({ ...followUp }));
  const { connectToDatabase } = await import('./database');
  await connectToDatabase();
  return CustomerFollowUpModel.find().select('-_id -__v').lean() as unknown as Promise<CustomerFollowUp[]>;
}

export async function updateCustomerFollowUp(phoneKey: string, update: CustomerFollowUpUpdate, now = new Date()) {
  const fields: Partial<CustomerFollowUp> = {};
  if (update.status !== undefined) fields.status = update.status;
  if (update.note !== undefined) fields.note = update.note;
  if (update.markContacted) {
    fields.lastContactedAt = now.toISOString();
    fields.status = 'CONTACTED';
  }
  if (fields.status === undefined || fields.note === undefined) {
    const existing = isMock()
      ? mockStore.followUps.get(phoneKey)
      : await getMongoCustomerFollowUp(phoneKey);
    fields.status ??= existing?.status ?? 'NEW';
    fields.note ??= existing?.note ?? '';
    if (fields.lastContactedAt === undefined) fields.lastContactedAt = existing?.lastContactedAt;
  }

  const followUp: CustomerFollowUp = {
    phoneKey,
    status: fields.status ?? 'NEW',
    note: fields.note ?? '',
    ...(fields.lastContactedAt ? { lastContactedAt: fields.lastContactedAt } : {}),
  };
  if (isMock()) {
    mockStore.followUps.set(phoneKey, followUp);
    return { ...followUp };
  }

  const { connectToDatabase } = await import('./database');
  await connectToDatabase();
  return await CustomerFollowUpModel.findOneAndUpdate(
    { phoneKey },
    { $set: followUp },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).select('-_id -__v').lean() as unknown as CustomerFollowUp;
}

async function getMongoCustomerFollowUp(phoneKey: string) {
  const { connectToDatabase } = await import('./database');
  await connectToDatabase();
  return CustomerFollowUpModel.findOne({ phoneKey }).select('-_id -__v').lean() as unknown as Promise<CustomerFollowUp | null>;
}

export function clearMockCustomerFollowUps() {
  mockStore.followUps.clear();
}
