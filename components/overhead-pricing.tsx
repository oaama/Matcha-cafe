'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { InventoryItem, Product, ProductRecipe } from '@/lib/types';
import { getProductPrice } from '@/lib/pricing';
import { calculateRecipeCost } from '@/lib/recipe-cost';
import { DEFAULT_OVERHEAD_CONFIG, summarizeItemCost, type OverheadConfig } from '@/lib/overhead-costing';

type InventoryData = {
  items: InventoryItem[];
  recipes: ProductRecipe[];
  products: Product[];
};

type PricingRow = {
  product: Product;
  salePrice: number;
  materialCost?: number;
  overheadShare?: number;
  fullCost?: number;
  netProfit?: number;
  suggestedSalePrice?: number;
  foodCostPercent?: number;
};

const money = (value?: number) => (value === undefined ? '—' : `${value.toFixed(2)} ج.م`);

export default function OverheadPricing() {
  const [config, setConfig] = useState<OverheadConfig>({ ...DEFAULT_OVERHEAD_CONFIG });
  const [savedConfig, setSavedConfig] = useState<OverheadConfig>({ ...DEFAULT_OVERHEAD_CONFIG });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [inventory, setInventory] = useState<InventoryData>({ items: [], recipes: [], products: [] });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [configResponse, inventoryResponse] = await Promise.all([
        fetch('/api/dashboard/settings/overhead'),
        fetch('/api/dashboard/inventory'),
      ]);
      const configData = await configResponse.json() as { config?: OverheadConfig; error?: string };
      const inventoryData = await inventoryResponse.json() as InventoryData & { error?: string };
      if (!configResponse.ok || !configData.config) throw new Error(configData.error || 'تعذر تحميل إعدادات التشغيل');
      if (!inventoryResponse.ok) throw new Error(inventoryData.error || 'تعذر تحميل بيانات الأصناف');
      setConfig(configData.config);
      setSavedConfig(configData.config);
      setInventory({ items: inventoryData.items ?? [], recipes: inventoryData.recipes ?? [], products: inventoryData.products ?? [] });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل بيانات التشغيل');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const hasChanges = JSON.stringify(config) !== JSON.stringify(savedConfig);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const response = await fetch('/api/dashboard/settings/overhead', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await response.json() as { config?: OverheadConfig; error?: string };
      if (!response.ok || !data.config) throw new Error(data.error || 'تعذر حفظ إعدادات التشغيل');
      setConfig(data.config);
      setSavedConfig(data.config);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ إعدادات التشغيل');
    } finally {
      setSaving(false);
    }
  };

  // Pricing rows always use the SAVED config, so the table only shifts after حفظ.
  const rows = useMemo<PricingRow[]>(() => inventory.products.map((product) => {
    const recipe = inventory.recipes.find((entry) => entry.productId === product.id);
    const recipeCost = calculateRecipeCost(recipe, inventory.items);
    const salePrice = getProductPrice(product);
    if (recipeCost.totalCost === undefined) return { product, salePrice };
    const summary = summarizeItemCost({
      salePrice,
      materialCost: recipeCost.totalCost,
      settings: savedConfig,
      targetFoodCostPercent: savedConfig.targetFoodCostPercent,
    });
    return {
      product,
      salePrice,
      materialCost: summary.materialCost,
      overheadShare: summary.overheadShare,
      fullCost: summary.fullCost,
      netProfit: summary.netProfit,
      suggestedSalePrice: summary.suggestedSalePrice,
      foodCostPercent: summary.foodCostPercent,
    };
  }), [inventory, savedConfig]);

  const totals = useMemo(() => ({
    monthlyFixed: savedConfig.rent + savedConfig.labor + savedConfig.electricity + savedConfig.water + savedConfig.internet + savedConfig.other,
    perUnit: rows.find((row) => row.overheadShare !== undefined)?.overheadShare,
  }), [savedConfig, rows]);

  return (
    <div className="space-y-7">
      <section aria-labelledby="overhead-heading" className="rounded-[1.5rem] border border-[#E5E3B2] bg-white/85 p-4 shadow-[0_8px_24px_rgba(44,43,35,.04)] sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="overhead-heading" className="text-xl font-bold text-[#232122]">التشغيل الثابت الشهري</h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#705331]">المصاريف الثابتة بتتوزع على عدد الأصناف المتوقع بيعها في الشهر عشان تعرف التكلفة الكاملة وصافي ربح كل صنف.</p>
          </div>
          {!loading && !error ? (
            <div className="rounded-2xl bg-[#f4f6ef] px-4 py-3 text-sm font-semibold text-[#403d33]">
              <p>إجمالي التشغيل الشهري: {money(totals.monthlyFixed)}</p>
              <p className="mt-1">نصيب التشغيل للوحدة: {money(totals.perUnit)}</p>
            </div>
          ) : null}
        </div>
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-[#f2f2eb] motion-reduce:animate-none" />)}
          </div>
        ) : error ? (
          <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {([
                ['rent', 'إيجار'],
                ['labor', 'عمالة ثابتة'],
                ['electricity', 'كهربا'],
                ['water', 'مياه'],
                ['internet', 'نت'],
                ['other', 'أخرى'],
                ['expectedMonthlyUnits', 'عدد الأصناف المتوقع شهريًا'],
                ['targetFoodCostPercent', 'نسبة تكلفة الأكل المستهدفة ٪'],
              ] as Array<[keyof OverheadConfig, string]>).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between gap-3 rounded-2xl border border-[#E5E3B2] bg-[#fcfcf9] px-4 py-3 text-sm font-medium text-[#705331]">
                  {label}
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={config[key]}
                    onChange={(event) => {
                      const value = event.target.value === '' ? 0 : Number(event.target.value);
                      setConfig((current) => ({ ...current, [key]: value }));
                      setSaved(false);
                    }}
                    className="w-28 rounded-lg border-[#E5E3B2] bg-white px-3 py-2 text-center tabular-nums"
                  />
                </label>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p role="status" className="text-sm text-[#66764e]">
                {saved ? 'تم حفظ إعدادات التشغيل.' : hasChanges ? 'لديك تغييرات غير محفوظة.' : 'إعدادات التشغيل الحالية محفوظة.'}
              </p>
              <button
                type="button"
                onClick={() => void save()}
                disabled={!hasChanges || saving || loading}
                className="rounded-xl bg-[#6B8136] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(67,93,50,.15)] transition hover:bg-[#5d702f] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {saving ? 'جارٍ حفظ الإعدادات…' : 'حفظ إعدادات التشغيل'}
              </button>
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="pricing-heading" className="rounded-[1.5rem] border border-[#E5E3B2] bg-white/85 p-4 shadow-[0_8px_24px_rgba(44,43,35,.04)] sm:p-6">
        <div className="mb-5">
          <h2 id="pricing-heading" className="text-xl font-bold text-[#232122]">تكلفة وسعر كل صنف</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#705331]">تكلفة الخامات من وصفة كل صنف، وعليها نصيب التشغيل الثابت. السعر المقترح بيحقق نسبة تكلفة الأكل المستهدفة ({savedConfig.targetFoodCostPercent}٪).</p>
        </div>
        {loading ? null : rows.length === 0 ? (
          <p className="rounded-xl bg-[#FCF5ED] px-4 py-6 text-center text-sm text-[#705331]">مفيش أصناف في المنيو لسه.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="text-right text-xs text-[#705331]">
                  <th className="px-3 py-1">الصنف</th>
                  <th className="px-3 py-1">سعر البيع</th>
                  <th className="px-3 py-1">تكلفة الخامات</th>
                  <th className="px-3 py-1">نصيب التشغيل</th>
                  <th className="px-3 py-1">التكلفة الكاملة</th>
                  <th className="px-3 py-1">صافي الربح</th>
                  <th className="px-3 py-1">السعر المقترح</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.product.id} className="bg-[#fcfcf9]">
                    <td className="rounded-r-xl border-y border-r border-[#eee9d8] px-3 py-2.5 font-semibold text-[#403d33]">{row.product.ar}</td>
                    <td className="border-y border-[#eee9d8] px-3 py-2.5 tabular-nums">{money(row.salePrice)}</td>
                    <td className="border-y border-[#eee9d8] px-3 py-2.5 tabular-nums">{money(row.materialCost)}</td>
                    <td className="border-y border-[#eee9d8] px-3 py-2.5 tabular-nums">{money(row.overheadShare)}</td>
                    <td className="border-y border-[#eee9d8] px-3 py-2.5 tabular-nums">{money(row.fullCost)}</td>
                    <td className={`border-y border-[#eee9d8] px-3 py-2.5 font-semibold tabular-nums ${row.netProfit !== undefined && row.netProfit < 0 ? 'text-rose-700' : 'text-[#315d58]'}`}>{money(row.netProfit)}</td>
                    <td className="rounded-l-xl border-y border-l border-[#eee9d8] px-3 py-2.5 font-semibold tabular-nums text-[#6B8136]">{money(row.suggestedSalePrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
