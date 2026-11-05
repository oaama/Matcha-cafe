import mongoose, { Schema } from 'mongoose';
import { connectToDatabase } from './database';
import type { ExpenseCategory, ExpenseRecord, ShiftType } from './staff-types';

type ExpenseDocument = Omit<ExpenseRecord, 'createdAt'> & { createdAt: Date };

const expenseSchema = new Schema<ExpenseDocument>({
  id: { type: String, required: true, unique: true },
  amount: { type: Number, required: true, min: 0.01 },
  category: { type: String, enum: ['ELECTRICITY', 'WATER', 'FOOD', 'SUPPLIES', 'MAINTENANCE', 'RENT', 'OTHER'], required: true },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  expenseDate: { type: String, required: true, index: true },
  shiftType: { type: String, enum: ['DAY', 'NIGHT'], required: true },
  employeeId: { type: String, required: true, index: true },
  username: { type: String, required: true },
  createdAt: { type: Date, required: true, immutable: true },
}, { versionKey: false, collection: 'cafe_expenses' });

const ExpenseModel = (mongoose.models.CafeExpense as mongoose.Model<ExpenseDocument> | undefined)
  ?? mongoose.model<ExpenseDocument>('CafeExpense', expenseSchema);

function toExpense(document: ExpenseDocument): ExpenseRecord {
  return { ...document, createdAt: document.createdAt.toISOString() };
}

export async function listExpenses(filters: { expenseDate?: string; employeeId?: string } = {}) {
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
  username: string;
}) {
  await connectToDatabase();
  const expense = await ExpenseModel.create({
    ...input,
    id: `expense-${crypto.randomUUID()}`,
    createdAt: new Date(),
  });
  return toExpense(expense.toObject());
}

export async function updateExpense(id: string, input: Partial<Pick<ExpenseRecord, 'amount' | 'category' | 'description' | 'expenseDate' | 'shiftType'>>) {
  await connectToDatabase();
  const expense = await ExpenseModel.findOneAndUpdate({ id }, { $set: input }, { new: true, runValidators: true }).lean();
  return expense ? toExpense(expense) : null;
}

export async function deleteExpense(id: string) {
  await connectToDatabase();
  const result = await ExpenseModel.deleteOne({ id });
  return result.deletedCount === 1;
}
