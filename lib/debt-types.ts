export type DebtStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

export type DebtPayment = {
  id: string;
  amount: number;
  paymentDate: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type DebtRecord = {
  id: string;
  person: string;
  originalAmount: number;
  debtDate: string;
  reason: string;
  description: string;
  notes?: string;
  payments: DebtPayment[];
  totalPaid: number;
  remainingAmount: number;
  status: DebtStatus;
  createdAt: string;
  updatedAt: string;
};

export type DebtTotals = {
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  unpaidCount: number;
  partiallyPaidCount: number;
  paidCount: number;
};
