import type { StaffIdentity } from './staff-types';

export type PayrollProfile = {
  jobTitle: string;
  hourlyRate: number;
  hireDate: string;
  additionalInfo: string;
};

export type PayrollAdvance = {
  id: string;
  amount: number;
  date: string;
  description: string;
  createdAt: string;
};

export type PayrollOvertimeEntry = {
  id: string;
  date: string;
  hours: number;
  hourlyRate: number;
  description: string;
  createdAt: string;
};

export type PayrollRecord = {
  employeeId: string;
  profile: PayrollProfile;
  advances: PayrollAdvance[];
  overtimeEntries: PayrollOvertimeEntry[];
};

export type PayrollEmployee = Pick<StaffIdentity, 'id' | 'username' | 'email' | 'active'> & {
  profile: PayrollProfile;
};

export type PayrollStatement = {
  employeeId: string;
  startDate: string;
  endDate: string;
  regularHours: number;
  hourlyRate: number;
  baseWages: number;
  overtimeHours: number;
  overtimeEarnings: number;
  totalAdvances: number;
  netPay: number;
  advances: PayrollAdvance[];
  overtimeEntries: PayrollOvertimeEntry[];
};

export const EMPTY_PAYROLL_PROFILE: PayrollProfile = {
  jobTitle: '',
  hourlyRate: 0,
  hireDate: '',
  additionalInfo: '',
};
