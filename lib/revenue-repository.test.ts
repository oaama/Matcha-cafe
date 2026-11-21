import { beforeEach, describe, expect, it } from 'vitest';
import { clearMockActivityLogs, listActivityLogs } from './activity-log-repository';
import {
  clearMockManualRevenue,
  createManualRevenue,
  deleteManualRevenue,
  listManualRevenue,
  updateManualRevenue,
} from './revenue-repository';

describe('mock manual shift revenue repository', () => {
  beforeEach(() => {
    process.env.DATA_PROVIDER = 'mock';
    clearMockManualRevenue();
    clearMockActivityLogs();
  });

  it('stores revenue separately by shift, filters date ranges, and records edits and deletes', async () => {
    const actor = { id: 'employee-1', username: 'Employee One' };
    const created = await createManualRevenue({
      amount: 125.5,
      date: '2026-03-10',
      description: 'مبيعات يدوية',
      shiftId: 'shift-1',
      shiftType: 'DAY',
      employeeId: actor.id,
      username: actor.username,
    }, actor);
    await createManualRevenue({
      amount: 50,
      date: '2026-03-11',
      description: 'دخل إضافي',
      shiftId: 'shift-2',
      shiftType: 'NIGHT',
      employeeId: 'employee-2',
      username: 'Employee Two',
    }, { id: 'admin-1', username: 'Admin' });

    expect(await listManualRevenue({ from: '2026-03-10', to: '2026-03-10', shiftId: 'shift-1' })).toMatchObject([
      { amount: 125.5, shiftId: 'shift-1', createdBy: actor.username },
    ]);
    expect(await updateManualRevenue(created.id, { amount: 100 }, { id: 'admin-1', username: 'Admin' })).toMatchObject({ amount: 100 });
    expect(await listActivityLogs({ entityType: 'manual-revenue', entityId: created.id })).toHaveLength(2);
    expect(await deleteManualRevenue(created.id, { id: 'admin-1', username: 'Admin' })).toBe(true);
    expect(await listManualRevenue({ shiftId: 'shift-1' })).toEqual([]);
  });
});
