'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ActivityLogRecord } from '@/lib/activity-log-repository';
import type { ShiftRecord } from '@/lib/staff-types';
import type { OrderRecord } from '@/lib/types';

type FinanceSummary = {
  sales: number;
  onlineOrderRevenue: number;
  manualRevenue: number;
  productCosts: number;
  savedProductCosts: number;
  estimatedProductCosts: number;
  uncostedOrderCount: number;
  operatingExpenses: number;
  baseWages: number;
  overtimeCosts: number;
  advances: number;
  outstandingDebts: number;
  approvedPurchases: number;
  operationalResult: number;
  orderCount: number;
  averageOrderValue: number;
};
type DailySummary = { date: string; online: number; manual: number; expenses: number };
type LowStockItem = { id: string; name: string; quantity: number; unit: string; outOfStock: boolean };
type FinanceResponse = {
  summary?: FinanceSummary;
  daily?: DailySummary[];
  recentOrders?: OrderRecord[];
  recentActivities?: ActivityLogRecord[];
  lowStock?: LowStockItem[];
  activeShifts?: ShiftRecord[];
  attendanceCount?: number;
  error?: string;
};
type Preset = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'previousMonth' | 'custom';

function localDate(date: Date) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
}

function money(value: number) {
  return `${value.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
}

function rangeFor(preset: Exclude<Preset, 'custom'>) {
  const end = new Date();
  const start = new Date(end);
  if (preset === 'yesterday') {
    start.setDate(start.getDate() - 1);
    return { from: localDate(start), to: localDate(start) };
  }
  if (preset === 'last7') {
    start.setDate(start.getDate() - 6);
  } else if (preset === 'thisMonth') {
    start.setDate(1);
  } else if (preset === 'previousMonth') {
    start.setDate(1);
    start.setMonth(start.getMonth() - 1);
    end.setDate(0);
  }
  return { from: localDate(start), to: localDate(end) };
}

const actionLabels: Record<string, string> = {
  PURCHASE_CREATED: 'إنشاء فاتورة مشتريات',
  PURCHASE_UPDATED: 'تعديل فاتورة مشتريات',
  PURCHASE_APPROVED: 'اعتماد فاتورة مشتريات',
  PURCHASE_CANCELLED: 'إلغاء فاتورة مشتريات',
  REVENUE_CREATED: 'تسجيل إيراد يدوي',
  REVENUE_UPDATED: 'تعديل إيراد يدوي',
  REVENUE_DELETED: 'حذف إيراد يدوي',
  DEBT_CREATED: 'تسجيل دين يدوي',
  DEBT_UPDATED: 'تعديل دين',
  DEBT_DELETED: 'حذف دين',
  DEBT_PAYMENT_CREATED: 'تسجيل سداد دين',
  DEBT_PAYMENT_UPDATED: 'تعديل سداد دين',
  DEBT_PAYMENT_DELETED: 'حذف سداد دين',
  PAYROLL_PROFILE_UPDATED: 'تحديث ملف موظف',
  PAYROLL_ADVANCE_CREATED: 'تسجيل سلفة',
  PAYROLL_ADVANCE_DELETED: 'حذف سلفة',
  PAYROLL_OVERTIME_CREATED: 'تسجيل عمل إضافي',
  PAYROLL_OVERTIME_DELETED: 'حذف عمل إضافي',
};

export default function FinancialOverview() {
  const [preset, setPreset] = useState<Preset>('thisMonth');
  const [range, setRange] = useState(() => rangeFor('thisMonth'));
  const [data, setData] = useState<FinanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const timezoneOffset = new Date().getTimezoneOffset();
      const params = new URLSearchParams({ from: range.from, to: range.to, timezoneOffset: String(timezoneOffset) });
      const response = await fetch(`/api/dashboard/finance?${params}`);
      const result = await response.json() as FinanceResponse;
      if (!response.ok) throw new Error(result.error || 'تعذر تحميل الملخص المالي');
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل الملخص المالي');
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const changePreset = (next: Preset) => {
    setPreset(next);
    if (next !== 'custom') setRange(rangeFor(next));
  };
  const summary = data?.summary;
  const chartMax = useMemo(() => Math.max(1, ...(data?.daily ?? []).flatMap((day) => [day.online, day.manual, day.expenses])), [data?.daily]);
  const cards = summary ? [
    { label: 'إجمالي إيراد', value: money(summary.sales), note: `${summary.orderCount} طلب مكتمل` },
    { label: 'إيرادات الطلبات الإلكترونية', value: money(summary.onlineOrderRevenue), note: 'مصدرها الطلبات المكتملة' },
    { label: 'إيرادات الشيفتات (مسجّلة يدوياً)', value: money(summary.manualRevenue), note: 'مفصولة عن الطلبات الإلكترونية' },
    { label: 'تكلفة المنتجات', value: money(summary.productCosts), note: `${money(summary.savedProductCosts)} محفوظة · ${money(summary.estimatedProductCosts)} تقديرية` },
    { label: 'المصاريف', value: money(summary.operatingExpenses), note: 'من سجل المصروفات' },
    { label: 'أجور العمال', value: money(summary.baseWages), note: 'من ساعات الشيفتات' },
    { label: 'تكلفة العمل الإضافي', value: money(summary.overtimeCosts), note: 'من سجلات الإضافي' },
    { label: 'السلف المسجلة', value: money(summary.advances), note: 'عرض منفصل؛ لا تخصم مرتين من النتيجة' },
    { label: 'الديون القائمة', value: money(summary.outstandingDebts), note: 'التزامات حالية' },
    { label: 'المشتريات المعتمدة', value: money(summary.approvedPurchases), note: 'تُعرض منفصلة ولا تُخصم كمصروف' },
    { label: 'متوسط قيمة الطلب', value: money(summary.averageOrderValue), note: 'على الطلبات المكتملة' },
    { label: 'صافي ربح', value: money(summary.operationalResult), note: 'المبيعات + الإيراد اليدوي − التكلفة والمصروفات والأجور', emphasis: true },
  ] : [];

  return (
    <section className="space-y-5" dir="rtl">
      <header className="flex flex-wrap items-end justify-between gap-4 rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5">
        <div><h2 className="text-xl font-bold text-[#232122]">نظرة عامة مالية وتشغيلية</h2><p className="mt-1 text-sm leading-6 text-[#705331]">كل مصدر معروض منفصلًا، مع إبقاء المشتريات والديون والسلف خارج احتساب المصروفات التشغيلية لتجنب التكرار.</p></div>
        <div className="flex flex-wrap gap-2" aria-label="فترة الملخص">
          {([
            ['today', 'اليوم'],
            ['yesterday', 'أمس'],
            ['last7', 'آخر 7 أيام'],
            ['thisMonth', 'هذا الشهر'],
            ['previousMonth', 'الشهر السابق'],
            ['custom', 'مخصص'],
          ] as Array<[Preset, string]>).map(([key, label]) => <button key={key} type="button" aria-pressed={preset === key} onClick={() => changePreset(key)} className={`min-h-10 rounded-lg px-3 text-xs font-semibold ${preset === key ? 'bg-[#6B8136] text-white' : 'border border-[#E5E3B2] bg-white text-[#536342]'}`}>{label}</button>)}
        </div>
        <div className="flex gap-2">
          <label className="grid gap-1 text-xs font-semibold text-[#705331]">من<input type="date" value={range.from} max={range.to} onChange={(event) => { setPreset('custom'); setRange({ ...range, from: event.target.value }); }} className="min-h-10 rounded-lg border border-[#E5E3B2] px-2" /></label>
          <label className="grid gap-1 text-xs font-semibold text-[#705331]">إلى<input type="date" value={range.to} min={range.from} onChange={(event) => { setPreset('custom'); setRange({ ...range, to: event.target.value }); }} className="min-h-10 rounded-lg border border-[#E5E3B2] px-2" /></label>
        </div>
      </header>

      {error ? <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
      {summary?.uncostedOrderCount ? <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">تكلفة {summary.uncostedOrderCount} طلب مكتمل غير متاحة من سجلات المخزون، لذلك لا تدخل في تكلفة المنتجات أو النتيجة. تكلفة الطلبات القديمة الأخرى تقديرية باستخدام الوصفات والتكاليف الحالية.</p> : null}
      {loading && !data ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-[#e8eee8] motion-reduce:animate-none" />)}</div> : null}
      {summary ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => <article key={card.label} className={`rounded-2xl border bg-white p-4 ${card.emphasis ? 'border-[#819661] ring-1 ring-[#819661]/20' : 'border-[#e4e6d5]'}`}>
          <h3 className="text-xs font-semibold text-[#647b77]">{card.label}</h3><p className={`mt-3 text-xl font-bold tabular-nums ${card.emphasis ? 'text-[#536342]' : 'text-[#232a28]'}`}>{card.value}</p><p className="mt-1 text-[11px] leading-5 text-[#8b8b7b]">{card.note}</p>
        </article>)}
      </div> : null}

      <section className="rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5">
        <div className="mb-4"><h3 className="font-bold text-[#232122]">الإيراد والمصروف اليومي</h3><p className="mt-1 text-xs text-[#705331]">الأعمدة توضح المبيعات الإلكترونية، الإيرادات اليدوية، والمصروفات كلٌّ على حدة.</p></div>
        {data?.daily?.length ? <div className="max-h-[28rem] space-y-3 overflow-y-auto">
          {data.daily.map((day) => <div key={day.date} className="grid grid-cols-[5.5rem_1fr] items-center gap-3 text-xs sm:grid-cols-[7rem_1fr]">
            <time className="text-[#705331]">{day.date}</time>
            <div className="space-y-1">
              <Bar label="مبيعات إلكترونية" value={day.online} max={chartMax} color="bg-[#6B8136]" />
              <Bar label="يدوي" value={day.manual} max={chartMax} color="bg-[#9a825d]" />
              <Bar label="مصروفات" value={day.expenses} max={chartMax} color="bg-[#b57a71]" />
            </div>
          </div>)}
        </div> : <p className="text-sm text-[#705331]">{loading ? 'جارٍ تحميل الرسم…' : 'لا توجد حركة لهذه الفترة.'}</p>}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5">
          <h3 className="mb-3 font-bold text-[#232122]">تنبيهات المخزون</h3>
          {data?.lowStock?.length ? <ul className="space-y-2">{data.lowStock.map((item) => <li key={item.id} className={`flex justify-between gap-3 rounded-xl px-3 py-2 text-sm ${item.outOfStock ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-900'}`}><span>{item.name}</span><strong>{item.outOfStock ? 'نفد المخزون' : `${item.quantity} ${item.unit}`}</strong></li>)}</ul> : <p className="text-sm text-[#705331]">لا توجد تنبيهات مخزون حاليًا.</p>}
        </section>
        <section className="rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5">
          <h3 className="mb-3 font-bold text-[#232122]">حالة التشغيل</h3>
          <p className="text-sm text-[#705331]">الشيفتات النشطة الآن: <strong>{data?.activeShifts?.length ?? 0}</strong></p>
          <p className="mt-2 text-sm text-[#705331]">موظفون لديهم ساعات حضور في الفترة: <strong>{data?.attendanceCount ?? 0}</strong></p>
          {data?.activeShifts?.length ? <ul className="mt-3 space-y-2">{data.activeShifts.map((shift) => <li key={shift.id} className="rounded-xl bg-[#f7f7f0] px-3 py-2 text-sm">{shift.username} · {shift.shiftType === 'DAY' ? 'نهاري' : 'ليلي'} · بدأ {new Date(shift.startedAt).toLocaleString('ar-EG')}</li>)}</ul> : null}
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="overflow-x-auto rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5">
          <h3 className="mb-3 font-bold text-[#232122]">أحدث الطلبات</h3>
          <table className="w-full min-w-[460px] text-right text-sm"><thead><tr className="border-b border-[#E5E3B2] text-[#705331]"><th className="py-2">الطلب</th><th className="py-2">الوقت</th><th className="py-2">الحالة</th><th className="py-2">الإجمالي</th></tr></thead><tbody>
            {data?.recentOrders?.length ? data.recentOrders.map((order) => <tr key={order.id} className="border-b border-[#ecebd6]"><td className="py-2">{order.orderNumber}</td><td className="py-2">{new Date(order.createdAt).toLocaleString('ar-EG')}</td><td className="py-2">{order.status}</td><td className="py-2">{money(order.total)}</td></tr>) : <tr><td colSpan={4} className="py-4 text-center text-[#705331]">لا توجد طلبات في الفترة.</td></tr>}
          </tbody></table>
        </section>
        <section className="rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5">
          <h3 className="mb-3 font-bold text-[#232122]">أحدث الحركات المالية</h3>
          {data?.recentActivities?.length ? <ul className="space-y-2">{data.recentActivities.map((activity) => <li key={activity.id} className="rounded-xl bg-[#f7f7f0] px-3 py-2 text-sm"><p className="font-semibold">{actionLabels[activity.action] ?? activity.action} · {activity.actorName}</p><p className="mt-1 text-xs text-[#705331]">{new Date(activity.createdAt).toLocaleString('ar-EG')} · {activity.details.supplier ?? activity.details.amount ?? activity.entityId}</p></li>)}</ul> : <p className="text-sm text-[#705331]">لا توجد حركات مالية مسجلة في الفترة.</p>}
        </section>
      </div>
    </section>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const width = Math.max(value > 0 ? 2 : 0, (value / max) * 100);
  return <div className="flex items-center gap-2"><span className="w-24 shrink-0 text-[10px] text-[#705331] sm:w-32">{label}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-[#f0efdf]" role="img" aria-label={`${label}: ${money(value)}`}><div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} /></div><span className="w-20 text-left tabular-nums text-[#705331]">{money(value)}</span></div>;
}
