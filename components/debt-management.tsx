'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DebtPayment, DebtRecord, DebtTotals } from '@/lib/debt-types';

type DebtFields = { person: string; originalAmount: string; debtDate: string; reason: string; description: string; notes: string };
type PaymentFields = { amount: string; paymentDate: string; description: string };
const today = () => new Date().toISOString().slice(0, 10);
const emptyDebt = (): DebtFields => ({ person: '', originalAmount: '', debtDate: today(), reason: '', description: '', notes: '' });
const emptyPayment = (): PaymentFields => ({ amount: '', paymentDate: today(), description: '' });
const inputClass = 'min-h-11 w-full rounded-xl border border-[#E5E3B2] bg-white px-3 py-2 text-sm';
const statusLabels = { UNPAID: 'غير مسددة', PARTIAL: 'مسددة جزئياً', PAID: 'مسددة' } as const;

function money(amount: number) {
  return `${amount.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
}

export default function DebtManagement() {
  const [debts, setDebts] = useState<DebtRecord[]>([]);
  const [totals, setTotals] = useState<DebtTotals | null>(null);
  const [form, setForm] = useState<DebtFields>(emptyDebt);
  const [editingDebt, setEditingDebt] = useState<DebtRecord | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentFields>(emptyPayment);
  const [paymentTarget, setPaymentTarget] = useState<string | null>(null);
  const [debtQuery, setDebtQuery] = useState('');
  const [debtStatusFilter, setDebtStatusFilter] = useState('');
  const [editingPayment, setEditingPayment] = useState<{ debtId: string; payment: DebtPayment } | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/dashboard/debts');
      const data = await response.json() as { debts?: DebtRecord[]; totals?: DebtTotals; error?: string };
      if (!response.ok) throw new Error(data.error || 'تعذر تحميل الديون');
      setDebts(data.debts ?? []);
      setTotals(data.totals ?? null);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل الديون');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const saveDebt = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/dashboard/debts', {
        method: editingDebt ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingDebt ? { id: editingDebt.id } : {}),
          ...form,
          originalAmount: Number(form.originalAmount),
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'تعذر حفظ الدين');
      setForm(emptyDebt());
      setEditingDebt(null);
      setMessage(editingDebt ? 'تم تحديث الدين.' : 'تم تسجيل الدين اليدوي.');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ الدين');
    } finally {
      setSaving(false);
    }
  };

  const removeDebt = async (debt: DebtRecord) => {
    if (!window.confirm(`حذف دين ${debt.person} وسجل دفعاته؟`)) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/dashboard/debts?id=${encodeURIComponent(debt.id)}`, { method: 'DELETE' });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'تعذر حذف الدين');
      setMessage('تم حذف الدين.');
      await load();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'تعذر حذف الدين');
    } finally {
      setSaving(false);
    }
  };

  const savePayment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!paymentTarget) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(
        editingPayment
          ? `/api/dashboard/debts/${encodeURIComponent(editingPayment.debtId)}/payments/${encodeURIComponent(editingPayment.payment.id)}`
          : `/api/dashboard/debts/${encodeURIComponent(paymentTarget)}/payments`,
        {
          method: editingPayment ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...paymentForm, amount: Number(paymentForm.amount) }),
        },
      );
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'تعذر حفظ الدفعة');
      setPaymentForm(emptyPayment());
      setPaymentTarget(null);
      setEditingPayment(null);
      setMessage(editingPayment ? 'تم تحديث الدفعة.' : 'تم تسجيل الدفعة.');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ الدفعة');
    } finally {
      setSaving(false);
    }
  };

  const removePayment = async (debtId: string, payment: DebtPayment) => {
    if (!window.confirm(`حذف دفعة ${money(payment.amount)}؟`)) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/dashboard/debts/${encodeURIComponent(debtId)}/payments/${encodeURIComponent(payment.id)}`, { method: 'DELETE' });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'تعذر حذف الدفعة');
      setMessage('تم حذف الدفعة.');
      await load();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'تعذر حذف الدفعة');
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (debt: DebtRecord) => {
    setEditingDebt(debt);
    setForm({
      person: debt.person,
      originalAmount: String(debt.originalAmount),
      debtDate: debt.debtDate,
      reason: debt.reason,
      description: debt.description,
      notes: debt.notes ?? '',
    });
  };

  const beginPayment = (debtId: string) => {
    setPaymentTarget(debtId);
    setEditingPayment(null);
    setPaymentForm(emptyPayment());
  };

  const beginEditPayment = (debtId: string, payment: DebtPayment) => {
    setPaymentTarget(debtId);
    setEditingPayment({ debtId, payment });
    setPaymentForm({ amount: String(payment.amount), paymentDate: payment.paymentDate, description: payment.description });
  };

  const q = debtQuery.trim().toLowerCase();
  const filteredDebts = debts.filter((debt) => {
    if (debtStatusFilter && debt.status !== debtStatusFilter) return false;
    if (q && !`${debt.person} ${debt.reason} ${debt.description} ${debt.notes ?? ''}`.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <section className="space-y-5" dir="rtl">
      <header className="rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5">
        <h2 className="text-xl font-bold text-[#232122]">المديونيات</h2>
        <p className="mt-1 text-sm leading-6 text-[#705331]">تُسجل الديون والدفعات يدويًا فقط، ولا تُنشأ ديون تلقائيًا من فواتير المشتريات.</p>
      </header>
      {message ? <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p> : null}
      {error ? <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

      {totals ? <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Summary label="إجمالي المديونيات" value={money(totals.originalAmount)} />
        <Summary label="إجمالي المبالغ المسددة" value={money(totals.paidAmount)} />
        <Summary label="إجمالي المبالغ المتبقية" value={money(totals.remainingAmount)} strong />
        <Summary label="عدد غير المسددة" value={String(totals.unpaidCount)} />
        <Summary label="عدد المسددة جزئياً" value={String(totals.partiallyPaidCount)} />
        <Summary label="عدد المديونيات المسددة" value={String(totals.paidCount)} />
      </dl> : null}

      <form onSubmit={(event) => void saveDebt(event)} className="grid gap-3 rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <h3 className="text-lg font-bold sm:col-span-2 lg:col-span-3">{editingDebt ? 'تعديل المديونية' : 'تسجيل مديونية يدوياً'}</h3>
        <label className="grid gap-1 text-xs font-semibold text-[#705331]">الشخص أو المورد<input required minLength={2} maxLength={200} value={form.person} onChange={(event) => setForm({ ...form, person: event.target.value })} className={inputClass} /></label>
        <label className="grid gap-1 text-xs font-semibold text-[#705331]">المبلغ الأصلي<input required min="0.01" max="10000000" step="0.01" type="number" value={form.originalAmount} onChange={(event) => setForm({ ...form, originalAmount: event.target.value })} className={inputClass} /></label>
        <label className="grid gap-1 text-xs font-semibold text-[#705331]">التاريخ<input required type="date" value={form.debtDate} onChange={(event) => setForm({ ...form, debtDate: event.target.value })} className={inputClass} /></label>
        <label className="grid gap-1 text-xs font-semibold text-[#705331]">السبب<input required minLength={2} maxLength={500} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} className={inputClass} /></label>
        <label className="grid gap-1 text-xs font-semibold text-[#705331]">الوصف<input required minLength={2} maxLength={500} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={inputClass} /></label>
        <label className="grid gap-1 text-xs font-semibold text-[#705331]">ملاحظات اختيارية<input maxLength={1000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={inputClass} /></label>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
          <button type="submit" disabled={saving} className="min-h-11 rounded-xl bg-[#6B8136] px-4 py-2 font-semibold text-white disabled:opacity-50">{saving ? 'جارٍ الحفظ…' : editingDebt ? 'حفظ التعديل' : 'تسجيل الدين'}</button>
          {editingDebt ? <button type="button" disabled={saving} onClick={() => { setEditingDebt(null); setForm(emptyDebt()); }} className="min-h-11 rounded-xl border border-[#E5E3B2] px-4 py-2 font-semibold">إلغاء التعديل</button> : null}
        </div>
      </form>

      <div className="space-y-3">
        <h3 className="font-bold text-[#232122]">سجل الديون</h3>
        <div className="grid gap-3 rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-4 sm:grid-cols-2">
          <h4 className="font-bold text-[#232122] sm:col-span-2">بحث وتصفية</h4>
          <input aria-label="بحث بالاسم أو الوصف" placeholder="بحث بالاسم أو الوصف" value={debtQuery} onChange={(event) => setDebtQuery(event.target.value)} className={inputClass} />
          <select aria-label="تصفية بالحالة" value={debtStatusFilter} onChange={(event) => setDebtStatusFilter(event.target.value)} className={inputClass}>
            <option value="">كل الحالات</option>
            <option value="PAID">مسددة</option>
            <option value="PARTIAL">مسددة جزئياً</option>
            <option value="UNPAID">غير مسددة</option>
          </select>
        </div>
        {loading ? <p className="rounded-xl bg-white/75 p-5 text-sm text-[#705331]">جارٍ تحميل السجل…</p> : filteredDebts.length ? filteredDebts.map((debt) => (
          <details key={debt.id} className="rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-4">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 text-sm">
              <span className="font-bold">{debt.person} · {debt.reason}</span><span>{debt.debtDate}</span>
              <span className="text-rose-700">متبقي {money(debt.remainingAmount)}</span>
              <span className="rounded-full bg-[#FCF5ED] px-3 py-1 text-xs">{statusLabels[debt.status]}</span>
            </summary>
            <div className="mt-4 space-y-4 border-t border-[#ecebd6] pt-4">
              <p className="text-sm text-[#705331]">{debt.description}{debt.notes ? ` · ${debt.notes}` : ''} — أصل الدين {money(debt.originalAmount)} — المسدد {money(debt.totalPaid)}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={saving} onClick={() => beginEdit(debt)} className="rounded-lg border border-[#E5E3B2] px-3 py-2 text-xs font-semibold text-[#536342]">تعديل</button>
                <button type="button" disabled={saving} onClick={() => void removeDebt(debt)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs text-rose-700">حذف الدين</button>
                <button type="button" disabled={saving} onClick={() => beginPayment(debt.id)} className="rounded-lg bg-[#6B8136] px-3 py-2 text-xs font-semibold text-white">＋ تسجيل دفعة</button>
              </div>
              {paymentTarget === debt.id ? (
                <form onSubmit={(event) => void savePayment(event)} className="grid gap-3 rounded-xl bg-[#f7f7f0] p-4 sm:grid-cols-3">
                  <h4 className="font-bold sm:col-span-3">{editingPayment ? 'تعديل دفعة' : 'تسجيل دفعة جديدة'}</h4>
                  <label className="grid gap-1 text-xs font-semibold">المبلغ<input required min="0.01" max="10000000" step="0.01" type="number" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} className={inputClass} /></label>
                  <label className="grid gap-1 text-xs font-semibold">التاريخ<input required type="date" value={paymentForm.paymentDate} onChange={(event) => setPaymentForm({ ...paymentForm, paymentDate: event.target.value })} className={inputClass} /></label>
                  <label className="grid gap-1 text-xs font-semibold">الوصف<input required minLength={2} maxLength={500} value={paymentForm.description} onChange={(event) => setPaymentForm({ ...paymentForm, description: event.target.value })} className={inputClass} /></label>
                  <div className="flex gap-2 sm:col-span-3">
                    <button type="submit" disabled={saving} className="rounded-xl bg-[#6B8136] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{editingPayment ? 'حفظ الدفعة' : 'تسجيل الدفعة'}</button>
                    <button type="button" onClick={() => { setPaymentTarget(null); setEditingPayment(null); }} className="rounded-xl border border-[#E5E3B2] px-4 py-2 text-sm">إلغاء</button>
                  </div>
                </form>
              ) : null}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-right text-sm">
                  <thead><tr className="border-b border-[#E5E3B2] text-[#705331]"><th className="px-2 py-2">التاريخ</th><th className="px-2 py-2">الوصف</th><th className="px-2 py-2">المبلغ</th><th className="px-2 py-2">الإجراءات</th></tr></thead>
                  <tbody>{debt.payments.length ? debt.payments.map((payment) => <tr key={payment.id} className="border-b border-[#ecebd6]">
                    <td className="px-2 py-2">{payment.paymentDate}</td><td className="px-2 py-2">{payment.description}</td><td className="px-2 py-2">{money(payment.amount)}</td>
                    <td className="flex gap-2 px-2 py-2"><button type="button" disabled={saving} onClick={() => beginEditPayment(debt.id, payment)} className="text-[#536342]">تعديل</button><button type="button" disabled={saving} onClick={() => void removePayment(debt.id, payment)} className="text-rose-700">حذف</button></td>
                  </tr>) : <tr><td colSpan={4} className="px-2 py-3 text-[#705331]">لا توجد دفعات مسجلة.</td></tr>}</tbody>
                </table>
              </div>
            </div>
          </details>
        )) : <p className="rounded-xl bg-white/75 p-5 text-sm text-[#705331]">{debts.length ? 'مفيش نتايج بالفلتر ده.' : 'لا توجد ديون مسجلة.'}</p>}
      </div>
    </section>
  );
}

function Summary({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="rounded-xl bg-white/75 p-4"><dt className="text-xs text-[#705331]">{label}</dt><dd className={`mt-1 text-lg ${strong ? 'font-bold text-rose-700' : 'font-semibold text-[#232122]'}`}>{value}</dd></div>;
}
