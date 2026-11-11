'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import type { ExpenseRecord, ShiftRecord } from '@/lib/staff-types';
import type { OrderRecord } from '@/lib/types';
import { formatShiftDuration, getShiftDurationMinutes } from '@/lib/shift-time';

type ShiftReceiptData = {
  shift: ShiftRecord;
  orders: OrderRecord[];
  expenses: ExpenseRecord[];
  unattributedOrderCount: number;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function money(value: number) {
  return `${value.toFixed(2)} ج.م`;
}

export default function ShiftReceipt({ shift, onClose }: { shift: ShiftRecord; onClose: () => void }) {
  const [data, setData] = useState<ShiftReceiptData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [printError, setPrintError] = useState('');
  const [clockNow, setClockNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    void fetch(`/api/dashboard/shifts/${encodeURIComponent(shift.id)}`)
      .then(async (response) => {
        const result = await response.json() as ShiftReceiptData & { error?: string };
        if (!response.ok) throw new Error(result.error || 'تعذر تحميل بيانات الشيفت');
        if (active) setData(result);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل بيانات الشيفت');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const timer = shift.endedAt ? undefined : window.setInterval(() => setClockNow(Date.now()), 30_000);
    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, [shift.id, shift.endedAt]);

  const totals = useMemo(() => {
    const orders = data?.orders ?? [];
    const expenses = data?.expenses ?? [];
    const sales = orders.reduce((sum, order) => sum + order.total, 0);
    const cash = orders.reduce((sum, order) => sum + (order.paymentMethod === 'card' ? 0 : order.total), 0);
    const card = orders.reduce((sum, order) => sum + (order.paymentMethod === 'card' ? order.total : 0), 0);
    const expenseTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    return {
      sales,
      cash,
      card,
      expenseTotal,
      subtotal: orders.reduce((sum, order) => sum + order.subtotal, 0),
      service: orders.reduce((sum, order) => sum + order.serviceFee, 0),
      tax: orders.reduce((sum, order) => sum + order.tax, 0),
    };
  }, [data]);

  const printReceipt = async () => {
    setPrintError('');
    try {
      await document.fonts.load('400 12px "Cairo"', 'إيصال الشيفت والمبيعات');
      await document.fonts.load('700 12px "Cairo"', 'إجمالي المبيعات');
      await document.fonts.ready;
      window.print();
    } catch {
      setPrintError('تعذر فتح نافذة الطباعة. تحقق من إعدادات المتصفح والطابعة.');
    }
  };

  return (
    <div className="print-shell fixed inset-0 z-[70] flex items-end justify-center bg-[#183a36]/45 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="shift-receipt-title">
      <div className="flex max-h-[95dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.5rem] bg-white shadow-2xl sm:rounded-[1.5rem]">
        <div className="flex items-center justify-between border-b border-[#dbe7e3] p-4">
          <div>
            <p className="text-xs font-semibold text-[#647b77]">معاينة قبل الطباعة</p>
            <h2 id="shift-receipt-title" className="text-lg font-bold text-[#232a28]">إيصال الشيفت · {shift.username}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-[#f1f8f6] px-3 py-2 text-xl" aria-label="إغلاق المعاينة">×</button>
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-[#dbe7e3] bg-[#f1f8f6] px-4 py-3 text-sm">
          <span className="font-semibold text-[#315d58]">{shift.endedAt ? 'شيفت مكتمل' : 'الشيفت مستمر'}</span>
          <span className="text-[#647b77]">إيصال حراري 80mm</span>
        </div>
        <div className="overflow-y-auto p-4">
          {loading ? <p className="py-12 text-center text-sm text-[#647b77]">جارٍ تحميل مبيعات ومصروفات الشيفت…</p> : null}
          {error ? <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p> : null}
          {data ? (
            <article className="receipt receipt-80 receipt-shift mx-auto bg-white text-[#232a28]" dir="rtl">
              <Image src="/matcha-logo.png" alt="Matcha Coffee and Pancakes" width={72} height={72} className="mx-auto h-16 w-16 rounded-full object-cover" />
              <h3 className="mt-2 text-center text-lg font-bold">MATCHA CAFÉ</h3>
              <p className="text-center text-xs">ملخص مبيعات ومصروفات الشيفت</p>
              <div className="receipt-rule my-3" />
              <div className="space-y-1 text-start text-xs">
                <p><strong>الموظف:</strong> {data.shift.username}</p>
                <p><strong>الوردية:</strong> {data.shift.shiftType === 'DAY' ? 'نهارية' : 'ليلية'}</p>
                <p><strong>بداية الشيفت:</strong> {formatDate(data.shift.startedAt)}</p>
                <p><strong>نهاية الشيفت:</strong> {data.shift.endedAt ? formatDate(data.shift.endedAt) : 'مستمر حتى الآن'}</p>
                <p><strong>مدة الشيفت:</strong> {formatShiftDuration(getShiftDurationMinutes(data.shift, clockNow))}</p>
              </div>

              <div className="receipt-rule my-3" />
              {data.unattributedOrderCount > 0 ? (
                <p className="mb-2 rounded-lg bg-amber-50 p-2 text-[10px] leading-5 text-amber-900 print:bg-transparent">
                  يوجد {data.unattributedOrderCount} طلب مكتمل تزامن مع أكثر من شيفت، ولم يُحتسب لتجنب نسبته لموظف غير صحيح.
                </p>
              ) : null}
              <div className="flex justify-between gap-2 text-xs font-bold">
                <span>الطلبات المكتملة ({data.orders.length})</span><span>{money(totals.sales)}</span>
              </div>
              {data.orders.length ? <div className="mt-2 space-y-3 text-start text-xs">
                {data.orders.map((order) => (
                  <div key={order.id} className="border-b border-dashed border-[#b8c9c4] pb-2">
                    <p className="flex justify-between gap-2 font-semibold"><span>طلب {order.orderNumber}</span><span>{formatDate(order.createdAt)}</span></p>
                    <p className="mt-1 text-[10px]">{order.type === 'DINE_IN' ? `داخلي · طاولة ${order.tableNumber ?? '-'}` : order.type === 'DELIVERY' ? 'توصيل' : 'تيك أواي'}{order.customerName ? ` · ${order.customerName}` : ''}</p>
                    {order.items.map((item, index) => {
                      const unitTotal = item.unitPrice + item.selectedOptions.reduce((sum, option) => sum + option.price, 0);
                      return <p key={`${order.id}-${index}`} className="mt-1 flex justify-between gap-2"><span>{item.nameAr} × {item.quantity}</span><span>{money(unitTotal * item.quantity)}</span></p>;
                    })}
                    <p className="mt-1 flex justify-between font-semibold"><span>إجمالي الطلب</span><span>{money(order.total)}</span></p>
                    <p className="mt-0.5 text-[10px]">الدفع: {order.paymentMethod === 'card' ? 'بطاقة' : 'كاش'}</p>
                  </div>
                ))}
              </div> : <p className="mt-2 text-center text-xs">لا توجد مبيعات مكتملة مسجلة على هذا الشيفت.</p>}

              <div className="receipt-rule my-3" />
              <div className="space-y-1 text-xs">
                <p className="flex justify-between"><span>المجموع قبل الرسوم</span><span>{money(totals.subtotal)}</span></p>
                <p className="flex justify-between"><span>رسوم الخدمة</span><span>{money(totals.service)}</span></p>
                <p className="flex justify-between"><span>الضريبة</span><span>{money(totals.tax)}</span></p>
                <p className="flex justify-between font-bold"><span>إجمالي المبيعات</span><span>{money(totals.sales)}</span></p>
                <p className="flex justify-between"><span>مدفوع نقدًا</span><span>{money(totals.cash)}</span></p>
                <p className="flex justify-between"><span>مدفوع بالبطاقة</span><span>{money(totals.card)}</span></p>
              </div>

              <div className="receipt-rule my-3" />
              <p className="flex justify-between gap-2 text-xs font-bold"><span>المصروفات ({data.expenses.length})</span><span>{money(totals.expenseTotal)}</span></p>
              {data.expenses.length ? <div className="mt-2 space-y-1 text-start text-[10px]">
                {data.expenses.map((expense) => <p key={expense.id} className="flex justify-between gap-2"><span>{expense.description || expense.category}</span><span>{money(expense.amount)}</span></p>)}
              </div> : <p className="mt-1 text-center text-[10px]">لا توجد مصروفات مسجلة على هذا الشيفت.</p>}
              <div className="receipt-rule my-3" />
              <p className="flex justify-between text-sm font-bold"><span>صافي المبيعات بعد المصروفات</span><span>{money(totals.sales - totals.expenseTotal)}</span></p>
              <p className="mt-4 text-center text-[10px]">تم إنشاء هذا الإيصال من سجل الشيفت المحفوظ.</p>
            </article>
          ) : null}
        </div>
        {printError ? <p role="alert" className="px-4 pb-2 text-sm text-rose-700">{printError}</p> : null}
        <div className="flex gap-2 border-t border-[#dbe7e3] p-4">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-[#dbe7e3] px-4 py-3 font-semibold text-[#315d58]">إغلاق</button>
          <button type="button" onClick={printReceipt} disabled={!data} className="flex-1 rounded-xl bg-[#176f68] px-4 py-3 font-semibold text-white disabled:opacity-50">طباعة الإيصال</button>
        </div>
      </div>
    </div>
  );
}
