import type { ShiftType } from './staff-types';

export type ManualRevenueRecord = {
  id: string;
  amount: number;
  date: string;
  description: string;
  shiftId: string;
  shiftType: ShiftType;
  employeeId: string;
  username: string;
  createdById?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};
