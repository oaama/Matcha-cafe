import { describe, expect, it } from 'vitest';
import type { ShiftRecord } from './staff-types';
import type { PayrollAdvance, PayrollOvertimeEntry, PayrollProfile } from './payroll-types';
import { calculatePayrollStatement } from './payroll-statement';

const profile: PayrollProfile = {
  jobTitle: 'Barista',
  hourlyRate: 20,
  hireDate: '2025-01-01',
  additionalInfo: '',
};

const shifts: ShiftRecord[] = [{
  id: 'shift-1',
  employeeId: 'staff-1',
  username: 'worker',
  shiftType: 'DAY',
  startedAt: '2026-04-10T08:00:00.000Z',
  endedAt: '2026-04-10T17:00:00.000Z',
  periods: [
    { startedAt: '2026-04-10T08:00:00.000Z', endedAt: '2026-04-10T12:00:00.000Z' },
    { startedAt: '2026-04-10T13:00:00.000Z', endedAt: '2026-04-10T17:00:00.000Z' },
  ],
}];

describe('calculatePayrollStatement', () => {
  it('uses recorded work periods, adds manual overtime, and subtracts advances once', () => {
    const advances: PayrollAdvance[] = [
      { id: 'advance-1', amount: 15, date: '2026-04-10', description: 'Travel', createdAt: '' },
      { id: 'advance-2', amount: 5, date: '2026-04-15', description: 'Meal', createdAt: '' },
      { id: 'advance-outside', amount: 99, date: '2026-05-01', description: 'Outside range', createdAt: '' },
    ];
    const overtimeEntries: PayrollOvertimeEntry[] = [
      { id: 'ot-1', date: '2026-04-11', hours: 2, hourlyRate: 30, description: 'Closing', createdAt: '' },
      { id: 'ot-2', date: '2026-04-15', hours: 1, hourlyRate: 25, description: 'Event', createdAt: '' },
      { id: 'ot-outside', date: '2026-05-01', hours: 8, hourlyRate: 50, description: 'Outside range', createdAt: '' },
    ];

    const statement = calculatePayrollStatement({
      employeeId: 'staff-1',
      profile,
      shifts,
      advances,
      overtimeEntries,
      startDate: '2026-04-10',
      endDate: '2026-04-30',
      now: new Date('2026-04-30T12:00:00.000Z'),
    });

    expect(statement.regularHours).toBe(8);
    expect(statement.baseWages).toBe(160);
    expect(statement.overtimeHours).toBe(3);
    expect(statement.overtimeEarnings).toBe(85);
    expect(statement.totalAdvances).toBe(20);
    expect(statement.netPay).toBe(225);
    expect(statement.advances).toHaveLength(2);
    expect(statement.overtimeEntries).toHaveLength(2);
  });

  it('clips night work to Cairo calendar dates and ignores breaks in periods', () => {
    const statement = calculatePayrollStatement({
      employeeId: 'staff-1',
      profile,
      shifts: [{
        ...shifts[0],
        startedAt: '2026-04-10T21:00:00.000Z',
        endedAt: '2026-04-11T03:00:00.000Z',
        periods: [{ startedAt: '2026-04-10T21:00:00.000Z', endedAt: '2026-04-11T03:00:00.000Z' }],
      }],
      advances: [],
      overtimeEntries: [],
      startDate: '2026-04-10',
      endDate: '2026-04-10',
    });

    expect(statement.regularHours).toBe(1);
    expect(statement.baseWages).toBe(20);
  });

  it('rejects reversed date ranges', () => {
    expect(() => calculatePayrollStatement({
      employeeId: 'staff-1',
      profile,
      shifts: [],
      advances: [],
      overtimeEntries: [],
      startDate: '2026-04-11',
      endDate: '2026-04-10',
    })).toThrow('Invalid payroll statement date range');
  });
});
