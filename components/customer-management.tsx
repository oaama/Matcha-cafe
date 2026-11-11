'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CustomerFollowUpStatus, CustomerRecord } from '@/lib/types';
import { normalizeCustomerPhone } from '@/lib/customer-phone';

type CustomerDraft = { status: CustomerFollowUpStatus; note: string };
type CustomerResponse = { customers?: CustomerRecord[]; error?: string };

const followUpLabels: Record<CustomerFollowUpStatus, string> = {
  NEW: 'جديد',
  CONTACTED: 'تم التواصل',
  FOLLOW_UP: 'متابعة لاحقًا',
  NO_FOLLOW_UP: 'لا يحتاج متابعة',
};

const orderStatusLabels: Record<CustomerRecord['lastOrderStatus'], string> = {
  NEW: 'جديد',
  PREPARING: 'قيد التجهيز',
  READY: 'جاهز',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
};

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function CustomerManagement() {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, CustomerDraft>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingPhone, setSavingPhone] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      void fetch('/api/dashboard/customers')
        .then(async (response) => {
          const data = await response.json() as CustomerResponse;
          if (!response.ok || !data.customers) throw new Error(data.error || 'تعذر تحميل سجل العملاء');
          if (active) {
            setCustomers(data.customers);
            setDrafts(Object.fromEntries(data.customers.map((customer) => [
              customer.phoneKey,
              { status: customer.followUpStatus, note: customer.note },
            ])));
          }
        })
        .catch((loadError: unknown) => {
          if (active) setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل سجل العملاء');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, []);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const phoneQuery = normalizeCustomerPhone(search) ?? search.replace(/\D/g, '');
    return customers.filter((customer) => !query
      || customer.name.toLowerCase().includes(query)
      || customer.phone.toLowerCase().includes(query)
      || (phoneQuery.length > 0 && customer.phoneKey.includes(phoneQuery)));
  }, [customers, search]);

  const updateCustomer = async (customer: CustomerRecord, update: Partial<CustomerDraft> & { markContacted?: boolean }) => {
    if (savingPhone) return;
    setSavingPhone(customer.phoneKey);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/dashboard/customers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneKey: customer.phoneKey, ...update }),
      });
      const data = await response.json() as { followUp?: Pick<CustomerRecord, 'phoneKey' | 'followUpStatus' | 'note' | 'lastContactedAt'>; error?: string };
      if (!response.ok || !data.followUp) throw new Error(data.error || 'تعذر حفظ متابعة العميل');
      setCustomers((current) => current.map((item) => item.phoneKey === customer.phoneKey ? { ...item, ...data.followUp } : item));
      setDrafts((current) => ({
        ...current,
        [customer.phoneKey]: { status: data.followUp!.followUpStatus, note: data.followUp!.note },
      }));
      setMessage(update.markContacted ? `تم تسجيل التواصل مع ${customer.name || customer.phone}.` : 'تم حفظ بيانات المتابعة.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ متابعة العميل');
    } finally {
      setSavingPhone(null);
    }
  };

  const customersToFollowUp = customers.filter((customer) => customer.followUpStatus === 'NEW' || customer.followUpStatus === 'FOLLOW_UP').length;

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4 rounded-[1.5rem] border border-[#dbe7e3] bg-white/85 p-4 shadow-[0_8px_24px_rgba(29,73,68,.04)] sm:p-6">
        <div>
          <h2 className="text-xl font-bold text-[#232a28]">العملاء والمتابعة</h2>
          <p className="mt-1 text-sm text-[#647b77]">بيانات العملاء مجمعة حسب رقم الهاتف من طلباتهم.</p>
        </div>
        <div className="flex gap-2 text-sm">
          <span className="rounded-xl bg-[#f1f8f6] px-3 py-2 font-semibold text-[#315d58]">{customers.length} عميل</span>
          <span className="rounded-xl bg-amber-50 px-3 py-2 font-semibold text-amber-800">{customersToFollowUp} للمتابعة</span>
        </div>
      </header>

      <label className="block">
        <span className="sr-only">ابحث بالاسم أو رقم الهاتف</span>
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم أو رقم الهاتف..." aria-label="ابحث بالاسم أو رقم الهاتف" className="w-full rounded-xl border-[#dbe7e3] bg-white" />
      </label>

      {message ? <p role="status" className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
      {error ? <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
      {loading ? <p className="rounded-xl bg-white p-6 text-center text-sm text-[#647b77]">جارٍ تحميل سجل العملاء…</p> : null}
      {!loading && filteredCustomers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#dbe7e3] bg-white p-8 text-center text-sm text-[#647b77]">
          {customers.length ? 'لا توجد نتائج مطابقة للبحث.' : 'سيظهر العميل هنا بعد إنشاء طلب برقم هاتف.'}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {filteredCustomers.map((customer) => {
          const draft = drafts[customer.phoneKey] ?? { status: customer.followUpStatus, note: customer.note };
          const phoneForLink = customer.phone.replace(/[^\d+]/g, '');
          return (
            <article key={customer.phoneKey} className="min-w-0 rounded-[1.5rem] border border-[#dbe7e3] bg-white p-4 shadow-[0_5px_18px_rgba(29,73,68,.04)] sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-bold text-[#232a28]">{customer.name || 'عميل بدون اسم'}</h3>
                  <p dir="ltr" className="mt-1 text-start text-sm font-semibold text-[#315d58]">{customer.phone}</p>
                </div>
                <span className="shrink-0 rounded-full bg-[#f1f8f6] px-3 py-1 text-xs font-semibold text-[#315d58]">{followUpLabels[customer.followUpStatus]}</span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-[#647b77] sm:grid-cols-4">
                <div className="rounded-xl bg-[#f8faf8] p-3"><span className="block">الطلبات</span><strong className="mt-1 block text-sm text-[#232a28]">{customer.orderCount}</strong></div>
                <div className="rounded-xl bg-[#f8faf8] p-3"><span className="block">مبيعات مكتملة</span><strong className="mt-1 block text-sm text-[#232a28]">{customer.totalSpent.toFixed(2)} ج.م</strong></div>
                <div className="rounded-xl bg-[#f8faf8] p-3"><span className="block">آخر طلب</span><strong className="mt-1 block text-sm text-[#232a28]">{customer.lastOrderNumber}</strong></div>
                <div className="rounded-xl bg-[#f8faf8] p-3"><span className="block">حالة آخر طلب</span><strong className="mt-1 block text-sm text-[#232a28]">{orderStatusLabels[customer.lastOrderStatus]}</strong></div>
              </div>
              <p className="mt-3 text-xs text-[#647b77]">آخر طلب: {formatDate(customer.lastOrderAt)}{customer.address ? ` · العنوان: ${customer.address}` : ''}</p>
              {customer.lastContactedAt ? <p className="mt-1 text-xs text-[#647b77]">آخر تواصل: {formatDate(customer.lastContactedAt)}</p> : null}

              <div className="mt-4 flex flex-wrap gap-2 border-t border-[#e8efec] pt-4">
                <a href={`tel:${phoneForLink}`} dir="ltr" className="inline-flex min-h-10 items-center rounded-xl bg-[#176f68] px-4 py-2 text-sm font-semibold text-white">اتصال</a>
                <a href={`https://wa.me/${customer.phoneKey}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-xl border border-[#b8d7d1] px-4 py-2 text-sm font-semibold text-[#176f68]">واتساب</a>
                <label className="ms-auto flex min-w-40 flex-1 items-center gap-2 text-xs font-semibold text-[#647b77] sm:flex-none">
                  حالة المتابعة
                  <select value={draft.status} onChange={(event) => setDrafts((current) => ({ ...current, [customer.phoneKey]: { ...draft, status: event.target.value as CustomerFollowUpStatus } }))} aria-label={`حالة متابعة ${customer.name || customer.phone}`} className="min-w-0 flex-1 px-2 py-2 text-xs sm:w-40">
                    {Object.entries(followUpLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              </div>

              <label className="mt-3 block text-xs font-semibold text-[#647b77]">
                ملاحظات المتابعة
                <textarea value={draft.note} onChange={(event) => setDrafts((current) => ({ ...current, [customer.phoneKey]: { ...draft, note: event.target.value } }))} maxLength={1000} rows={2} placeholder="اكتب ملاحظة للفريق..." className="mt-1.5 w-full resize-y border-[#dbe7e3] text-sm" />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => void updateCustomer(customer, { status: draft.status, note: draft.note })} disabled={savingPhone !== null} className="min-h-10 rounded-xl bg-[#6B8136] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {savingPhone === customer.phoneKey ? 'جارٍ الحفظ…' : 'حفظ المتابعة'}
                </button>
                <button type="button" onClick={() => void updateCustomer(customer, { markContacted: true })} disabled={savingPhone !== null} className="min-h-10 rounded-xl border border-[#b8d7d1] px-4 py-2 text-sm font-semibold text-[#176f68] disabled:opacity-60">تسجيل تم التواصل</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
