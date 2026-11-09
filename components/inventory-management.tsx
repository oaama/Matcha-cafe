'use client';

import { useEffect, useMemo, useState } from 'react';
import type { InventoryItem, InventoryMovement, Product, ProductRecipe } from '@/lib/types';

type InventoryData = {
  items: InventoryItem[];
  recipes: ProductRecipe[];
  products: Product[];
  movements: InventoryMovement[];
};

const inputClass = 'rounded-xl border-[#E5E3B2] bg-white px-3 py-2 text-sm';

function localDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function InventoryManagement() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [recipes, setRecipes] = useState<ProductRecipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [ingredientName, setIngredientName] = useState('');
  const [ingredientUnit, setIngredientUnit] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 6);
    return localDate(date);
  });
  const [to, setTo] = useState(() => localDate(new Date()));
  const [adjustment, setAdjustment] = useState<{ itemId: string; quantity: string; note: string; direction: 1 | -1 } | null>(null);

  const loadInventory = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/dashboard/inventory');
      const data = await response.json() as InventoryData & { error?: string };
      if (!response.ok) throw new Error(data.error || 'تعذر تحميل المخزون');
      setItems(data.items);
      setRecipes(data.recipes);
      setProducts(data.products);
      setMovements(data.movements);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل المخزون');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadInventory(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const productItems = useMemo(() => items.filter((item) => item.type === 'product'
    && (!search.trim() || item.name.toLowerCase().includes(search.trim().toLowerCase()))), [items, search]);
  const allIngredients = useMemo(() => items.filter((item) => item.type === 'ingredient'), [items]);
  const ingredients = useMemo(() => allIngredients
    .filter((item) => !search.trim() || item.name.toLowerCase().includes(search.trim().toLowerCase())), [allIngredients, search]);
  const recipeProducts = useMemo(() => products.filter((product) => !search.trim()
    || product.ar.toLowerCase().includes(search.trim().toLowerCase())), [products, search]);
  const isStockTracked = (item: InventoryItem) => item.trackStock || item.quantity > 0 || item.lowStockThreshold > 0;
  const lowStockCount = items.filter((item) => isStockTracked(item) && item.quantity <= item.lowStockThreshold).length;
  const trackedCount = items.filter(isStockTracked).length;
  const uninitializedCount = items.filter((item) => !isStockTracked(item)).length;

  const saveSettings = async (nextItems = items, nextRecipes = recipes) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/dashboard/inventory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: nextItems, recipes: nextRecipes }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'تعذر حفظ إعدادات المخزون');
      setItems(nextItems);
      setRecipes(nextRecipes);
      setMessage('اتحفظت إعدادات المخزون والوصفات.');
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ إعدادات المخزون');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addIngredient = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const item: InventoryItem = {
      id: `ingredient:${crypto.randomUUID()}`,
      type: 'ingredient',
      name: ingredientName.trim(),
      unit: ingredientUnit.trim(),
      quantity: 0,
      lowStockThreshold: 0,
      trackStock: true,
    };
    if (await saveSettings([...items, item])) {
      setIngredientName('');
      setIngredientUnit('');
    }
  };

  const updateItem = (itemId: string, patch: Partial<InventoryItem>) => {
    setItems((current) => current.map((item) => item.id === itemId ? { ...item, ...patch } : item));
    setMessage('');
  };

  const updateRecipe = (productId: string, recipe: ProductRecipe | null) => {
    setRecipes((current) => [
      ...current.filter((entry) => entry.productId !== productId),
      ...(recipe ? [recipe] : []),
    ]);
    setMessage('');
  };

  const addRecipeIngredient = (productId: string, itemId: string, quantity: number) => {
    const recipe = recipes.find((entry) => entry.productId === productId) ?? { productId, ingredients: [] };
    if (recipe.ingredients.some((ingredient) => ingredient.itemId === itemId)) return;
    updateRecipe(productId, { ...recipe, ingredients: [...recipe.ingredients, { itemId, quantity }] });
  };

  const downloadReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (downloading) return;
    setDownloading(true);
    setError('');
    setMessage('');
    try {
      const timezoneOffset = new Date().getTimezoneOffset();
      const response = await fetch(`/api/dashboard/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&timezoneOffset=${timezoneOffset}`);
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error || 'تعذر إنشاء التقرير');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `matcha-report-${from}-${to}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage('اتحمّل تقرير Excel بالفترة اللي اخترتها.');
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'تعذر إنشاء التقرير');
    } finally {
      setDownloading(false);
    }
  };

  const selectLastWeek = () => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    setFrom(localDate(start));
    setTo(localDate(end));
  };

  const adjustStock = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!adjustment) return;
    const quantity = Number(adjustment.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('أدخل كمية أكبر من صفر.');
      return;
    }
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/dashboard/inventory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: adjustment.itemId,
          delta: adjustment.direction * quantity,
          note: adjustment.note.trim() || undefined,
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'تعذر تحديث الرصيد');
      setAdjustment(null);
      setMessage('اتسجلت حركة المخزون.');
      await loadInventory();
    } catch (adjustError) {
      setError(adjustError instanceof Error ? adjustError.message : 'تعذر تحديث الرصيد');
    }
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="report-heading" className="rounded-[1.5rem] border border-[#E5E3B2] bg-white/85 p-4 shadow-[0_8px_24px_rgba(44,43,35,.04)] sm:p-6">
        <div className="mb-4">
          <h2 id="report-heading" className="text-xl font-bold text-[#232122]">تقارير Excel</h2>
          <p className="mt-1 text-sm leading-6 text-[#705331]">نزّل ملخص المبيعات والطلبات ورصيد المخزون وحركته لأي فترة تختارها.</p>
        </div>
        <form onSubmit={(event) => void downloadReport(event)} className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5 text-sm font-semibold text-[#232122]">
            من
            <input required type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className={inputClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-[#232122]">
            إلى
            <input required type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className={inputClass} />
          </label>
          <button type="button" onClick={selectLastWeek} className="rounded-xl border border-[#c9d19e] bg-white px-4 py-2.5 text-sm font-semibold text-[#6B8136] transition hover:bg-[#f4f6ef]">آخر 7 أيام</button>
          <button disabled={downloading || !from || !to} type="submit" className="rounded-xl bg-[#6B8136] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5d702f] disabled:opacity-50">
            {downloading ? 'جارٍ تجهيز التقرير…' : 'تنزيل تقرير Excel'}
          </button>
        </form>
      </section>

      <section aria-labelledby="inventory-heading" className="rounded-[1.5rem] border border-[#E5E3B2] bg-white/85 p-4 shadow-[0_8px_24px_rgba(44,43,35,.04)] sm:p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="inventory-heading" className="text-xl font-bold text-[#232122]">إدارة المخزون</h2>
            <p className="mt-1 text-sm text-[#705331]">سجّل الرصيد الافتتاحي للصنف مرة واحدة؛ بعدها يُخصم تلقائيًا مع كل طلب ويظهر عند انخفاضه.</p>
          </div>
          <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${lowStockCount ? 'bg-amber-50 text-amber-800' : 'bg-[#f4f6ef] text-[#66764e]'}`}>
            {lowStockCount ? `${lowStockCount} محتاج مراجعة` : uninitializedCount ? `${uninitializedCount} رصيد غير مُسجل` : trackedCount ? 'الأرصدة المتابعة تمام' : 'لا توجد أصناف بالمخزون'}
          </span>
        </div>

        {error ? <p role="alert" className="mb-4 rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
        {message ? <p role="status" className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}

        {loading ? (
          <div aria-label="جارٍ تحميل المخزون" aria-busy="true" className="grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((key) => <div key={key} className="h-24 animate-pulse rounded-2xl bg-[#f2f2eb] motion-reduce:animate-none" />)}
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="دور على صنف أو خامة..." aria-label="البحث في المخزون" className={`${inputClass} min-w-[min(100%,16rem)] flex-1`} />
              <button type="button" disabled={saving} onClick={() => void saveSettings()} className="rounded-xl bg-[#6B8136] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5d702f] disabled:opacity-50">
                {saving ? 'جارٍ الحفظ…' : 'حفظ إعدادات المخزون'}
              </button>
            </div>
            <form onSubmit={(event) => void addIngredient(event)} className="mb-6 grid gap-3 rounded-2xl border border-dashed border-[#dfe2d5] bg-[#fafbf7] p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="grid gap-1.5 text-sm font-semibold text-[#232122]">
                خامة جديدة
                <input required maxLength={150} value={ingredientName} onChange={(event) => setIngredientName(event.target.value)} placeholder="مثال: لبن كامل الدسم" className={inputClass} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#232122]">
                وحدة القياس
                <input required maxLength={30} value={ingredientUnit} onChange={(event) => setIngredientUnit(event.target.value)} placeholder="مل، جرام، قطعة..." className={inputClass} />
              </label>
              <button disabled={saving} className="rounded-xl border border-[#c9d19e] bg-white px-4 py-2.5 text-sm font-semibold text-[#6B8136] transition hover:bg-[#f4f6ef] disabled:opacity-50">
                {saving ? 'جارٍ الحفظ…' : 'إضافة خامة'}
              </button>
            </form>

            <div className="mb-7">
              <h3 className="mb-3 font-bold text-[#403d33]">أرصدة الأصناف الجاهزة للبيع</h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {productItems.map((item) => (
                  <InventoryCard key={item.id} item={item} onAdjust={() => setAdjustment({ itemId: item.id, quantity: '', note: '', direction: 1 })} onUpdate={updateItem} />
                ))}
              </div>
              <p className="mt-2 text-xs leading-5 text-[#89877c]">مافيش تفعيل يدوي مطلوب: أول ما تضيف رصيد للصنف، يدخل المتابعة ويتخصم تلقائيًا مع الطلب. الأصناف اللي رصيدها صفر وغير مُسجل تفضل متاحة للبيع لحد تسجيل رصيدها.</p>
            </div>

            <div className="mb-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-bold text-[#403d33]">الخامات والوصفات</h3>
                <button type="button" disabled={saving} onClick={() => void saveSettings()} className="rounded-xl bg-[#6B8136] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5d702f] disabled:opacity-50">
                  {saving ? 'جارٍ الحفظ…' : 'حفظ الإعدادات والوصفات'}
                </button>
              </div>
              {ingredients.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#E5E3B2] px-4 py-8 text-center text-sm text-[#705331]">ضيف الخامات الأول، وبعدها اربط كل منتج بمكوناته.</div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {ingredients.map((item) => (
                    <InventoryCard key={item.id} item={item} onAdjust={() => setAdjustment({ itemId: item.id, quantity: '', note: '', direction: 1 })} onUpdate={updateItem} />
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="mb-3 font-bold text-[#403d33]">وصفة كل منتج</h3>
              {recipeProducts.map((product) => {
                const recipe = recipes.find((entry) => entry.productId === product.id);
                return (
                  <details key={product.id} className="group rounded-xl border border-[#E5E3B2] bg-white">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold text-[#403d33]">
                      <span>{product.ar}</span>
                      <span className="text-xs font-medium text-[#705331]">{recipe?.ingredients.length ? `${recipe.ingredients.length} خامة` : 'من غير وصفة'}</span>
                    </summary>
                    <div className="space-y-3 border-t border-[#E5E3B2] p-4">
                      {(recipe?.ingredients ?? []).map((entry) => {
                        const ingredient = ingredients.find((item) => item.id === entry.itemId);
                        return (
                          <div key={entry.itemId} className="flex items-center justify-between gap-3 rounded-lg bg-[#f8f8f4] px-3 py-2 text-sm">
                            <span>{ingredient?.name ?? 'خامة محذوفة'}</span>
                            <span className="flex items-center gap-3 text-[#705331]">
                              {entry.quantity} {ingredient?.unit}
                              <button type="button" aria-label={`إزالة ${ingredient?.name ?? 'الخامة'} من وصفة ${product.ar}`} onClick={() => {
                                const nextIngredients = recipe!.ingredients.filter((row) => row.itemId !== entry.itemId);
                                updateRecipe(product.id, nextIngredients.length ? { ...recipe!, ingredients: nextIngredients } : null);
                              }} className="font-bold text-rose-700">×</button>
                            </span>
                          </div>
                        );
                      })}
                      <RecipeIngredientForm ingredients={allIngredients} onAdd={(itemId, quantity) => addRecipeIngredient(product.id, itemId, quantity)} />
                    </div>
                  </details>
                );
              })}
            </div>

            <div className="mt-7">
              <h3 className="mb-3 font-bold text-[#403d33]">آخر حركات المخزون</h3>
              {movements.length === 0 ? (
                <p className="rounded-xl bg-[#FCF5ED] px-4 py-6 text-center text-sm text-[#705331]">الحركات هتظهر هنا بعد تسجيل إضافة أو خصم أو طلب.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[#E5E3B2]">
                  <table className="w-full min-w-[600px] text-right text-sm">
                    <thead className="bg-[#f6f7f2] text-xs text-[#6c6d5c]">
                      <tr><th className="px-3 py-2.5">التاريخ</th><th className="px-3 py-2.5">الصنف</th><th className="px-3 py-2.5">الحركة</th><th className="px-3 py-2.5">الكمية</th><th className="px-3 py-2.5">ملاحظة</th></tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E3B2]">
                      {movements.slice(0, 20).map((movement) => (
                        <tr key={movement.id}>
                          <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[#705331]">{new Date(movement.createdAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</td>
                          <td className="px-3 py-2.5 font-medium">{movement.itemName}</td>
                          <td className="px-3 py-2.5 text-xs">{movement.reason === 'sale' ? 'طلب' : movement.reason === 'cancellation' ? 'إلغاء طلب' : 'تعديل يدوي'}</td>
                          <td dir="ltr" className={`whitespace-nowrap px-3 py-2.5 font-semibold ${movement.quantity < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{movement.quantity > 0 ? '+' : ''}{movement.quantity}</td>
                          <td className="px-3 py-2.5 text-xs text-[#705331]">{movement.note ?? movement.referenceId ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {adjustment ? (
        <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setAdjustment(null);
        }}>
          <form onSubmit={(event) => void adjustStock(event)} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#232122]">{adjustment.direction === 1 ? 'إضافة للمخزون' : 'خصم من المخزون'}</h3>
              <button type="button" onClick={() => setAdjustment(null)} aria-label="إغلاق" className="rounded-lg px-2 py-1 text-xl text-[#705331]">×</button>
            </div>
            <div className="mb-4 flex gap-2">
              <button type="button" aria-pressed={adjustment.direction === 1} onClick={() => setAdjustment({ ...adjustment, direction: 1 })} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${adjustment.direction === 1 ? 'bg-[#6B8136] text-white' : 'bg-[#f4f3ef] text-[#705331]'}`}>إضافة</button>
              <button type="button" aria-pressed={adjustment.direction === -1} onClick={() => setAdjustment({ ...adjustment, direction: -1 })} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${adjustment.direction === -1 ? 'bg-rose-700 text-white' : 'bg-[#f4f3ef] text-[#705331]'}`}>خصم</button>
            </div>
            <label className="mb-3 grid gap-1.5 text-sm font-semibold text-[#232122]">
              الكمية
              <input required min="0.001" step="any" type="number" inputMode="decimal" value={adjustment.quantity} onChange={(event) => setAdjustment({ ...adjustment, quantity: event.target.value })} className={inputClass} />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-[#232122]">
              ملاحظة (اختياري)
              <input maxLength={250} value={adjustment.note} onChange={(event) => setAdjustment({ ...adjustment, note: event.target.value })} className={inputClass} />
            </label>
            {error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : null}
            <button type="submit" className="mt-5 w-full rounded-xl bg-[#6B8136] px-4 py-3 font-semibold text-white transition hover:bg-[#5d702f]">تسجيل الحركة</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function InventoryCard({ item, onAdjust, onUpdate }: {
  item: InventoryItem;
  onAdjust: () => void;
  onUpdate: (itemId: string, patch: Partial<InventoryItem>) => void;
}) {
  const stockTracked = item.trackStock || item.quantity > 0 || item.lowStockThreshold > 0;
  const low = stockTracked && item.quantity <= item.lowStockThreshold;
  return (
    <article className="rounded-2xl border border-[#E5E3B2] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-bold text-[#403d33]">{item.name}</h4>
          <p className="mt-1 text-sm text-[#705331]">{item.quantity} {item.unit}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${low ? 'bg-amber-50 text-amber-800' : stockTracked ? 'bg-[#f4f6ef] text-[#66764e]' : 'bg-[#f4f3ef] text-[#705331]'}`}>
          {low ? 'مخزون قليل' : stockTracked ? 'متابَع تلقائيًا' : 'الرصيد غير مُسجل'}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_1fr] gap-2">
        <label className="text-xs text-[#705331]">
          الوحدة
          <input aria-label={`وحدة ${item.name}`} maxLength={30} value={item.unit} onChange={(event) => onUpdate(item.id, { unit: event.target.value })} className="mt-1 w-full rounded-lg border-[#E5E3B2] px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-[#705331]">
          حد التنبيه
          <input aria-label={`حد تنبيه ${item.name}`} min="0" step="any" type="number" value={item.lowStockThreshold} onChange={(event) => onUpdate(item.id, { lowStockThreshold: Number(event.target.value) || 0 })} className="mt-1 w-full rounded-lg border-[#E5E3B2] px-2 py-1.5 text-sm" />
        </label>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#E5E3B2] pt-3">
        <span className="text-xs font-semibold text-[#705331]">{stockTracked ? 'الخصم التلقائي مفعّل' : 'أضف الرصيد لتفعيل الخصم'}</span>
        <button type="button" onClick={onAdjust} className="shrink-0 rounded-lg bg-[#f4f6ef] px-3 py-2 text-xs font-semibold text-[#6B8136] hover:bg-[#e9efdf]">تعديل الرصيد</button>
      </div>
    </article>
  );
}

function RecipeIngredientForm({ ingredients, onAdd }: {
  ingredients: InventoryItem[];
  onAdd: (itemId: string, quantity: number) => void;
}) {
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const selectedItemId = ingredients.some((item) => item.id === itemId) ? itemId : (ingredients[0]?.id ?? '');
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
      <select aria-label="الخامة" value={selectedItemId} onChange={(event) => setItemId(event.target.value)} className={inputClass}>
        {ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.unit})</option>)}
      </select>
      <input aria-label="كمية الخامة في الوصفة" min="0.001" step="any" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="الكمية" className={inputClass} />
      <button type="button" disabled={!selectedItemId || !Number(quantity)} onClick={() => {
        onAdd(selectedItemId, Number(quantity));
        setQuantity('');
      }} className="rounded-xl border border-[#c9d19e] px-3 py-2 text-sm font-semibold text-[#6B8136] disabled:opacity-40">إضافة للوصفة</button>
    </div>
  );
}
