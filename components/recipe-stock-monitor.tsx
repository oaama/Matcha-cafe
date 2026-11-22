'use client';

import { useEffect, useMemo, useState } from 'react';
import type { InventoryItem, Product, ProductRecipe } from '@/lib/types';
import { calculateRecipeAvailability, RECIPE_LOW_STOCK_THRESHOLD } from '@/lib/recipe-availability';

type RecipeMonitoringData = {
  items: InventoryItem[];
  recipes: ProductRecipe[];
  products: Product[];
};

const statusLabels = {
  'no-recipe': 'لا توجد وصفة مسجلة',
  incomplete: 'الوصفة غير مكتملة',
  untracked: 'رصيد خامة غير مسجل',
  tracked: 'مخزون محسوب',
} as const;

const money = (value: number) => `${value.toFixed(2)} ج.م`;

export default function RecipeStockMonitor() {
  const [inventory, setInventory] = useState<RecipeMonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;
    const loadInventory = async () => {
      try {
        const response = await fetch('/api/dashboard/recipe-stock', { cache: 'no-store' });
        const data = await response.json() as RecipeMonitoringData & { error?: string };
        if (!response.ok) throw new Error(data.error || 'تعذر تحميل بيانات الوصفات والمخزون');
        if (active) {
          setInventory(data);
          setLastUpdated(new Date());
          setError('');
        }
      } catch (loadError: unknown) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل بيانات الوصفات والمخزون');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadInventory();
    const interval = window.setInterval(() => {
      void loadInventory();
    }, 30_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const summary = useMemo(() => inventory
    ? calculateRecipeAvailability(inventory.products, inventory.items, inventory.recipes)
    : null, [inventory]);
  const rows = useMemo(() => {
    if (!summary) return [];
    const query = search.trim().toLocaleLowerCase();
    return summary.rows.filter((row) => !query || row.product.ar.toLocaleLowerCase().includes(query)
      || row.product.en.toLocaleLowerCase().includes(query));
  }, [search, summary]);

  return (
    <section aria-labelledby="recipe-stock-heading" className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="recipe-stock-heading" className="text-xl font-bold text-[#232122]">متابعة الوصفات والمخزون</h2>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#705331]">
            تقدير عدد الحصص الممكنة حسب أرصدة الخامات المسجلة. يظهر التنبيه عند {RECIPE_LOW_STOCK_THRESHOLD} حصص أو أقل؛ والأرصدة غير المتابعة لا تُعامل كأنها صفر.
          </p>
          <p className="mt-1 text-xs leading-5 text-[#705331]">التنبيه للمتابعة فقط ولا يوقف قبول الطلبات تلقائيًا.</p>
        </div>
        <div className="text-left">
          <span className="rounded-full bg-[#f4f6ef] px-3 py-1.5 text-xs font-semibold text-[#66764e]">حد التنبيه: {RECIPE_LOW_STOCK_THRESHOLD} حصص</span>
          {lastUpdated ? <p className="mt-2 text-left text-xs text-[#705331]" aria-live="polite">آخر تحديث: {lastUpdated.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</p> : null}
        </div>
      </header>

      {error ? <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
      {loading ? <p role="status" aria-live="polite" className="rounded-2xl border border-[#E5E3B2] bg-white p-6 text-sm text-[#705331]">جاري تحميل الوصفات والأرصدة…</p> : null}

      {summary ? <>
        <div className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-2xl border border-[#e0eae7] bg-white p-4">
            <p className="text-sm text-[#647b77]">تغطية الوصفات</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">{summary.recipeCoveragePercent.toFixed(1)}%</p>
            <p className="mt-1 text-xs text-[#705331]">{summary.configuredRecipeCount} من {summary.productCount} منتج</p>
          </article>
          <article className={`rounded-2xl border p-4 ${summary.lowStockCount ? 'border-amber-200 bg-amber-50' : 'border-[#e0eae7] bg-white'}`}>
            <p className="text-sm text-[#647b77]">منتجات عند حد التنبيه أو أقل</p>
            <p className={`mt-2 text-2xl font-bold tabular-nums ${summary.lowStockCount ? 'text-amber-800' : 'text-[#232a28]'}`}>{summary.lowStockCount}</p>
            <p className="mt-1 text-xs text-[#705331]">من أصل {summary.productCount} منتج</p>
          </article>
          <article className="rounded-2xl border border-[#e0eae7] bg-white p-4">
            <p className="text-sm text-[#647b77]">الحد الأدنى للتنبيه</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">{RECIPE_LOW_STOCK_THRESHOLD} حصص</p>
            <p className="mt-1 text-xs text-[#705331]">يشمل أرصدة الخامات والمنتجات المتابعة</p>
          </article>
        </div>

        <label className="block">
          <span className="sr-only">ابحث عن منتج</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث عن منتج بالاسم العربي أو الإنجليزي..."
            aria-label="ابحث عن منتج بالاسم العربي أو الإنجليزي"
            className="w-full rounded-xl border-[#E5E3B2] bg-white"
          />
        </label>

        {rows.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {rows.map((row) => (
              <article key={row.product.id} className={`rounded-2xl border bg-white p-4 ${row.isLowStock ? 'border-amber-300 ring-1 ring-amber-100' : 'border-[#e0eae7]'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-[#232122]">{row.product.ar}</h3>
                    <p className="mt-1 text-xs text-[#705331]">{row.product.en}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.isLowStock ? 'bg-amber-100 text-amber-900' : row.status === 'tracked' ? 'bg-[#f4f6ef] text-[#66764e]' : 'bg-stone-100 text-stone-700'}`}>
                    {row.isLowStock ? 'قرب النفاد' : statusLabels[row.status]}
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-[#705331]">الحصص الممكنة</dt>
                    <dd className={`mt-1 font-bold tabular-nums ${row.isLowStock ? 'text-amber-800' : 'text-[#232a28]'}`}>
                      {row.availableServings === undefined ? 'غير محسوبة' : `${row.availableServings} حصة`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#705331]">تكلفة الوصفة</dt>
                    <dd className="mt-1 font-semibold">{row.recipeCost === undefined ? 'غير مكتملة' : money(row.recipeCost)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#705331]">التكلفة من سعر البيع</dt>
                    <dd className="mt-1 font-semibold">{row.foodCostPercent === undefined ? 'غير متاحة' : `${row.foodCostPercent.toFixed(1)}%`}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#705331]">عنصر تحديد الكمية</dt>
                    <dd className="mt-1 font-semibold">{row.bottleneck || '—'}</dd>
                  </div>
                </dl>
                {row.isLowStock ? <p role="status" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">المخزون المسجل يكفي {row.availableServings} حصص فقط. راجع الرصيد قبل تأكيد طلبات جديدة.</p> : null}
              </article>
            ))}
          </div>
        ) : <p className="rounded-2xl border border-dashed border-[#E5E3B2] bg-white p-8 text-center text-sm text-[#705331]">لا توجد منتجات مطابقة للبحث.</p>}
      </> : null}
    </section>
  );
}
