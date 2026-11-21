import { beforeEach, describe, expect, it } from 'vitest';
import { clearMockActivityLogs, listActivityLogs } from './activity-log-repository';
import {
  addDebtPayment,
  clearMockDebts,
  createDebt,
  deleteDebt,
  deleteDebtPayment,
  listDebts,
  updateDebt,
  updateDebtPayment,
} from './debt-repository';

describe('mock debt repository', () => {
  beforeEach(() => {
    process.env.DATA_PROVIDER = 'mock';
    clearMockDebts();
    clearMockActivityLogs();
  });

  it('records manual debt and payment history, updates debt details, and removes payments and debts', async () => {
    const actor = { id: 'admin-debt-test', username: 'Debt Admin' };
    const debt = await createDebt({
      person: 'Tea supplier',
      originalAmount: 250,
      debtDate: '2026-01-15',
      reason: 'Wholesale order',
      description: 'January tea delivery',
      notes: 'Pay in installments',
    }, actor);

    expect(debt.status).toBe('UNPAID');
    expect(debt.remainingAmount).toBe(250);

    const afterFirst = await addDebtPayment(debt.id, {
      amount: 100,
      paymentDate: '2026-01-20',
      description: 'First installment',
    }, actor);
    expect(afterFirst?.payments).toHaveLength(1);
    expect(afterFirst?.totalPaid).toBe(100);
    expect(afterFirst?.remainingAmount).toBe(150);
    expect(afterFirst?.status).toBe('PARTIAL');

    const paymentId = afterFirst!.payments[0].id;
    const afterEdit = await updateDebtPayment(debt.id, paymentId, { amount: 150 }, actor);
    expect(afterEdit?.totalPaid).toBe(150);
    expect(afterEdit?.remainingAmount).toBe(100);
    expect(afterEdit?.payments[0].description).toBe('First installment');

    const updatedDebt = await updateDebt(debt.id, { description: 'Revised delivery note' }, actor);
    expect(updatedDebt?.description).toBe('Revised delivery note');
    expect(updatedDebt?.remainingAmount).toBe(100);

    const afterDeletePayment = await deleteDebtPayment(debt.id, paymentId, actor);
    expect(afterDeletePayment?.status).toBe('UNPAID');
    expect(afterDeletePayment?.remainingAmount).toBe(250);

    const listed = await listDebts();
    expect(listed.debts).toHaveLength(1);
    expect(listed.totals).toMatchObject({ originalAmount: 250, paidAmount: 0, remainingAmount: 250, unpaidCount: 1 });
    expect(await deleteDebt(debt.id, actor)).toBe(true);
    expect((await listDebts()).debts).toHaveLength(0);
    expect(await listActivityLogs({ entityType: 'manual-debt' })).toHaveLength(6);
  });

  it('rejects overpayment and keeps exact remaining balances and payment statuses', async () => {
    const debt = await createDebt({
      person: 'Local supplier',
      originalAmount: 0.3,
      debtDate: '2026-02-01',
      reason: 'Supplies',
      description: 'Cups and lids',
    });
    const partial = await addDebtPayment(debt.id, {
      amount: 0.1,
      paymentDate: '2026-02-02',
      description: 'Cash installment',
    });
    expect(partial?.remainingAmount).toBe(0.2);
    expect(partial?.status).toBe('PARTIAL');

    await expect(updateDebtPayment(debt.id, partial!.payments[0].id, { amount: 0.31 }))
      .rejects.toMatchObject({ code: 'OVERPAYMENT' });
    await expect(addDebtPayment(debt.id, {
      amount: 0.21,
      paymentDate: '2026-02-03',
      description: 'Over balance',
    })).rejects.toMatchObject({ code: 'OVERPAYMENT' });

    const paid = await addDebtPayment(debt.id, {
      amount: 0.2,
      paymentDate: '2026-02-04',
      description: 'Final installment',
    });
    expect(paid?.totalPaid).toBe(0.3);
    expect(paid?.remainingAmount).toBe(0);
    expect(paid?.status).toBe('PAID');
    await expect(updateDebt(debt.id, { originalAmount: 0.28 })).rejects.toMatchObject({ code: 'BELOW_PAID_AMOUNT' });
    expect((await listDebts()).totals).toMatchObject({ paidAmount: 0.3, remainingAmount: 0, paidCount: 1 });
  });
});
