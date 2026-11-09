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
  };

  const remove = async (id: string) => {
    if (!window.confirm('حذف هذا المصروف؟')) return;
    const response = await fetch(`/api/dashboard/expenses?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok) {
      const data = await response.json() as { error?: string };
      setError(data.error || 'تعذر حذف المصروف');
      return;
    }
    await load();
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5">
        <div><h2 className="text-xl font-bold text-[#232122]">أجندة المصروفات</h2><p className="mt-1 text-sm text-[#705331]">تابع مصروفات اليوم والشفت وسجل كل حركة.</p>{staff.role === 'EMPLOYEE' ? <p className="mt-1 text-xs text-[#647b77]">{activeShift ? `سيُسجل المصروف على شيفت ${activeShift.shiftType === 'DAY' ? 'النهار' : 'الليل'} الحالي.` : 'ابدأ الشيفت قبل تسجيل المصروف.'}</p> : null}</div>
        <label className="text-sm font-semibold text-[#705331]">اليوم<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 block rounded-xl border-[#E5E3B2]" /></label>
      </div>
      <form onSubmit={create} className="grid gap-3 rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5 sm:grid-cols-2 lg:grid-cols-5">
        <input required min="0.01" step="0.01" type="number" placeholder="المبلغ" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
        <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as ExpenseCategory })}>{Object.entries(categoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <input required placeholder="البيان / السبب" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        {staff.role === 'ADMIN' ? <select aria-label="الشيفت" value={form.shiftType} onChange={(event) => setForm({ ...form, shiftType: event.target.value as ShiftType })}><option value="DAY">نهاري</option><option value="NIGHT">ليلي</option></select> : null}
        <button type="submit" disabled={staff.role === 'EMPLOYEE' && !activeShift} className="rounded-xl bg-[#6B8136] px-4 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">تسجيل مصروف</button>
        {message ? <p className="text-sm text-[#6B8136] sm:col-span-2 lg:col-span-5">{message}</p> : null}
        {error ? <p role="alert" className="text-sm text-rose-700 sm:col-span-2 lg:col-span-5">{error}</p> : null}
      </form>
      <div className="rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5">
        <div className="mb-4 flex items-center justify-between"><h3 className="font-bold text-[#232122]">مصروفات {date}</h3><strong className="rounded-xl bg-[#FCF5ED] px-3 py-2 text-[#705331]">{total.toFixed(2)} جنيه</strong></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-right text-sm"><thead className="border-b border-[#E5E3B2] text-[#705331]"><tr><th className="px-3 py-3">النوع</th><th className="px-3 py-3">البيان</th><th className="px-3 py-3">الشفت</th><th className="px-3 py-3">الموظف</th><th className="px-3 py-3">المبلغ</th>{staff.role === 'ADMIN' ? <th className="px-3 py-3">إجراء</th> : null}</tr></thead><tbody>{expenses.map((expense) => <tr key={expense.id} className="border-b border-[#E5E3B2]"><td className="px-3 py-3">{categoryLabels[expense.category]}</td><td className="px-3 py-3">{expense.description}</td><td className="px-3 py-3">{expense.shiftType === 'DAY' ? 'نهاري' : 'ليلي'}</td><td className="px-3 py-3">{expense.username}</td><td className="px-3 py-3 font-semibold">{expense.amount.toFixed(2)}</td>{staff.role === 'ADMIN' ? <td className="px-3 py-3"><button type="button" onClick={() => void remove(expense.id)} className="text-rose-700">حذف</button></td> : null}</tr>)}</tbody></table></div>
      </div>
    </section>
  );
}
