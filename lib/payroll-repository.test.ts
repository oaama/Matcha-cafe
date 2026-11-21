import { beforeEach, describe, expect, it } from 'vitest';
import { clearMockActivityLogs, listActivityLogs } from './activity-log-repository';
import {
  clearMockPayroll,
  createPayrollAdvance,
  createPayrollOvertime,
  deletePayrollAdvance,
  getPayrollRecord,
  getPayrollStatement,
  updatePayrollProfile,
} from './payroll-repository';

describe('mock payroll repository', () => {
  beforeEach(() => {
    process.env.DATA_PROVIDER = 'mock';
    clearMockPayroll();
    clearMockActivityLogs();
  });

  it('keeps multiple advances and overtime entries distinct in the statement', async () => {
    const actor = { id: 'admin-payroll-test', username: 'Payroll Admin' };
    await updatePayrollProfile('payroll-test-staff', {
      jobTitle: 'Barista',
      hourlyRate: 18,
      hireDate: '2025-03-01',
      additionalInfo: 'Part-time',
    }, actor);
    await createPayrollAdvance('payroll-test-staff', { amount: 40, date: '2026-04-10', description: 'Transport' }, actor);
    const secondAdvance = await createPayrollAdvance('payroll-test-staff', { amount: 10, date: '2026-04-11', description: 'Meal' }, actor);
    await createPayrollOvertime('payroll-test-staff', { date: '2026-04-10', hours: 2, hourlyRate: 25, description: 'Closing' }, actor);
    await createPayrollOvertime('payroll-test-staff', { date: '2026-04-12', hours: 1.5, hourlyRate: 30, description: 'Event' }, actor);

    const statement = await getPayrollStatement('payroll-test-staff', '2026-04-01', '2026-04-30');

    expect(statement.regularHours).toBe(0);
    expect(statement.overtimeHours).toBe(3.5);
    expect(statement.overtimeEarnings).toBe(95);
    expect(statement.totalAdvances).toBe(50);
    expect(statement.netPay).toBe(45);
    expect(await deletePayrollAdvance('payroll-test-staff', secondAdvance.id, actor)).toBe(true);
    expect((await getPayrollRecord('payroll-test-staff')).advances).toHaveLength(1);
    expect(await listActivityLogs({ entityType: 'payroll', entityId: 'payroll-test-staff' })).toHaveLength(6);
  });
});
