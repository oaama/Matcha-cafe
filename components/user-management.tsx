'use client';

import { useEffect, useState } from 'react';
import type { StaffIdentity, ShiftType, StaffRole } from '@/lib/staff-types';

export default function UserManagement({ currentStaffId }: { currentStaffId: string }) {
  const [users, setUsers] = useState<StaffIdentity[]>([]);
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'EMPLOYEE' as StaffRole, shiftType: 'DAY' as ShiftType });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ username: '', email: '', password: '', role: 'EMPLOYEE' as StaffRole, shiftType: 'DAY' as ShiftType });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const response = await fetch('/api/admin/users');
    const data = await response.json() as { users?: StaffIdentity[]; error?: string };
    if (!response.ok) throw new Error(data.error || 'تعذر تحميل المستخدمين');
    setUsers(data.users ?? []);
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load().catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل المستخدمين'));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const response = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        setError(data.error || 'تعذر إنشاء الحساب');
        return;
      }
      setForm({ username: '', email: '', password: '', role: 'EMPLOYEE', shiftType: 'DAY' });
      setMessage('تم إنشاء الحساب بكلمة مرور مشفرة.');
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'تعذر الاتصال بالخادم أثناء إنشاء الحساب');
    } finally {
      setSaving(false);
    }
  };

  const update = async (user: StaffIdentity, changes: Partial<StaffIdentity> & { password?: string }) => {
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const response = await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: user.id, ...changes }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        setError(data.error || 'تعذر تحديث الحساب');
        return false;
      }
      await load();
      setMessage('تم تحديث الحساب.');
      return true;
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'تعذر الاتصال بالخادم أثناء تحديث الحساب');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const remove = async (user: StaffIdentity) => {
    if (!window.confirm(`حذف حساب ${user.username}؟ لن يتم حذف طلباته أو شيفتاته.`)) return;
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/users?id=${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        setError(data.error || 'تعذر حذف الحساب');
        return;
      }
      await load();
      setMessage(`تم حذف حساب ${user.username}.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'تعذر الاتصال بالخادم أثناء حذف الحساب');
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (user: StaffIdentity) => {
    setEditing(user.id);
    setEditForm({ username: user.username, email: user.email, password: '', role: user.role, shiftType: user.shiftType });
  };

  const saveEdit = async (user: StaffIdentity) => {
    if (await update(user, { username: editForm.username, email: editForm.email, role: editForm.role, shiftType: editForm.shiftType, ...(editForm.password ? { password: editForm.password } : {}) })) {
      setEditing(null);
    }
  };

  return (
    <section className="space-y-5">
      <div className="rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5 shadow-[0_10px_30px_rgba(44,43,35,.045)]">
        <h2 className="text-xl font-bold text-[#232122]">إدارة المستخدمين</h2>
        <p className="mt-1 text-sm text-[#705331]">لا يتم عرض كلمات المرور؛ الاستبدال فقط متاح للمدير.</p>
        <form onSubmit={create} className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <input className="w-full min-w-0" required placeholder="اسم المستخدم" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
          <input className="w-full min-w-0" required type="email" placeholder="البريد الإلكتروني" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          <input className="w-full min-w-0" required minLength={8} type="password" placeholder="كلمة مرور أولية" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          <select className="w-full min-w-0" aria-label="صلاحية الحساب الجديد" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as StaffRole })}><option value="EMPLOYEE">موظف</option><option value="ADMIN">مدير</option></select>
          <select className="w-full min-w-0" value={form.shiftType} onChange={(event) => setForm({ ...form, shiftType: event.target.value as ShiftType })}><option value="DAY">وردية نهارية</option><option value="NIGHT">وردية ليلية</option></select>
          <button type="submit" disabled={saving} className="w-full min-w-0 rounded-xl bg-[#6B8136] px-4 py-2.5 font-semibold text-white disabled:opacity-60">{saving ? 'جارٍ الإنشاء…' : 'إنشاء حساب'}</button>
        </form>
        {message ? <p className="mt-3 text-sm text-[#6B8136]">{message}</p> : null}
        {error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : null}
      </div>
      <div className="overflow-x-auto rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5">
        <table className="w-full min-w-[700px] text-right text-sm"><thead><tr className="border-b border-[#E5E3B2] text-[#705331]"><th className="px-3 py-3">المستخدم</th><th className="px-3 py-3">البريد</th><th className="px-3 py-3">الدور</th><th className="px-3 py-3">الوردية</th><th className="px-3 py-3">الحالة</th><th className="px-3 py-3">إجراء</th></tr></thead>
          <tbody>{users.map((user) => editing === user.id ? <tr key={user.id} className="border-b border-[#E5E3B2]"><td className="px-3 py-3"><input value={editForm.username} onChange={(event) => setEditForm({ ...editForm, username: event.target.value })} /></td><td className="px-3 py-3"><input type="email" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} /><input className="mt-2" type="password" placeholder="كلمة مرور جديدة (اختياري)" value={editForm.password} onChange={(event) => setEditForm({ ...editForm, password: event.target.value })} /></td><td className="px-3 py-3"><select value={editForm.role} onChange={(event) => setEditForm({ ...editForm, role: event.target.value as StaffRole })}><option value="ADMIN">مدير</option><option value="EMPLOYEE">موظف</option></select></td><td className="px-3 py-3"><select value={editForm.shiftType} onChange={(event) => setEditForm({ ...editForm, shiftType: event.target.value as ShiftType })}><option value="DAY">نهاري</option><option value="NIGHT">ليلي</option></select></td><td className="px-3 py-3">{user.active ? 'نشط' : 'موقوف'}</td><td className="flex gap-2 px-3 py-3"><button type="button" disabled={saving} onClick={() => void saveEdit(user)} className="rounded-lg bg-[#6B8136] px-2 py-1 text-xs text-white disabled:opacity-60">حفظ</button><button type="button" disabled={saving} onClick={() => setEditing(null)} className="rounded-lg border border-[#E5E3B2] px-2 py-1 text-xs disabled:opacity-60">إلغاء</button></td></tr> : <tr key={user.id} className="border-b border-[#E5E3B2]"><td className="px-3 py-3 font-semibold">{user.username}</td><td className="px-3 py-3" dir="ltr">{user.email}</td><td className="px-3 py-3">{user.role === 'ADMIN' ? 'مدير' : 'موظف'}</td><td className="px-3 py-3">{user.shiftType === 'DAY' ? 'نهاري' : 'ليلي'}</td><td className="px-3 py-3">{user.active ? 'نشط' : 'موقوف'}</td><td className="flex gap-2 px-3 py-3"><button type="button" disabled={saving} onClick={() => beginEdit(user)} className="rounded-lg border border-[#E5E3B2] px-2 py-1 text-xs text-[#6B8136] disabled:opacity-60">تعديل</button><button type="button" disabled={saving} onClick={() => void update(user, { active: !user.active })} className="rounded-lg border border-[#E5E3B2] px-2 py-1 text-xs text-[#6B8136] disabled:opacity-60">{user.active ? 'إيقاف' : 'تفعيل'}</button><button type="button" disabled={saving || user.id === currentStaffId} title={user.id === currentStaffId ? 'لا يمكن حذف الحساب المستخدم حاليًا' : undefined} onClick={() => void remove(user)} className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-700 disabled:cursor-not-allowed disabled:opacity-40">حذف</button></td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
