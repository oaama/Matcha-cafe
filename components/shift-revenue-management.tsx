'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCurrentWorkDay } from '@/lib/shift-time';
import type { ManualRevenueRecord } from '@/lib/revenue-types';
import type { ShiftRecord, StaffIdentity } from '@/lib/staff-types';

type RevenueFields = { amount: string; date: string; description: string };
const inputClass = 'min-h-11 w-full rounded-xl border border-[#E5E3B2] bg-white px-3 py-2 text-sm';
const today = () => getCurrentWorkDay();
const firstOfMonth = () => `${today().slice(0, 7)}-01`;
const emptyFields = (): RevenueFields => ({ amount: '', date: today(), description: '' });

function money(value: number) {
  return `${value.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
}

export default function ShiftRevenueManagement({
  staff,
  activeShift,
  shifts,
}: {
  staff: StaffIdentity;
  activeShift: ShiftRecord | null;
  shifts: ShiftRecord[];
}) {
  const [records, setRecords] = useState<ManualRevenueRecord[]>([]);
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [fields, setFields] = useState<RevenueFields>(emptyFields);
  const [selectedShift, setSelectedShift] = useState('');
  const [editing, setEditing] = useState<ManualRevenueRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      const response = await fetch(`/api/dashboard/revenue?${params}`);
      const data = await response.json() as { revenues?: ManualRevenueRecord[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'تعذر تحميل الإيرادات اليدوية');
      setRecords(data.revenues ?? []);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل الإيرادات اليدوية');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const monthTotal = useMemo(() => records.reduce((sum, record) => sum + record.amount, 0), [records]);
  const todayTotal = useMemo(() => records.filter((record) => record.date === today())
    .reduce((sum, record) => sum + record.amount, 0), [records]);
  const perShift = useMemo(() => Object.values(records.reduce<Record<string, { id: string; username: string; shiftType: string; amount: number }>>((result, record) => {
    const item = result[record.shiftId] ?? { id: record.shiftId, username: record.username, shiftType: record.shiftType, amount: 0 };
    item.amount = Math.round((item.amount + record.amount) * 100) / 100;
    result[record.shiftId] = item;
    return result;
  }, {})), [records]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const shiftId = selectedShift || shifts[0]?.id || '';
    if (saving || (staff.role === 'ADMIN' && !shiftId)) {
      if (staff.role === 'ADMIN' && !shiftId) setError('لا توجد شيفتات مسجلة لاختيارها.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/dashboard/revenue', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editing ? { id: editing.id } : staff.role === 'ADMIN' ? { shiftId } : {}),
          ...fields,
          amount: Number(fields.amount),
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'تعذر حفظ الإيراد اليدوي');
      setFields(emptyFields());
      setEditing(null);
      setMessage(editing ? 'تم تحديث الإيراد اليدوي.' : 'تم تسجيل الإيراد على الشيفت.');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ الإيراد اليدوي');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (record: ManualRevenueRecord) => {
    if (!window.confirm('حذف هذا الإيراد اليدوي؟')) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/dashboard/revenue?id=${encodeURIComponent(record.id)}`, { method: 'DELETE' });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'تعذر حذف الإيراد اليدوي');
      setMessage('تم حذف الإيراد اليدوي.');
      await load();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'تعذر حذف الإيراد اليدوي');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-5 space-y-4 rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-4 sm:p-5" dir="rtl">
      <header>
        <h2 className="text-xl font-bold text-[#232122]">الإيرادات اليدوية للشيفتات</h2>
        <p className="mt-1 text-sm leading-6 text-[#705331]">هذه الإيرادات منفصلة عن مبيعات الطلبات الإلكترونية، ولا تُضاف إليها تلقائيًا.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        <Summary label="الإيراد اليدوي اليوم" value={money(todayTotal)} />
        <Summary label="الإيراد اليدوي في الفترة" value={money(monthTotal)} strong />
        <Summary label="عدد العمليات" value={String(records.length)} />
      </div>
      <form onSubmit={(event) => void submit(event)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {staff.role === 'ADMIN' ? <label className="grid gap-1 text-xs font-semibold text-[#705331]">الشيفت
          <select required value={selectedShift || shifts[0]?.id || ''} onChange={(event) => setSelectedShift(event.target.value)} className={inputClass}>
            <option value="">اختر شيفتًا</option>
            {shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.username} · {shift.shiftType === 'DAY' ? 'نهاري' : 'ليلي'} · {shift.startedAt.slice(0, 10)}</option>)}
          </select>
        </label> : <p className="self-end pb-3 text-sm text-[#705331]">{activeShift ? `سيُسجل على شيفت ${activeShift.shiftType === 'DAY' ? 'النهار' : 'الليل'} الحالي.` : 'ابدأ شيفتك أولًا لإضافة الإيراد.'}</p>}
        <label className="grid gap-1 text-xs font-semibold text-[#705331]">المبلغ<input required min="0.01" max="10000000" step="0.01" type="number" value={fields.amount} onChange={(event) => setFields({ ...fields, amount: event.target.value })} className={inputClass} /></label>
        <label className="grid gap-1 text-xs font-semibold text-[#705331]">التاريخ<input required type="date" value={fields.date} onChange={(event) => setFields({ ...fields, date: event.target.value })} className={inputClass} /></label>
        <label className="grid gap-1 text-xs font-semibold text-[#705331]">الوصف<input required minLength={2} maxLength={500} value={fields.description} onChange={(event) => setFields({ ...fields, description: event.target.value })} className={inputClass} /></label>
        <button type="submit" disabled={saving || (staff.role === 'EMPLOYEE' && !activeShift)} className="min-h-11 self-end rounded-xl bg-[#6B8136] px-4 py-2 font-semibold text-white disabled:opacity-50">{saving ? 'جارٍ الحفظ…' : editing ? 'حفظ التعديل' : 'تسجيل الإيراد'}</button>
        {editing ? <button type="button" onClick={() => { setEditing(null); setFields(emptyFields()); }} className="min-h-11 rounded-xl border border-[#E5E3B2] px-4 py-2 font-semibold">إلغاء</button> : null}
      </form>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs font-semibold text-[#705331]">من<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className={inputClass} /></label>
        <label className="grid gap-1 text-xs font-semibold text-[#705331]">إلى<input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className={inputClass} /></label>
        <p className="text-xs text-[#705331]">قارن إجمالي الإيراد بين الشيفتات في الجدول التالي.</p>
      </div>
      {message ? <p role="status" className="text-sm text-emerald-800">{message}</p> : null}
      {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
      {perShift.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{perShift.map((shift) => <div key={shift.id} className="rounded-xl bg-[#f7f7f0] p-3 text-sm"><p className="font-semibold">{shift.username} · {shift.shiftType === 'DAY' ? 'نهاري' : 'ليلي'}</p><p className="mt-1 text-[#536342]">{money(shift.amount)}</p></div>)}</div> : null}
      <div className="overflow-x-auto">
        {loading ? <p className="py-5 text-center text-sm text-[#705331]">جارٍ تحميل الإيرادات…</p> : (
          <table className="w-full min-w-[640px] text-right text-sm">
            <thead><tr className="border-b border-[#E5E3B2] text-[#705331]"><th className="px-2 py-2">التاريخ</th><th className="px-2 py-2">الشيفت</th><th className="px-2 py-2">الوصف</th><th className="px-2 py-2">المبلغ</th><th className="px-2 py-2">المسجل</th>{staff.role === 'ADMIN' ? <th className="px-2 py-2">الإجراء</th> : null}</tr></thead>
            <tbody>{records.length ? records.map((record) => <tr key={record.id} className="border-b border-[#ecebd6]">
              <td className="px-2 py-2">{record.date}</td><td className="px-2 py-2">{record.shiftType === 'DAY' ? 'نهاري' : 'ليلي'} · {record.username}</td><td className="px-2 py-2">{record.description}</td><td className="px-2 py-2 font-semibold">{money(record.amount)}</td><td className="px-2 py-2">{record.createdBy ?? record.username}</td>
              {staff.role === 'ADMIN' ? <td className="flex gap-2 px-2 py-2"><button type="button" disabled={saving} onClick={() => { setEditing(record); setFields({ amount: String(record.amount), date: record.date, description: record.description }); setSelectedShift(record.shiftId); }} className="text-[#536342]">تعديل</button><button type="button" disabled={saving} onClick={() => void remove(record)} className="text-rose-700">حذف</button></td> : null}
            </tr>) : <tr><td colSpan={staff.role === 'ADMIN' ? 6 : 5} className="py-5 text-center text-[#705331]">لا توجد إيرادات يدوية في الفترة.</td></tr>}</tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function Summary({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="rounded-xl bg-[#f7f7f0] p-3"><dt className="text-xs text-[#705331]">{label}</dt><dd className={`mt-1 font-bold ${strong ? 'text-[#536342]' : 'text-[#232122]'}`}>{value}</dd></div>;
}
