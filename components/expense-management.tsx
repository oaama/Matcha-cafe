'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ExpenseCategory, ExpenseRecord, ShiftRecord, StaffIdentity, ShiftType } from '@/lib/staff-types';

const categoryLabels: Record<ExpenseCategory, string> = {
  ELECTRICITY: 'كهرباء',
  WATER: 'مياه',
  FOOD: 'أكل وخامات',
  SUPPLIES: 'مستلزمات',
  MAINTENANCE: 'صيانة',
  RENT: 'إيجار',
  OTHER: 'أخرى',
};

export default function ExpenseManagement({ staff, activeShift }: { staff: StaffIdentity; activeShift: ShiftRecord | null }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [form, setForm] = useState({ amount: '', category: 'FOOD' as ExpenseCategory, description: '', shiftType: staff.shiftType as ShiftType });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
  const [editForm, setEditForm] = useState({ amount: '', category: 'FOOD' as ExpenseCategory, description: '', expenseDate: today, shiftType: staff.shiftType as ShiftType });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/dashboard/expenses?date=${encodeURIComponent(date)}`);
    const data = await response.json() as { expenses?: ExpenseRecord[]; error?: string };
    if (!response.ok) throw new Error(data.error || 'تعذر تحميل المصروفات');
    setExpenses(data.expenses ?? []);
  }, [date]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load().catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل المصروفات'));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const total = useMemo(() => expenses.reduce((sum, expense) => sum + expense.amount, 0), [expenses]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const response = await fetch('/api/dashboard/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount), expenseDate: date }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        setError(data.error || 'تعذر حفظ المصروف');
        return;
      }
      setForm({ amount: '', category: 'FOOD', description: '', shiftType: staff.shiftType });
      setMessage('تم تسجيل المصروف.');
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'تعذر الاتصال بالخادم أثناء حفظ المصروف');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('حذف هذا المصروف؟')) return;
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const response = await fetch(`/api/dashboard/expenses?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        setError(data.error || 'تعذر حذف المصروف');
        return;
      }
      await load();
      setMessage('تم حذف المصروف.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'تعذر الاتصال بالخادم أثناء حذف المصروف');
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (expense: ExpenseRecord) => {
    setError('');
    setMessage('');
    setEditingExpense(expense);
    setEditForm({
      amount: String(expense.amount),
      category: expense.category,
      description: expense.description,
      expenseDate: expense.expenseDate,
      shiftType: expense.shiftType,
    });
  };

  const saveEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingExpense || saving) return;
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const response = await fetch('/api/dashboard/expenses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingExpense.id, ...editForm, amount: Number(editForm.amount) }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        setError(data.error || 'تعذر تحديث المصروف');
        return;
      }
      setEditingExpense(null);
      setMessage('تم تحديث المصروف.');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر الاتصال بالخادم أثناء تحديث المصروف');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5">
        <div><h2 className="text-xl font-bold text-[#232122]">أجندة المصروفات</h2><p className="mt-1 text-sm text-[#705331]">تابع مصروفات اليوم والشفت وسجل كل حركة.</p>{staff.role === 'EMPLOYEE' ? <p className="mt-1 text-xs text-[#647b77]">{activeShift ? `سيُسجل المصروف على شيفت ${activeShift.shiftType === 'DAY' ? 'النهار' : 'الليل'} الحالي.` : 'ابدأ الشيفت قبل تسجيل المصروف.'}</p> : null}</div>
        <label className="text-sm font-semibold text-[#705331]">اليوم<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 block rounded-xl border-[#E5E3B2]" /></label>
      </div>
      <form onSubmit={create} className="grid min-w-0 grid-cols-1 gap-3 rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5 sm:grid-cols-2 lg:grid-cols-5">
        <input className="w-full min-w-0" required min="0.01" step="0.01" type="number" placeholder="المبلغ" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
        <select className="w-full min-w-0" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as ExpenseCategory })}>{Object.entries(categoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <input className="w-full min-w-0" required placeholder="البيان / السبب" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        {staff.role === 'ADMIN' ? <select className="w-full min-w-0" aria-label="الشيفت" value={form.shiftType} onChange={(event) => setForm({ ...form, shiftType: event.target.value as ShiftType })}><option value="DAY">نهاري</option><option value="NIGHT">ليلي</option></select> : null}
        <button type="submit" disabled={saving || (staff.role === 'EMPLOYEE' && !activeShift)} className="w-full min-w-0 rounded-xl bg-[#6B8136] px-4 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">تسجيل مصروف</button>
        {message ? <p className="text-sm text-[#6B8136] sm:col-span-2 lg:col-span-5">{message}</p> : null}
        {error ? <p role="alert" className="text-sm text-rose-700 sm:col-span-2 lg:col-span-5">{error}</p> : null}
      </form>
      <div className="rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5">
        <div className="mb-4 flex items-center justify-between"><h3 className="font-bold text-[#232122]">مصروفات {date}</h3><strong className="rounded-xl bg-[#FCF5ED] px-3 py-2 text-[#705331]">{total.toFixed(2)} جنيه</strong></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-right text-sm"><thead className="border-b border-[#E5E3B2] text-[#705331]"><tr><th className="px-3 py-3">النوع</th><th className="px-3 py-3">البيان</th><th className="px-3 py-3">الشفت</th><th className="px-3 py-3">الموظف</th><th className="px-3 py-3">المبلغ</th>{staff.role === 'ADMIN' ? <th className="px-3 py-3">إجراء</th> : null}</tr></thead><tbody>{expenses.map((expense) => <tr key={expense.id} className="border-b border-[#E5E3B2]"><td className="px-3 py-3">{categoryLabels[expense.category]}</td><td className="px-3 py-3">{expense.description}</td><td className="px-3 py-3">{expense.shiftType === 'DAY' ? 'نهاري' : 'ليلي'}</td><td className="px-3 py-3">{expense.username}</td><td className="px-3 py-3 font-semibold">{expense.amount.toFixed(2)}</td>{staff.role === 'ADMIN' ? <td className="px-3 py-3"><div className="flex gap-2"><button type="button" disabled={saving} onClick={() => beginEdit(expense)} className="rounded-lg border border-[#E5E3B2] px-3 py-1.5 text-xs font-semibold text-[#6B8136] disabled:opacity-50">تعديل</button><button type="button" disabled={saving} onClick={() => void remove(expense.id)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-700 disabled:opacity-50">حذف</button></div></td> : null}</tr>)}</tbody></table></div>
      </div>
      {editingExpense ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#183a36]/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="edit-expense-title">
          <form onSubmit={(event) => void saveEdit(event)} className="w-full max-w-lg space-y-4 rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between gap-3">
              <h3 id="edit-expense-title" className="text-lg font-bold">تعديل المصروف</h3>
              <button type="button" disabled={saving} onClick={() => setEditingExpense(null)} className="min-h-10 rounded-lg px-3 text-xl" aria-label="إغلاق">×</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold">المبلغ<input required min="0.01" step="0.01" type="number" value={editForm.amount} onChange={(event) => setEditForm({ ...editForm, amount: event.target.value })} /></label>
              <label className="grid gap-1 text-sm font-semibold">النوع<select value={editForm.category} onChange={(event) => setEditForm({ ...editForm, category: event.target.value as ExpenseCategory })}>{Object.entries(categoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              <label className="grid gap-1 text-sm font-semibold sm:col-span-2">البيان<input required minLength={2} maxLength={500} value={editForm.description} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} /></label>
              <label className="grid gap-1 text-sm font-semibold">التاريخ<input required type="date" value={editForm.expenseDate} onChange={(event) => setEditForm({ ...editForm, expenseDate: event.target.value })} /></label>
              <label className="grid gap-1 text-sm font-semibold">الوردية<select value={editForm.shiftType} onChange={(event) => setEditForm({ ...editForm, shiftType: event.target.value as ShiftType })}><option value="DAY">نهاري</option><option value="NIGHT">ليلي</option></select></label>
            </div>
            {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" disabled={saving} onClick={() => setEditingExpense(null)} className="min-h-11 rounded-xl border border-[#E5E3B2] px-4 py-2 font-semibold disabled:opacity-50">إلغاء</button>
              <button type="submit" disabled={saving} className="min-h-11 rounded-xl bg-[#6B8136] px-4 py-2 font-semibold text-white disabled:opacity-50">{saving ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}</button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
