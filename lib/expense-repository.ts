import mongoose, { Schema } from 'mongoose';
import { getDataProvider } from './data-mode';
import { connectToDatabase } from './database';
import type { ExpenseCategory, ExpenseRecord, ShiftType } from './staff-types';

type ExpenseDocument = Omit<ExpenseRecord, 'createdAt'> & { createdAt: Date };
type MockExpenseStore = { expenses: ExpenseRecord[] };
declare global {
  var matchaMockExpenseStore: MockExpenseStore | undefined;
}

const mockStore = globalThis.matchaMockExpenseStore
  ?? (globalThis.matchaMockExpenseStore = { expenses: [] });

const expenseSchema = new Schema<ExpenseDocument>({
  id: { type: String, required: true, unique: true },
  amount: { type: Number, required: true, min: 0.01 },
  category: { type: String, enum: ['ELECTRICITY', 'WATER', 'FOOD', 'SUPPLIES', 'MAINTENANCE', 'RENT', 'OTHER'], required: true },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  expenseDate: { type: String, required: true, index: true },
  shiftType: { type: String, enum: ['DAY', 'NIGHT'], required: true },
  employeeId: { type: String, required: true, index: true },
  shiftId: { type: String, index: true },
  username: { type: String, required: true },
  createdAt: { type: Date, required: true, immutable: true },
}, { versionKey: false, collection: 'cafe_expenses' });

const ExpenseModel = (mongoose.models.CafeExpense as mongoose.Model<ExpenseDocument> | undefined)
  ?? mongoose.model<ExpenseDocument>('CafeExpense', expenseSchema);

function toExpense(document: ExpenseDocument): ExpenseRecord {
  return { ...document, createdAt: document.createdAt.toISOString() };
}

export async function listExpenses(filters: { expenseDate?: string; employeeId?: string; shiftId?: string } = {}) {
  if (getDataProvider() === 'mock') {
    return mockStore.expenses
      .filter((expense) => (!filters.expenseDate || expense.expenseDate === filters.expenseDate)
        && (!filters.employeeId || expense.employeeId === filters.employeeId)
        && (!filters.shiftId || expense.shiftId === filters.shiftId))
      .map((expense) => ({ ...expense }));
  }
  await connectToDatabase();
  const expenses = await ExpenseModel.find(filters).sort({ expenseDate: -1, createdAt: -1 }).lean();
  return expenses.map(toExpense);
}

export async function createExpense(input: {
  amount: number;
  category: ExpenseCategory;
  description: string;
  expenseDate: string;
  shiftType: ShiftType;
  employeeId: string;
  shiftId?: string;
  username: string;
}) {
  if (getDataProvider() === 'mock') {
    const expense: ExpenseRecord = { ...input, id: `expense-${crypto.randomUUID()}`, createdAt: new Date().toISOString() };
    mockStore.expenses.unshift(expense);
    return { ...expense };
  }
  await connectToDatabase();
  const expense = await ExpenseModel.create({
    ...input,
    id: `expense-${crypto.randomUUID()}`,
    createdAt: new Date(),
  });
  return toExpense(expense.toObject());
}

export async function updateExpense(id: string, input: Partial<Pick<ExpenseRecord, 'amount' | 'category' | 'description' | 'expenseDate' | 'shiftType'>>) {
  if (getDataProvider() === 'mock') {
    const expense = mockStore.expenses.find((item) => item.id === id);
    if (!expense) return null;
    Object.assign(expense, input);
    return { ...expense };
  }
  await connectToDatabase();
  const expense = await ExpenseModel.findOneAndUpdate({ id }, { $set: input }, { new: true, runValidators: true }).lean();
  return expense ? toExpense(expense) : null;
}

export async function deleteExpense(id: string) {
  if (getDataProvider() === 'mock') {
    const index = mockStore.expenses.findIndex((expense) => expense.id === id);
    if (index < 0) return false;
    mockStore.expenses.splice(index, 1);
    return true;
  }
  await connectToDatabase();
  const result = await ExpenseModel.deleteOne({ id });
  return result.deletedCount === 1;
}

export function clearMockExpenses() {
  mockStore.expenses = [];
}
