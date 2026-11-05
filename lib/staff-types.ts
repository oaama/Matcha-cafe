export type StaffRole = 'ADMIN' | 'EMPLOYEE';
export type ShiftType = 'DAY' | 'NIGHT';

export type StaffIdentity = {
  id: string;
  username: string;
  email: string;
  role: StaffRole;
  shiftType: ShiftType;
  active: boolean;
};

export type ShiftRecord = {
  id: string;
  employeeId: string;
  username: string;
  shiftType: ShiftType;
  startedAt: string;
  endedAt?: string;
  totalMinutes?: number;
};

export type ExpenseCategory = 'ELECTRICITY' | 'WATER' | 'FOOD' | 'SUPPLIES' | 'MAINTENANCE' | 'RENT' | 'OTHER';

export type ExpenseRecord = {
  id: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
  expenseDate: string;
  shiftType: ShiftType;
  employeeId: string;
  username: string;
  createdAt: string;
};
