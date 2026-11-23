'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PayrollEmployee, PayrollProfile, PayrollStatement } from '@/lib/payroll-types';

type PayrollResponse = {
  employee?: PayrollEmployee;
  employees?: PayrollEmployee[];
  statement?: PayrollStatement;
  error?: string;
};

function cairoToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const emptyProfile: PayrollProfile = { jobTitle: '', hourlyRate: 0, hireDate: '', additionalInfo: '' };

export default function PayrollManagement() {
  const today = cairoToday();
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [profile, setProfile] = useState<PayrollProfile>(emptyProfile);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [statement, setStatement] = useState<PayrollStatement | null>(null);
  const [advanceForm, setAdvanceForm] = useState({ amount: '', date: today, description: '' });
  const [overtimeForm, setOvertimeForm] = useState({ date: today, hours: '', hourlyRate: '', description: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const loadStatement = useCallback(async () => {
    if (!employeeId || !startDate || !endDate || startDate > endDate) {
      setStatement(null);
      return;
    }
    const query = new URLSearchParams({ employeeId, startDate, endDate });
    const response = await fetch(`/api/admin/payroll?${query}`);
    const data = await response.json() as PayrollResponse;
    if (!response.ok) throw new Error(data.error || 'تعذر تحميل كشف الراتب');
    setStatement(data.statement ?? null);
    if (data.employee) setProfile(data.employee.profile);
  }, [employeeId, endDate, startDate]);

  const loadEmployees = useCallback(async () => {
    const response = await fetch('/api/admin/payroll');
    const data = await response.json() as PayrollResponse;
    if (!response.ok) throw new Error(data.error || 'تعذر تحميل الموظفين');
    const list = data.employees ?? [];
    setEmployees(list);
    setEmployeeId((current) => current && list.some((employee) => employee.id === current) ? current : list[0]?.id ?? '');
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadEmployees().catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل الموظفين'));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadEmployees]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadStatement().catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل كشف الراتب'));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadStatement]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const response = await fetch('/api/admin/payroll', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, ...profile }),
      });
      const data = await response.json() as { error?: string; profile?: PayrollProfile };
      if (!response.ok) throw new Error(data.error || 'تعذر حفظ ملف الراتب');
      setProfile(data.profile ?? profile);
      setEmployees((current) => current.map((employee) => employee.id === employeeId
        ? { ...employee, profile: data.profile ?? profile }
        : employee));
      setMessage('تم حفظ بيانات الملف الوظيفي.');
      await loadStatement();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ ملف الراتب');
    } finally {
      setSaving(false);
    }
  };

  const createEntry = async (event: React.FormEvent, type: 'advance' | 'overtime') => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    const body = type === 'advance'
      ? { type, employeeId, ...advanceForm, amount: Number(advanceForm.amount) }
      : { type, employeeId, ...overtimeForm, hours: Number(overtimeForm.hours), hourlyRate: Number(overtimeForm.hourlyRate) };
    try {
      const response = await fetch('/api/admin/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'تعذر حفظ الحركة');
      if (type === 'advance') setAdvanceForm({ amount: '', date: today, description: '' });
      else setOvertimeForm({ date: today, hours: '', hourlyRate: '', description: '' });
      setMessage(type === 'advance' ? 'تم تسجيل السلفة.' : 'تم تسجيل ساعات العمل الإضافية.');
      await loadStatement();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ الحركة');
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = async (type: 'advance' | 'overtime', id: string) => {
    if (!window.confirm(type === 'advance' ? 'حذف هذه السلفة من سجل الموظف؟' : 'حذف ساعات العمل الإضافية؟')) return;
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const response = await fetch('/api/admin/payroll', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, type, id }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'تعذر حذف الحركة');
      setMessage('تم حذف الحركة.');
      await loadStatement();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'تعذر حذف الحركة');
    } finally {
      setSaving(false);
    }
  };

  const selectedEmployee = employees.find((employee) => employee.id === employeeId);

  return (
    <section className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-end gap-3 rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5">
        <label className="min-w-[220px] flex-1 text-sm font-semibold text-[#705331]">الموظف
          <select className="mt-1 block w-full" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
            {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.username} {employee.active ? '— نشط' : '— موقوف'}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-[#705331]">من
          <input className="mt-1 block" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label className="text-sm font-semibold text-[#705331]">إلى
          <input className="mt-1 block" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
        {selectedEmployee ? <p className="text-sm text-[#705331]">حالة الحساب: <strong>{selectedEmployee.active ? 'نشط' : 'موقوف'}</strong></p> : null}
      </div>

      {message ? <p className="text-sm text-[#6B8136]" role="status">{message}</p> : null}
      {error ? <p className="text-sm text-rose-700" role="alert">{error}</p> : null}
      {!employees.length ? <p className="rounded-xl bg-white/75 p-5 text-sm text-[#705331]">لا توجد حسابات موظفين.</p> : null}

      {selectedEmployee ? (
        <>
          <form onSubmit={(event) => void saveProfile(event)} className="grid min-w-0 grid-cols-1 gap-3 rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <h2 className="text-xl font-bold text-[#232122] sm:col-span-2 lg:col-span-4">الملف الوظيفي والراتب الأساسي</h2>
            <label className="grid gap-1 text-sm font-semibold">المسمى الوظيفي
              <input maxLength={120} value={profile.jobTitle} onChange={(event) => setProfile({ ...profile, jobTitle: event.target.value })} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">أجر الساعة
              <input required min="0" max="1000000" step="0.01" type="number" value={profile.hourlyRate} onChange={(event) => setProfile({ ...profile, hourlyRate: Number(event.target.value) })} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">تاريخ التعيين
              <input type="date" value={profile.hireDate} onChange={(event) => setProfile({ ...profile, hireDate: event.target.value })} />
            </label>
            <label className="grid gap-1 text-sm font-semibold sm:col-span-2">معلومات إضافية
              <textarea maxLength={2000} rows={2} value={profile.additionalInfo} onChange={(event) => setProfile({ ...profile, additionalInfo: event.target.value })} />
            </label>
            <button type="submit" disabled={saving} className="self-end rounded-xl bg-[#6B8136] px-4 py-2.5 font-semibold text-white disabled:opacity-60">حفظ الملف</button>
          </form>

          <div className="rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5">
            <h2 className="text-xl font-bold text-[#232122]">كشف الراتب</h2>
            {startDate > endDate ? <p className="mt-3 text-sm text-rose-700">تاريخ البداية يجب أن يسبق تاريخ النهاية.</p> : statement ? (
              <>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
                  <Summary label="إجمالي ساعات العمل الأساسية" value={`${statement.regularHours.toFixed(2)} س`} />
                  <Summary label="إجمالي الساعات الإضافية" value={`${statement.overtimeHours.toFixed(2)} س`} />
                  <Summary label="إجمالي المرتبات (أساسي + إضافي)" value={(statement.baseWages + statement.overtimeEarnings).toFixed(2)} />
                  <Summary label="إجمالي السلف" value={statement.totalAdvances.toFixed(2)} />
                  <Summary label="صافي المستحقات بعد خصم السلف" value={statement.netPay.toFixed(2)} strong />
                </dl>
                <p className="mt-3 text-xs text-[#705331]">الأجر الأساسي = ساعات العمل المسجلة × أجر الساعة. السلف منفصلة عن أجر الإضافي.</p>
              </>
            ) : <p className="mt-3 text-sm text-[#705331]">جارٍ تحميل كشف الراتب…</p>}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <form onSubmit={(event) => void createEntry(event, 'advance')} className="grid gap-3 rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5">
              <h3 className="font-bold text-[#232122]">تسجيل سلفة</h3>
              <label className="grid gap-1 text-sm font-semibold">المبلغ<input required min="0.01" max="10000000" step="0.01" type="number" value={advanceForm.amount} onChange={(event) => setAdvanceForm({ ...advanceForm, amount: event.target.value })} /></label>
              <label className="grid gap-1 text-sm font-semibold">التاريخ<input required type="date" value={advanceForm.date} onChange={(event) => setAdvanceForm({ ...advanceForm, date: event.target.value })} /></label>
              <label className="grid gap-1 text-sm font-semibold">البيان<input required minLength={2} maxLength={500} value={advanceForm.description} onChange={(event) => setAdvanceForm({ ...advanceForm, description: event.target.value })} /></label>
              <button type="submit" disabled={saving} className="rounded-xl bg-[#6B8136] px-4 py-2.5 font-semibold text-white disabled:opacity-60">إضافة سلفة</button>
            </form>

            <form onSubmit={(event) => void createEntry(event, 'overtime')} className="grid gap-3 rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5">
              <h3 className="font-bold text-[#232122]">تسجيل عمل إضافي</h3>
              <label className="grid gap-1 text-sm font-semibold">التاريخ<input required type="date" value={overtimeForm.date} onChange={(event) => setOvertimeForm({ ...overtimeForm, date: event.target.value })} /></label>
              <label className="grid gap-1 text-sm font-semibold">عدد الساعات<input required min="0.01" max="1000" step="0.01" type="number" value={overtimeForm.hours} onChange={(event) => setOvertimeForm({ ...overtimeForm, hours: event.target.value })} /></label>
              <label className="grid gap-1 text-sm font-semibold">أجر ساعة الإضافي<input required min="0.01" max="1000000" step="0.01" type="number" value={overtimeForm.hourlyRate} onChange={(event) => setOvertimeForm({ ...overtimeForm, hourlyRate: event.target.value })} /></label>
              <label className="grid gap-1 text-sm font-semibold">البيان<input required minLength={2} maxLength={500} value={overtimeForm.description} onChange={(event) => setOvertimeForm({ ...overtimeForm, description: event.target.value })} /></label>
              <button type="submit" disabled={saving} className="rounded-xl bg-[#6B8136] px-4 py-2.5 font-semibold text-white disabled:opacity-60">إضافة ساعات إضافية</button>
            </form>
          </div>

          {statement ? (
            <div className="grid gap-5 lg:grid-cols-2">
              <EntryTable title="السلف في الفترة" headers={['التاريخ', 'البيان', 'المبلغ']} rows={statement.advances.map((advance) => [advance.date, advance.description, advance.amount.toFixed(2)])} actions={statement.advances.map((advance) => () => void removeEntry('advance', advance.id))} saving={saving} />
              <EntryTable title="الإضافي في الفترة" headers={['التاريخ', 'البيان', 'الساعات × الأجر', 'الإجمالي']} rows={statement.overtimeEntries.map((entry) => [entry.date, entry.description, `${entry.hours} × ${entry.hourlyRate.toFixed(2)}`, (entry.hours * entry.hourlyRate).toFixed(2)])} actions={statement.overtimeEntries.map((entry) => () => void removeEntry('overtime', entry.id))} saving={saving} />
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function Summary({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="rounded-xl bg-[#FCF5ED] p-3"><dt className="text-xs text-[#705331]">{label}</dt><dd className={`mt-1 ${strong ? 'text-lg font-bold text-[#6B8136]' : 'font-semibold text-[#232122]'}`}>{value}</dd></div>;
}

function EntryTable({ title, headers, rows, actions, saving }: { title: string; headers: string[]; rows: string[][]; actions: Array<() => void>; saving: boolean }) {
  return (
    <div className="overflow-x-auto rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5">
      <h3 className="mb-3 font-bold text-[#232122]">{title}</h3>
      <table className="w-full min-w-[400px] text-right text-sm">
        <thead><tr className="border-b border-[#E5E3B2] text-[#705331]">{headers.map((header) => <th key={header} className="px-2 py-2">{header}</th>)}<th className="px-2 py-2">إجراء</th></tr></thead>
        <tbody>{rows.length ? rows.map((row, index) => (
          <tr key={`${row[0]}-${index}`} className="border-b border-[#E5E3B2]">
            {row.map((value, cell) => <td key={cell} className="px-2 py-2">{value}</td>)}
            <td className="px-2 py-2"><button type="button" disabled={saving} onClick={actions[index]} className="text-rose-700 disabled:opacity-50">حذف</button></td>
          </tr>
        )) : <tr><td className="px-2 py-3 text-[#705331]" colSpan={headers.length + 1}>لا توجد حركات لهذه الفترة.</td></tr>}</tbody>
      </table>
    </div>
  );
}
