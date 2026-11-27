'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DailyReport } from '@/lib/daily-report';
import { WORK_DAY_START_HOUR } from '@/lib/shift-time';

// "Today" for the daily report runs 06:00 to 06:00, so a night shift past midnight stays on its day.
const workDayNow = () => new Date(Date.now() - WORK_DAY_START_HOUR * 3_600_000);

function localDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function money(value: number) {
  return `${value.toFixed(2)} ج.م`;
}

export default function DailyReportSection() {
  const [date, setDate] = useState(() => localDate(workDayNow()));
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (targetDate: string) => {
    setLoading(true);
    setError('');
    try {
      const timezoneOffset = -new Date().getTimezoneOffset();
      const response = await fetch(`/api/dashboard/daily?date=${targetDate}&timezoneOffset=${timezoneOffset}`);
      const data = await response.json() as { report?: DailyReport; error?: string };
      if (!response.ok || !data.report) throw new Error(data.error || 'تعذر تحميل تقرير اليومية');
      setReport(data.report);
    } catch (loadError) {
      setReport(null);
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل تقرير اليومية');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(date), 0);
    return () => window.clearTimeout(timeout);
  }, [date, load]);

  return (
    <section aria-labelledby="daily-heading" className="rounded-[1.5rem] border border-[#e0eae7] bg-white/85 p-4 shadow-[0_10px_30px_rgba(29,73,68,.05)] sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="daily-heading" className="text-xl font-bold text-[#232a28]">اليومية</h2>
          <p className="mt-1 text-sm text-[#647b77]">صافي اليوم: الإيراد ناقص تكلفة الخامات والمصاريف وأجور اليوم ونصيب التشغيل الثابت اليومي.</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-[#315d58]">
          التاريخ
          <input
            type="date"
            value={date}
            max={localDate(workDayNow())}
            onChange={(event) => event.target.value && setDate(event.target.value)}
            className="rounded-xl border-[#dbe7e3] bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-[#f2f2eb] motion-reduce:animate-none" />)}
        </div>
      ) : error ? (
        <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      ) : report ? (
        <>
          {report.uncostedOrderCount > 0 ? (
            <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">
              في {report.uncostedOrderCount} طلب من غير تكلفة محفوظة، فأرقام تكلفة الخامات ناقصة.
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-[#e0eae7] bg-white p-4">
              <p className="text-xs font-semibold text-[#647b77]">إجمالي إيراد اليوم ({report.orderCount} طلب + إيراد يدوي)</p>
              <p className="mt-2 text-2xl font-bold text-[#176f68]">{money(report.totalRevenue)}</p>
              <p className="mt-1 text-xs text-[#80918d]">إيراد اليوم {money(report.ordersRevenue)} · إيرادات الشيفتات (مسجّلة يدوياً) {money(report.manualRevenue)}</p>
            </div>
            <div className="rounded-2xl border border-[#e0eae7] bg-white p-4">
              <p className="text-xs font-semibold text-[#647b77]">تكلفة الخامات</p>
              <p className="mt-2 text-2xl font-bold text-[#403d33]">{money(report.productCosts)}</p>
            </div>
            <div className="rounded-2xl border border-[#e0eae7] bg-white p-4">
              <p className="text-xs font-semibold text-[#647b77]">مصاريف اليوم + أجور العمال اليوم + تشغيل شهري موزع يومياً</p>
              <p className="mt-2 text-2xl font-bold text-[#403d33]">{money(report.expenses + report.wages + report.fixedOverhead)}</p>
              <p className="mt-1 text-xs text-[#80918d]">مصاريف اليوم {money(report.expenses)} · أجور العمال اليوم {money(report.wages)} · تشغيل شهري موزع يومياً {money(report.fixedOverhead)}</p>
            </div>
            <div className={`rounded-2xl border p-4 ${report.net >= 0 ? 'border-[#b8d7d1] bg-[#f1f8f6]' : 'border-rose-200 bg-rose-50'}`}>
              <p className="text-xs font-semibold text-[#647b77]">صافي ربح اليوم</p>
              <p className={`mt-2 text-2xl font-bold ${report.net >= 0 ? 'text-[#176f68]' : 'text-rose-700'}`}>{money(report.net)}</p>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="mb-3 font-bold text-[#403d33]">مبيعات الأصناف</h3>
            {report.itemSales.length === 0 ? (
              <p className="rounded-xl bg-[#FCF5ED] px-4 py-6 text-center text-sm text-[#705331]">مفيش مبيعات مسجلة في اليوم ده.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#E5E3B2]">
                <table className="w-full min-w-[560px] text-right text-sm">
                  <thead className="bg-[#f6f7f2] text-xs text-[#6c6d5c]">
                    <tr><th className="px-3 py-2.5">الصنف</th><th className="px-3 py-2.5">الكمية</th><th className="px-3 py-2.5">الإيراد</th><th className="px-3 py-2.5">تكلفة الخامات</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E3B2]">
                    {report.itemSales.map((item) => (
                      <tr key={item.name}>
                        <td className="px-3 py-2.5 font-semibold text-[#403d33]">{item.name}</td>
                        <td className="px-3 py-2.5 tabular-nums">{item.quantity}</td>
                        <td className="px-3 py-2.5 tabular-nums">{money(item.revenue)}</td>
                        <td className="px-3 py-2.5 tabular-nums">{item.cost === undefined ? '—' : money(item.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
