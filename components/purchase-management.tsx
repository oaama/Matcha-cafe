'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { InventoryItem } from '@/lib/types';
import type { PurchaseInvoice, PurchaseInvoiceItem } from '@/lib/purchase-types';

type InvoiceLineInput = { itemId: string; quantity: string; unitPrice: string };
type InvoiceForm = { supplier: string; invoiceNumber: string; invoiceDate: string; notes: string; paymentMethod: 'cash' | 'credit' | 'partial'; paidNow: string };

const inputClass = 'min-h-11 w-full rounded-xl border border-[#E5E3B2] bg-white px-3 py-2 text-sm text-[#232122]';
const statusLabels: Record<PurchaseInvoice['status'], string> = {
  DRAFT: 'مسودة',
  APPROVED: 'معتمدة',
  CANCELLED: 'ملغاة',
};
const historyLabels: Record<PurchaseInvoice['history'][number]['action'], string> = {
  CREATED: 'إنشاء المسودة',
  UPDATED: 'تعديل الفاتورة',
  APPROVED: 'اعتماد وإضافة للمخزون',
  CANCELLED: 'إلغاء المسودة',
};
const paymentMethodLabels = { cash: 'نقدي', credit: 'آجل', partial: 'دفع جزئي' } as const;

const emptyForm = (): InvoiceForm => ({
  supplier: '',
  invoiceNumber: '',
  invoiceDate: new Date().toISOString().slice(0, 10),
  notes: '',
  paymentMethod: 'cash',
  paidNow: '',
});
const emptyLine = (): InvoiceLineInput => ({ itemId: '', quantity: '', unitPrice: '' });

function formatMoney(value: number) {
  return `${value.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
}

function invoiceItems(lines: InvoiceLineInput[]) {
  return lines.map((line) => ({
    itemId: line.itemId,
    quantity: Number(line.quantity),
    unitPrice: Number(line.unitPrice),
  }));
}

export default function PurchaseManagement() {
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterForm, setFilterForm] = useState({ supplier: '', invoiceNumber: '', from: '', to: '', status: '' });
  const [appliedFilters, setAppliedFilters] = useState(filterForm);
  const [editing, setEditing] = useState<PurchaseInvoice | null>(null);
  const [form, setForm] = useState<InvoiceForm>(emptyForm);
  const [lines, setLines] = useState<InvoiceLineInput[]>([emptyLine()]);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(appliedFilters)) {
        if (value) params.set(key, value);
      }
      const response = await fetch(`/api/dashboard/purchases?${params.toString()}`);
      const data = await response.json() as { invoices?: PurchaseInvoice[]; items?: InventoryItem[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'تعذر تحميل فواتير المشتريات');
      setInvoices(data.invoices ?? []);
      setItems(data.items ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل فواتير المشتريات');
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const trackedItems = useMemo(() => items.filter((item) => item.type === 'ingredient' || item.trackStock), [items]);
  const formTotal = useMemo(() => lines.reduce((total, line) => {
    const quantity = Number(line.quantity);
    const price = Number(line.unitPrice);
    return total + (Number.isFinite(quantity * price) ? quantity * price : 0);
  }, 0), [lines]);

  const startNew = () => {
    setError('');
    setMessage('');
    setEditing(null);
    setFormOpen(true);
    setForm(emptyForm());
    setLines([emptyLine()]);
  };

  const startEdit = (invoice: PurchaseInvoice) => {
    setError('');
    setMessage('');
    setEditing(invoice);
    setFormOpen(true);
    setForm({
      supplier: invoice.supplier,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      notes: invoice.notes ?? '',
      paymentMethod: invoice.paymentMethod ?? 'cash',
      paidNow: invoice.paymentMethod === 'partial' ? String(invoice.paidAmount ?? '') : '',
    });
    setLines(invoice.items.map((item) => ({
      itemId: item.itemId,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
    })));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveDraft = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    if (!lines.length || lines.some((line) => !line.itemId || !line.quantity || !line.unitPrice)) {
      setError('أكمل بيانات كل صنف في الفاتورة.');
      return;
    }
    if (form.paymentMethod === 'partial') {
      const paid = Number(form.paidNow);
      if (!Number.isFinite(paid) || paid < 0 || paid > formTotal + 0.005) {
        setError('المدفوع الآن لازم يكون بين صفر وإجمالي الفاتورة.');
        return;
      }
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const invoiceInput = {
        supplier: form.supplier,
        invoiceNumber: form.invoiceNumber,
        invoiceDate: form.invoiceDate,
        notes: form.notes,
        items: invoiceItems(lines),
        paymentMethod: form.paymentMethod,
        paidAmount: form.paymentMethod === 'partial' ? Number(form.paidNow) : undefined,
      };
      const response = await fetch('/api/dashboard/purchases', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editing ? { action: 'UPDATE', id: editing.id } : {}),
          ...(editing ? { invoice: invoiceInput } : invoiceInput),
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'تعذر حفظ فاتورة المشتريات');
      setEditing(null);
      setFormOpen(false);
      setForm(emptyForm());
      setLines([emptyLine()]);
      setMessage(editing ? 'تم تحديث مسودة الفاتورة.' : 'تم حفظ الفاتورة كمسودة. لم يتغير المخزون.');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ فاتورة المشتريات');
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (invoice: PurchaseInvoice, action: 'APPROVE' | 'CANCEL') => {
    const confirmation = action === 'APPROVE'
      ? 'سيتم اعتماد الفاتورة وتحديث رصيد المخزون ومتوسط التكلفة. هل تريد المتابعة؟'
      : 'سيتم إلغاء المسودة. هل تريد المتابعة؟';
    if (!window.confirm(confirmation)) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/dashboard/purchases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id: invoice.id }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'تعذر تنفيذ الإجراء');
      setMessage(action === 'APPROVE' ? 'تم اعتماد الفاتورة وتحديث المخزون.' : 'تم إلغاء مسودة الفاتورة.');
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'تعذر تنفيذ الإجراء');
    } finally {
      setSaving(false);
    }
  };

  const total = useMemo(() => invoices.reduce((sum, invoice) => sum + invoice.total, 0), [invoices]);

  const supplierDebts = useMemo(() => {
    const bySupplier = new Map<string, number>();
    for (const invoice of invoices) {
      if (invoice.status !== 'APPROVED' || !invoice.paymentMethod) continue;
      const remaining = Math.max(0, invoice.total - (invoice.paidAmount ?? 0));
      if (remaining <= 0.004) continue;
      bySupplier.set(invoice.supplier, (bySupplier.get(invoice.supplier) ?? 0) + remaining);
    }
    return [...bySupplier.entries()].map(([supplier, remaining]) => ({ supplier, remaining })).sort((a, b) => b.remaining - a.remaining);
  }, [invoices]);
  const totalDebt = supplierDebts.reduce((sum, entry) => sum + entry.remaining, 0);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5">
        <div>
          <h2 className="text-xl font-bold text-[#232122]">فواتير المشتريات</h2>
          <p className="mt-1 text-sm leading-6 text-[#705331]">احفظ الفاتورة كمسودة، ثم اعتمدها لتسجيل الاستلام وتحديث المخزون والتكلفة. لا تُنشأ ديون تلقائيًا.</p>
        </div>
        <button type="button" onClick={startNew} className="min-h-11 rounded-xl bg-[#6B8136] px-4 py-2.5 text-sm font-semibold text-white">＋ فاتورة جديدة</button>
      </div>

      {message ? <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p> : null}
      {error ? <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

      <form onSubmit={(event) => { event.preventDefault(); setAppliedFilters({ ...filterForm }); }} className="grid gap-3 rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5 sm:grid-cols-2 lg:grid-cols-6">
        <label className="grid gap-1 text-xs font-semibold text-[#705331]">المورد<input value={filterForm.supplier} onChange={(event) => setFilterForm({ ...filterForm, supplier: event.target.value })} className={inputClass} /></label>
        <label className="grid gap-1 text-xs font-semibold text-[#705331]">رقم الفاتورة<input value={filterForm.invoiceNumber} onChange={(event) => setFilterForm({ ...filterForm, invoiceNumber: event.target.value })} className={inputClass} /></label>
        <label className="grid gap-1 text-xs font-semibold text-[#705331]">من<input type="date" value={filterForm.from} max={filterForm.to || undefined} onChange={(event) => setFilterForm({ ...filterForm, from: event.target.value })} className={inputClass} /></label>
        <label className="grid gap-1 text-xs font-semibold text-[#705331]">إلى<input type="date" value={filterForm.to} min={filterForm.from || undefined} onChange={(event) => setFilterForm({ ...filterForm, to: event.target.value })} className={inputClass} /></label>
        <label className="grid gap-1 text-xs font-semibold text-[#705331]">الحالة<select value={filterForm.status} onChange={(event) => setFilterForm({ ...filterForm, status: event.target.value })} className={inputClass}><option value="">كل الحالات</option><option value="DRAFT">مسودة</option><option value="APPROVED">معتمدة</option><option value="CANCELLED">ملغاة</option></select></label>
        <button type="submit" className="min-h-11 self-end rounded-xl border border-[#6B8136] px-4 py-2.5 text-sm font-semibold text-[#536342]">بحث</button>
      </form>

      {formOpen ? (
        <form onSubmit={(event) => void saveDraft(event)} className="space-y-4 rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5">
          <div className="flex items-center justify-between gap-3">
            <div><h3 className="font-bold text-[#232122]">{editing ? 'تعديل مسودة فاتورة' : 'مسودة فاتورة جديدة'}</h3><p className="mt-1 text-xs text-[#705331]">الحفظ لا يضيف الكميات إلى المخزون؛ التحديث يحدث عند الاعتماد فقط.</p></div>
            <button type="button" onClick={startNew} className="rounded-lg px-3 py-2 text-sm text-[#705331]">مسودة جديدة</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-xs font-semibold text-[#705331]">المورد<input required maxLength={160} value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })} className={inputClass} /></label>
            <label className="grid gap-1 text-xs font-semibold text-[#705331]">رقم الفاتورة<input required maxLength={120} value={form.invoiceNumber} onChange={(event) => setForm({ ...form, invoiceNumber: event.target.value })} className={inputClass} /></label>
            <label className="grid gap-1 text-xs font-semibold text-[#705331]">تاريخ الفاتورة<input required type="date" value={form.invoiceDate} onChange={(event) => setForm({ ...form, invoiceDate: event.target.value })} className={inputClass} /></label>
            <label className="grid gap-1 text-xs font-semibold text-[#705331]">ملاحظات<input maxLength={1000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={inputClass} /></label>
          </div>
          <div className="space-y-3">
            {lines.map((line, index) => (
              <div key={`${index}-${line.itemId}`} className="grid gap-2 rounded-xl border border-[#ecebd6] p-3 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,2fr)_1fr_1fr_auto]">
                <label className="grid gap-1 text-xs font-semibold text-[#705331]">الصنف
                  <select required value={line.itemId} onChange={(event) => setLines((current) => current.map((entry, row) => row === index ? { ...entry, itemId: event.target.value } : entry))} className={inputClass}>
                    <option value="">اختر صنفًا</option>
                    {trackedItems.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold text-[#705331]">الكمية<input required type="number" min="0.000001" step="any" value={line.quantity} onChange={(event) => setLines((current) => current.map((entry, row) => row === index ? { ...entry, quantity: event.target.value } : entry))} className={inputClass} /></label>
                <label className="grid gap-1 text-xs font-semibold text-[#705331]">سعر الوحدة<input required type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => setLines((current) => current.map((entry, row) => row === index ? { ...entry, unitPrice: event.target.value } : entry))} className={inputClass} /></label>
                <button type="button" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, row) => row !== index))} className="min-h-11 self-end rounded-xl border border-rose-200 px-3 text-sm text-rose-700 disabled:opacity-40">حذف</button>
              </div>
            ))}
            <button type="button" onClick={() => setLines((current) => [...current, emptyLine()])} className="rounded-xl border border-[#E5E3B2] px-4 py-2 text-sm font-semibold text-[#536342]">＋ إضافة صنف</button>
          </div>
          <div className="space-y-3 rounded-xl bg-[#176f68] p-4 text-sm text-white">
            <p className="flex flex-wrap items-center justify-between gap-2"><span>إجمالي الفاتورة</span><strong dir="ltr">{formatMoney(formTotal)}</strong></p>
            <p className="flex flex-wrap items-center justify-between gap-2">
              <span>طريقة الدفع</span>
              <select aria-label="طريقة الدفع" value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value as InvoiceForm['paymentMethod'] })} className="min-h-11 w-44 rounded-xl border border-white/30 bg-white px-3 py-2 text-sm text-[#232122]">
                <option value="cash">نقدي</option>
                <option value="credit">آجل</option>
                <option value="partial">دفع جزئي</option>
              </select>
            </p>
            {form.paymentMethod === 'partial' ? (
              <p className="flex flex-wrap items-center justify-between gap-2">
                <span>المدفوع الآن</span>
                <input aria-label="المدفوع الآن" type="number" min="0" step="any" inputMode="decimal" value={form.paidNow} onChange={(event) => setForm({ ...form, paidNow: event.target.value })} className="min-h-11 w-36 rounded-xl border border-white/30 bg-white px-3 py-2 text-sm text-[#232122]" />
              </p>
            ) : null}
            <p className="flex flex-wrap items-center justify-between gap-2 border-t border-white/20 pt-2"><span>المتبقي للمورد</span><strong dir="ltr">{formatMoney(Math.max(0, formTotal - (form.paymentMethod === 'cash' ? formTotal : form.paymentMethod === 'credit' ? 0 : Number(form.paidNow) || 0)))}</strong></p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#ecebd6] pt-4">
            <button type="submit" disabled={saving} className="min-h-11 rounded-xl bg-[#6B8136] px-5 py-2.5 font-semibold text-white disabled:opacity-50">{saving ? 'جارٍ الحفظ…' : 'حفظ كمسودة'}</button>
          </div>
        </form>
      ) : null}

      {supplierDebts.length ? (
        <div className="rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5">
          <h3 className="font-bold text-[#232122]">المديونيات</h3>
          <p className="mt-1 rounded-xl bg-[#FCF5ED] px-3 py-2 text-sm font-semibold text-[#705331]">إجمالي المديونيات (المتبقي للموردين): {formatMoney(totalDebt)}</p>
          <ul className="mt-3 space-y-2">
            {supplierDebts.map((entry) => (
              <li key={entry.supplier} className="flex items-center justify-between gap-3 rounded-xl border border-[#ecebd6] bg-white px-4 py-2.5 text-sm">
                <span className="font-semibold text-[#232122]">{entry.supplier}</span>
                <span className="text-[#705331]">المتبقي: <strong className="text-rose-700">{formatMoney(entry.remaining)}</strong></span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold text-[#232122]">الفواتير ({invoices.length})</h3>
          <strong className="rounded-xl bg-[#FCF5ED] px-3 py-2 text-sm text-[#705331]">إجمالي النتائج: {formatMoney(total)}</strong>
        </div>
        {loading ? <p className="py-8 text-center text-sm text-[#705331]">جارٍ تحميل الفواتير…</p> : invoices.length ? (
          <div className="space-y-3">
            {invoices.map((invoice) => (
              <details key={invoice.id} className="rounded-xl border border-[#ecebd6] bg-white">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-4 text-sm">
                  <span className="font-semibold text-[#232122]">{invoice.supplier} · {invoice.invoiceNumber}</span>
                  <span className="text-[#705331]">{invoice.invoiceDate} · {invoice.items.length} أصناف</span>
                  <span className="font-bold text-[#536342]">{formatMoney(invoice.total)}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${invoice.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-800' : invoice.status === 'CANCELLED' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}`}>{statusLabels[invoice.status]}</span>
                </summary>
                <div className="space-y-4 border-t border-[#ecebd6] p-4">
                  {invoice.notes ? <p className="text-sm text-[#705331]">{invoice.notes}</p> : null}
                  {invoice.paymentMethod ? (
                    <p className="rounded-lg bg-[#f4f6ef] px-3 py-2 text-sm text-[#403d33]">
                      طريقة الدفع: {paymentMethodLabels[invoice.paymentMethod]} · المدفوع {formatMoney(invoice.paidAmount ?? 0)} · المتبقي للمورد {formatMoney(Math.max(0, invoice.total - (invoice.paidAmount ?? 0)))}
                    </p>
                  ) : null}
                  <div className="overflow-x-auto"><table className="w-full min-w-[460px] text-right text-sm"><thead className="text-xs text-[#705331]"><tr><th className="px-2 py-2">الصنف</th><th className="px-2 py-2">الكمية</th><th className="px-2 py-2">سعر الوحدة</th><th className="px-2 py-2">الإجمالي</th></tr></thead><tbody>{invoice.items.map((item: PurchaseInvoiceItem, index) => <tr key={`${item.itemId}-${index}`} className="border-t border-[#f0efdf]"><td className="px-2 py-2">{item.itemName}</td><td className="px-2 py-2">{item.quantity} {item.unit}</td><td className="px-2 py-2">{formatMoney(item.unitPrice)}</td><td className="px-2 py-2">{formatMoney(item.lineTotal)}</td></tr>)}</tbody></table></div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-[#705331]">أنشأها {invoice.createdBy}{invoice.approvedBy ? ` · اعتمدها ${invoice.approvedBy}` : ''}</p>
                    {invoice.status === 'DRAFT' ? <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={saving} onClick={() => startEdit(invoice)} className="rounded-lg border border-[#E5E3B2] px-3 py-2 text-xs font-semibold text-[#536342] disabled:opacity-50">تعديل</button>
                      <button type="button" disabled={saving} onClick={() => void runAction(invoice, 'CANCEL')} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50">إلغاء المسودة</button>
                      <button type="button" disabled={saving} onClick={() => void runAction(invoice, 'APPROVE')} className="rounded-lg bg-[#6B8136] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">اعتماد واستلام</button>
                    </div> : null}
                  </div>
                  <div className="border-t border-[#f0efdf] pt-3"><h4 className="mb-2 text-xs font-bold text-[#705331]">سجل الفاتورة</h4><ol className="space-y-1 text-xs text-[#705331]">{invoice.history.map((entry, index) => <li key={`${entry.at}-${index}`}>{historyLabels[entry.action]} — {entry.actorName} — {new Date(entry.at).toLocaleString('ar-EG')}</li>)}</ol></div>
                </div>
              </details>
            ))}
          </div>
        ) : <p className="py-8 text-center text-sm text-[#705331]">{error ? 'تعذر عرض الفواتير.' : 'لا توجد فواتير مطابقة.'}</p>}
      </div>
    </section>
  );
}
