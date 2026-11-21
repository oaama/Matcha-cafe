import { z } from 'zod';

const isValidDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const dateSchema = z.string().refine(isValidDate, 'Date must be a valid YYYY-MM-DD value');
const amountSchema = z.number()
  .finite()
  .positive()
  .max(10_000_000)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8, 'Amount may have at most two decimal places');

export const debtFieldsSchema = z.object({
  person: z.string().trim().min(2).max(200),
  originalAmount: amountSchema,
  debtDate: dateSchema,
  reason: z.string().trim().min(2).max(500),
  description: z.string().trim().min(2).max(500),
  notes: z.string().trim().max(1000).optional(),
});

export const createDebtSchema = debtFieldsSchema;
export const updateDebtSchema = debtFieldsSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one debt field is required',
);

export const debtPaymentFieldsSchema = z.object({
  amount: amountSchema,
  paymentDate: dateSchema,
  description: z.string().trim().min(2).max(500),
});

export const createDebtPaymentSchema = debtPaymentFieldsSchema;
export const updateDebtPaymentSchema = debtPaymentFieldsSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one payment field is required',
);

export type CreateDebtInput = z.infer<typeof createDebtSchema>;
export type UpdateDebtInput = z.infer<typeof updateDebtSchema>;
export type CreateDebtPaymentInput = z.infer<typeof createDebtPaymentSchema>;
export type UpdateDebtPaymentInput = z.infer<typeof updateDebtPaymentSchema>;
