'use client';

import { useEffect, useMemo, useState } from 'react';
import type { InventoryItem, InventoryMovement, Product, ProductRecipe } from '@/lib/types';
import { getProductPrice } from '@/lib/pricing';
import { calculateRecipeCost } from '@/lib/recipe-cost';

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
  const [ingredientCategory, setIngredientCategory] = useState('');
  const [search, setSearch] = useState('');
  const [showAllStock, setShowAllStock] = useState(false);
  const [builderName, setBuilderName] = useState('');
  const [builderCategory, setBuilderCategory] = useState('');
  const [builderPrice, setBuilderPrice] = useState('');
  const [builderProd, setBuilderProd] = useState('');
  const [builderLines, setBuilderLines] = useState<{ itemId: string; quantity: string }[]>([]);
  const [building, setBuilding] = useState(false);
  const [catalogCategories, setCatalogCategories] = useState<{ id: string; ar: string }[]>([]);
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

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/dashboard/catalog');
        if (!response.ok) return;
        const data = await response.json() as { catalog?: { categories?: { id: string; ar: string }[] } };
        const categories = data.catalog?.categories ?? [];
        setCatalogCategories(categories);
        setBuilderCategory((current) => current || (categories[0]?.id ?? ''));
      } catch { /* categories stay empty; builder select shows a placeholder */ }
    })();
  }, []);

  // Deep link from the recipe-stock monitor: open this product's recipe editor.
  useEffect(() => {
    if (!products.length) return;
    const productId = window.sessionStorage.getItem('matcha-edit-recipe');
    if (!productId) return;
    window.sessionStorage.removeItem('matcha-edit-recipe');
    const card = document.querySelector(`[data-recipe-product="${CSS.escape(productId)}"]`);
    if (card instanceof HTMLDetailsElement) {
      card.open = true;
      card.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [products]);

  const productItems = useMemo(() => items.filter((item) => item.type === 'product'
    && (!search.trim() || item.name.toLowerCase().includes(search.trim().toLowerCase()))), [items, search]);
  const allIngredients = useMemo(() => items.filter((item) => item.type === 'ingredient'), [items]);
  const ingredients = useMemo(() => allIngredients
    .filter((item) => !search.trim() || item.name.toLowerCase().includes(search.trim().toLowerCase())), [allIngredients, search]);
  const recipeProducts = useMemo(() => products.filter((product) => !search.trim()
    || product.ar.toLowerCase().includes(search.trim().toLowerCase())), [products, search]);
  const isStockTracked = (item: InventoryItem) => item.trackStock || item.quantity > 0 || item.lowStockThreshold > 0;
  const outOfStockCount = items.filter((item) => isStockTracked(item) && item.quantity === 0).length;
  const lowStockCount = items.filter((item) => isStockTracked(item)
    && item.quantity > 0
    && item.quantity <= item.lowStockThreshold).length;
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
      category: ingredientCategory.trim() || undefined,
      quantity: 0,
      lowStockThreshold: 0,
      trackStock: true,
    };
    if (await saveSettings([...items, item])) {
      setIngredientName('');
      setIngredientUnit('');
      setIngredientCategory('');
    }
  };

  const deleteIngredient = async (item: InventoryItem) => {
    if (!window.confirm(`حذف الخامة "${item.name}" نهائيًا؟ هتتشال من أي وصفة بتستخدمها.`)) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/dashboard/inventory', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error || 'تعذر حذف الخامة');
      }
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setRecipes((current) => current
        .map((recipe) => ({ ...recipe, ingredients: recipe.ingredients.filter((ingredient) => ingredient.itemId !== item.id) }))
        .filter((recipe) => recipe.ingredients.length > 0));
      setMessage(`اتحذفت الخامة "${item.name}".`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'تعذر حذف الخامة');
    } finally {
      setSaving(false);
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

  const builderCost = useMemo(() => {
    const lines = builderLines
      .filter((line) => line.itemId && Number(line.quantity) > 0)
      .map((line) => {
        const ingredient = allIngredients.find((item) => item.id === line.itemId);
        const lineCost = ingredient?.unitCost === undefined ? undefined : ingredient.unitCost * Number(line.quantity);
        return { line, ingredient, lineCost };
      });
    const total = lines.reduce((sum, entry) => sum + (entry.lineCost ?? 0), 0);
    const complete = lines.length > 0 && lines.every((entry) => entry.lineCost !== undefined);
    const price = Number(builderPrice);
    const prod = Number(builderProd);
    return { lines, total, complete, price: Number.isFinite(price) && price > 0 ? price : undefined, prod: Number.isFinite(prod) && prod > 0 ? prod : undefined };
  }, [builderLines, builderPrice, builderProd, allIngredients]);

  const createProductFromIngredients = async () => {
    if (building) return;
    const name = builderName.trim();
    if (!name) { setError('اكتب اسم الصنف'); return; }
    if (!builderCategory) { setError('اختار التصنيف'); return; }
    const validLines = builderLines.filter((line) => line.itemId && Number(line.quantity) > 0);
    if (!validLines.length) { setError('ضيف خامة واحدة على الأقل بكمية أكبر من صفر'); return; }
    const price = Number(builderPrice);
    if (!Number.isFinite(price) || price < 0) { setError('اكتب سعر بيع صحيح'); return; }
    setBuilding(true);
    setError('');
    setMessage('');
    try {
      const catalogResponse = await fetch('/api/dashboard/catalog');
      const catalogData = await catalogResponse.json() as { catalog?: { categories: { id: string; ar: string }[]; products: Product[]; groups: Record<string, unknown> }; error?: string };
      if (!catalogResponse.ok || !catalogData.catalog) throw new Error(catalogData.error || 'تعذر تحميل المنيو');
      const catalog = catalogData.catalog;
      const productId = `product-${crypto.randomUUID()}`;
      const nextCatalog = {
        ...catalog,
        products: [...catalog.products, {
          id: productId,
          categoryId: builderCategory,
          ar: name,
          en: '',
          descriptionAr: '',
          descriptionEn: '',
          price,
          available: true,
          groups: [],
          displayOrder: Math.max(0, ...catalog.products.map((product) => product.displayOrder ?? 0)) + 1,
        }],
      };
      const saveCatalog = await fetch('/api/dashboard/catalog', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextCatalog),
      });
      if (!saveCatalog.ok) {
        const data = await saveCatalog.json() as { error?: string };
        throw new Error(data.error || 'تعذر حفظ الصنف في المنيو');
      }
      const prod = Number(builderProd);
      const nextRecipes = [...recipes, {
        productId,
        ingredients: validLines.map((line) => ({ itemId: line.itemId, quantity: Number(line.quantity) })),
        ...(Number.isFinite(prod) && prod > 0 ? { productionQuantity: prod } : {}),
      }];
      const saveInventory = await fetch('/api/dashboard/inventory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, recipes: nextRecipes }),
      });
      if (!saveInventory.ok) {
        const data = await saveInventory.json() as { error?: string };
        throw new Error(data.error || 'تعذر حفظ الوصفة');
      }
      setBuilderName('');
      setBuilderCategory('');
      setBuilderPrice('');
      setBuilderProd('');
      setBuilderLines([]);
      setMessage(`اتإنشأ الصنف "${name}" بوصفته.`);
      await loadInventory();
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : 'تعذر إنشاء الصنف');
    } finally {
      setBuilding(false);
    }
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
          <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${outOfStockCount ? 'bg-rose-50 text-rose-800' : lowStockCount ? 'bg-amber-50 text-amber-800' : 'bg-[#f4f6ef] text-[#66764e]'}`}>
            {outOfStockCount ? `${outOfStockCount} صنف نفد من المخزون` : lowStockCount ? `${lowStockCount} صنف منخفض` : uninitializedCount ? `${uninitializedCount} رصيد غير مُسجل` : trackedCount ? 'الأرصدة المتابعة تمام' : 'لا توجد أصناف بالمخزون'}
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
            <form onSubmit={(event) => void addIngredient(event)} className="mb-6 grid gap-3 rounded-2xl border border-dashed border-[#dfe2d5] bg-[#fafbf7] p-4 sm:grid-cols-2 xl:grid-cols-4 xl:items-end">
              <label className="grid gap-1.5 text-sm font-semibold text-[#232122]">
                خامة جديدة
                <input required maxLength={150} value={ingredientName} onChange={(event) => setIngredientName(event.target.value)} placeholder="مثال: لبن كامل الدسم" className={inputClass} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#232122]">
                وحدة القياس
                <input required maxLength={30} value={ingredientUnit} onChange={(event) => setIngredientUnit(event.target.value)} placeholder="مل، جرام، قطعة..." className={inputClass} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#232122]">
                التصنيف (اختياري)
                <input maxLength={60} value={ingredientCategory} onChange={(event) => setIngredientCategory(event.target.value)} placeholder="مثال: ألبان" className={inputClass} />
              </label>
              <button disabled={saving} className="rounded-xl border border-[#c9d19e] bg-white px-4 py-2.5 text-sm font-semibold text-[#6B8136] transition hover:bg-[#f4f6ef] disabled:opacity-50">
                {saving ? 'جارٍ الحفظ…' : 'إضافة خامة'}
              </button>
            </form>

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
                    <InventoryCard key={item.id} item={item} onAdjust={() => setAdjustment({ itemId: item.id, quantity: '', note: '', direction: 1 })} onUpdate={updateItem} onDelete={() => void deleteIngredient(item)} />
                  ))}
                </div>
              )}
            </div>

            <div className="mb-6 rounded-2xl border border-[#dfe2d5] bg-white p-4">
              <h3 className="font-bold text-[#403d33]">بناء الصنف</h3>
              <p className="mt-1 text-xs leading-5 text-[#89877c]">صنف جديد — مش هيتسجل إلا لما تضغط «إنشاء الصنف»</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-semibold text-[#232122] sm:col-span-2">
                  اسم الصنف
                  <input maxLength={150} value={builderName} onChange={(event) => setBuilderName(event.target.value)} placeholder="اسم الصنف" className={inputClass} />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#232122]">
                  التصنيف
                  <select value={builderCategory} onChange={(event) => setBuilderCategory(event.target.value)} className={inputClass}>
                    {catalogCategories.length === 0 ? <option value="">مثال: مشروبات ساخنة</option> : null}
                    {catalogCategories.map((category) => <option key={category.id} value={category.id}>{category.ar}</option>)}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#232122]">
                  سعر البيع (ج)
                  <input type="number" min="0" step="any" inputMode="decimal" value={builderPrice} onChange={(event) => setBuilderPrice(event.target.value)} placeholder="تدخله انت" className={inputClass} />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[#232122] sm:col-span-2">
                  كمية الإنتاج (اختياري)
                  <input type="number" min="0" step="any" inputMode="decimal" value={builderProd} onChange={(event) => setBuilderProd(event.target.value)} placeholder="تحددها انت" className={inputClass} />
                </label>
              </div>
              <h4 className="mt-4 text-sm font-bold text-[#403d33]">الخامات المستخدمة</h4>
              {allIngredients.length === 0 ? (
                <p className="mt-2 text-xs leading-5 text-[#89877c]">مفيش خامات مسجلة. ضيف الخامات الأول من قسم الخامات فوق.</p>
              ) : null}
              <div className="mt-2 space-y-2">
                {builderLines.map((line, index) => {
                  const ingredient = allIngredients.find((item) => item.id === line.itemId);
                  const lineCost = ingredient?.unitCost === undefined || !(Number(line.quantity) > 0) ? undefined : ingredient.unitCost * Number(line.quantity);
                  return (
                    <div key={index} className="flex flex-wrap items-center gap-2 rounded-lg bg-[#f8f8f4] p-2">
                      <select aria-label={`الخامة في السطر ${index + 1}`} value={line.itemId} onChange={(event) => setBuilderLines((current) => current.map((entry, i) => i === index ? { ...entry, itemId: event.target.value } : entry))} className={inputClass}>
                        <option value="">— اختار خامة —</option>
                        {allIngredients.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}
                      </select>
                      <input aria-label={`الكمية في السطر ${index + 1}`} type="number" min="0" step="any" inputMode="decimal" placeholder="الكمية" value={line.quantity} onChange={(event) => setBuilderLines((current) => current.map((entry, i) => i === index ? { ...entry, quantity: event.target.value } : entry))} className={`${inputClass} w-20`} />
                      <span className="flex items-center gap-2 text-xs text-[#705331]">
                        <span>{ingredient?.unit ?? ''}</span>
                        <span dir="ltr">{lineCost === undefined ? '—' : `${lineCost.toFixed(2)} ج`}</span>
                        <button type="button" aria-label={`حذف السطر ${index + 1}`} onClick={() => setBuilderLines((current) => current.filter((_, i) => i !== index))} className="font-bold text-rose-700">×</button>
                      </span>
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={() => setBuilderLines((current) => [...current, { itemId: '', quantity: '' }])} disabled={allIngredients.length === 0} className="mt-3 w-full rounded-xl bg-[#6B8136] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5d702f] disabled:opacity-50">
                + إضافة خامة
              </button>
              <div className="mt-4 space-y-1.5 rounded-xl bg-[#176f68] p-4 text-sm text-white">
                <p className="text-xs font-semibold text-white/70">تفاصيل التكلفة</p>
                {builderCost.lines.length === 0 ? <p className="flex justify-between"><span>لسه مفيش خامات</span><strong>—</strong></p> : null}
                <p className="flex justify-between"><span>إجمالي تكلفة الوصفة</span><strong dir="ltr">{builderCost.lines.length === 0 || !builderCost.complete ? '—' : `${builderCost.total.toFixed(2)} ج`}</strong></p>
                {builderCost.complete && builderCost.prod ? <p className="flex justify-between"><span>تكلفة الوحدة المنتجة</span><strong dir="ltr">{`${(builderCost.total / builderCost.prod).toFixed(2)} ج`}</strong></p> : null}
                <p className="flex justify-between"><span>نسبة تكلفة الأكل من سعر البيع</span><strong dir="ltr">{builderCost.complete && builderCost.price ? `${((builderCost.total / builderCost.price) * 100).toFixed(1)}%` : '—'}</strong></p>
                <p className="flex justify-between"><span>الربح قبل التشغيل</span><strong dir="ltr">{builderCost.complete && builderCost.price ? `${(builderCost.price - builderCost.total).toFixed(2)} ج` : '—'}</strong></p>
                {!builderCost.complete && builderCost.lines.length > 0 ? <p className="text-xs text-amber-200">⚠ في خامة من غير سعر — الأرقام ناقصة</p> : null}
              </div>
              <button type="button" disabled={building} onClick={() => void createProductFromIngredients()} className="mt-3 w-full rounded-xl bg-[#176f68] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#115b56] disabled:opacity-50">
                {building ? 'جارٍ الإنشاء…' : '✓ إنشاء الصنف'}
              </button>
            </div>

            <div className="space-y-2">
              <h3 className="mb-3 font-bold text-[#403d33]">وصفة كل منتج</h3>
              {recipeProducts.map((product) => {
                const recipe = recipes.find((entry) => entry.productId === product.id);
                const recipeCost = calculateRecipeCost(recipe, allIngredients);
                const hasRecipe = Boolean(recipe?.ingredients.length);
                const sellingPrice = getProductPrice(product);
                const grossProfit = recipeCost.totalCost === undefined ? undefined : sellingPrice - recipeCost.totalCost;
                const profitMargin = grossProfit === undefined || sellingPrice <= 0
                  ? undefined
                  : (grossProfit / sellingPrice) * 100;
                return (
                  <details key={product.id} data-recipe-product={product.id} className="group rounded-xl border border-[#E5E3B2] bg-white">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold text-[#403d33]">
                      <span>{product.ar}</span>
                      <span className="text-xs font-medium text-[#705331]">{recipe?.ingredients.length ? `${recipe.ingredients.length} خامة` : 'من غير وصفة'}</span>
                    </summary>
                    <div className="space-y-3 border-t border-[#E5E3B2] p-4">
                      {(recipe?.ingredients ?? []).map((entry) => {
                        const ingredient = allIngredients.find((item) => item.id === entry.itemId);
                        const ingredientCost = recipeCost.ingredients.find((item) => item.itemId === entry.itemId);
                        return (
                          <div key={entry.itemId} className="flex items-center justify-between gap-3 rounded-lg bg-[#f8f8f4] px-3 py-2 text-sm">
                            <span className="min-w-0 flex-1">
                              <span className="block">{ingredient?.name ?? 'خامة محذوفة'}</span>
                              <span className="mt-0.5 block text-xs font-semibold text-[#80918d]">
                                {ingredient?.unitCost === undefined
                                  ? 'سعر الوحدة غير مسجل'
                                  : `سعر ال${ingredient.unit}: ${ingredient.unitCost.toFixed(2)} ج.م`}
                              </span>
                            </span>
                            <span className="flex items-center gap-2 text-[#705331]">
                              <RecipeQuantityInput
                                value={entry.quantity}
                                onChange={(quantity) => updateRecipe(product.id, {
                                  ...recipe!,
                                  ingredients: recipe!.ingredients.map((row) => row.itemId === entry.itemId ? { ...row, quantity } : row),
                                })}
                              />
                              <span>{ingredient?.unit}</span>
                              <span className="min-w-16 text-start" dir="ltr" title="تكلفة الكمية في الوصفة">
                                {ingredientCost?.lineCost === undefined ? '—' : `${ingredientCost.lineCost.toFixed(2)} ج.م`}
                              </span>
                              <button type="button" aria-label={`إزالة ${ingredient?.name ?? 'الخامة'} من وصفة ${product.ar}`} onClick={() => {
                                const nextIngredients = recipe!.ingredients.filter((row) => row.itemId !== entry.itemId);
                                updateRecipe(product.id, nextIngredients.length ? { ...recipe!, ingredients: nextIngredients } : null);
                              }} className="font-bold text-rose-700">×</button>
                            </span>
                          </div>
                        );
                      })}
                      {hasRecipe ? (
                        <label className="flex items-center justify-between gap-3 rounded-lg bg-[#f8f8f4] px-3 py-2 text-sm font-semibold text-[#403d33]">
                          كمية الإنتاج (اختياري)
                          <input
                            aria-label={`كمية الإنتاج لوصفة ${product.ar}`}
                            type="number" min="0" step="any" inputMode="decimal" placeholder="تحددها انت"
                            value={recipe?.productionQuantity ?? ''}
                            onChange={(event) => {
                              const prod = Number(event.target.value);
                              updateRecipe(product.id, {
                                ...recipe!,
                                productionQuantity: Number.isFinite(prod) && prod > 0 ? prod : undefined,
                              });
                            }}
                            className="w-28 rounded-lg border-[#E5E3B2] px-2 py-1.5 text-sm"
                          />
                        </label>
                      ) : null}
                      <div className="grid gap-2 rounded-lg bg-[#f4f6ef] p-3 text-sm sm:grid-cols-2">
                        <p className="flex justify-between gap-2"><span>سعر البيع</span><strong>{sellingPrice.toFixed(2)} ج.م</strong></p>
                        <p className="flex justify-between gap-2"><span>تكلفة الوصفة</span><strong>{recipeCost.totalCost === undefined ? (hasRecipe ? 'أدخل تكلفة كل خامة' : 'أضف مكونات الوصفة') : `${recipeCost.totalCost.toFixed(2)} ج.م`}</strong></p>
                        {recipe?.productionQuantity && recipeCost.totalCost !== undefined ? <p className="flex justify-between gap-2"><span>تكلفة الوحدة المنتجة</span><strong>{`${(recipeCost.totalCost / recipe.productionQuantity).toFixed(2)} ج.م`}</strong></p> : null}
                        <p className="flex justify-between gap-2"><span>الربح الإجمالي</span><strong>{grossProfit === undefined ? '—' : `${grossProfit.toFixed(2)} ج.م`}</strong></p>
                        <p className="flex justify-between gap-2"><span>هامش الربح</span><strong>{profitMargin === undefined ? '—' : `${profitMargin.toFixed(1)}%`}</strong></p>
                      </div>
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
                    <table className="w-full min-w-[820px] text-right text-sm">
                    <thead className="bg-[#f6f7f2] text-xs text-[#6c6d5c]">
                        <tr><th className="px-3 py-2.5">التاريخ</th><th className="px-3 py-2.5">الصنف</th><th className="px-3 py-2.5">الحركة</th><th className="px-3 py-2.5">الكمية</th><th className="px-3 py-2.5">الرصيد قبل / بعد</th><th className="px-3 py-2.5">المسؤول</th><th className="px-3 py-2.5">ملاحظة / مرجع</th></tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E3B2]">
                      {movements.slice(0, 20).map((movement) => (
                        <tr key={movement.id}>
                          <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[#705331]">{new Date(movement.createdAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</td>
                          <td className="px-3 py-2.5 font-medium">{movement.itemName}</td>
                          <td className="px-3 py-2.5 text-xs">{movement.reason === 'sale' ? 'طلب' : movement.reason === 'cancellation' ? 'إلغاء طلب' : movement.reason === 'purchase' ? 'فاتورة شراء' : 'تعديل يدوي'}</td>
                          <td dir="ltr" className={`whitespace-nowrap px-3 py-2.5 font-semibold ${movement.quantity < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{movement.quantity > 0 ? '+' : ''}{movement.quantity}</td>
                          <td dir="ltr" className="whitespace-nowrap px-3 py-2.5 text-xs text-[#705331]">{movement.previousBalance !== undefined && movement.newBalance !== undefined ? `${movement.previousBalance} / ${movement.newBalance}` : '—'}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-xs">{movement.performedBy ?? '—'}</td>
                          <td className="px-3 py-2.5 text-xs text-[#705331]">{movement.note ?? movement.referenceId ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="mb-7">
              <h3 className="mb-3 font-bold text-[#403d33]">أرصدة الأصناف الجاهزة للبيع</h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {(showAllStock ? productItems : productItems.slice(0, 24)).map((item) => (
                  <InventoryCard key={item.id} item={item} onAdjust={() => setAdjustment({ itemId: item.id, quantity: '', note: '', direction: 1 })} onUpdate={updateItem} />
                ))}
              </div>
              {!showAllStock && productItems.length > 24 ? (
                <button type="button" onClick={() => setShowAllStock(true)} className="mt-3 w-full rounded-xl border border-[#dfe2d5] bg-white px-4 py-2.5 text-sm font-semibold text-[#6B8136] transition hover:bg-[#f4f6ef]">
                  عرض كل الأصناف ({productItems.length})
                </button>
              ) : null}
              <p className="mt-2 text-xs leading-5 text-[#89877c]">مافيش تفعيل يدوي مطلوب: أول ما تضيف رصيد للصنف، يدخل المتابعة ويتخصم تلقائيًا مع الطلب. الأصناف اللي رصيدها صفر وغير مُسجل تفضل متاحة للبيع لحد تسجيل رصيدها.</p>
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

function InventoryCard({ item, onAdjust, onUpdate, onDelete }: {
  item: InventoryItem;
  onAdjust: () => void;
  onUpdate: (itemId: string, patch: Partial<InventoryItem>) => void;
  onDelete?: () => void;
}) {
  const stockTracked = item.trackStock || item.quantity > 0 || item.lowStockThreshold > 0;
  const out = stockTracked && item.quantity === 0;
  const low = stockTracked && item.quantity > 0 && item.quantity <= item.lowStockThreshold;
  return (
    <article className="rounded-2xl border border-[#E5E3B2] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {item.type === 'ingredient' ? (
            <input aria-label={`اسم ${item.name}`} maxLength={150} value={item.name} onChange={(event) => onUpdate(item.id, { name: event.target.value })} className="w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 font-bold text-[#403d33] transition hover:border-[#E5E3B2] focus:border-[#6B8136] focus:bg-white" />
          ) : (
            <h4 className="font-bold text-[#403d33]">{item.name}</h4>
          )}
          <p className="mt-1 text-sm text-[#705331]">{item.quantity} {item.unit}</p>
        </div>
        {onDelete ? (
          <button type="button" onClick={onDelete} aria-label={`حذف ${item.name}`} title="حذف الخامة نهائيًا" className="shrink-0 rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-bold text-rose-700 transition hover:bg-rose-50">
            حذف
          </button>
        ) : null}
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${out ? 'bg-rose-50 text-rose-800' : low ? 'bg-amber-50 text-amber-800' : stockTracked ? 'bg-[#f4f6ef] text-[#66764e]' : 'bg-[#f4f3ef] text-[#705331]'}`}>
          {out ? 'نفد المخزون' : low ? 'مخزون منخفض' : stockTracked ? 'متابَع تلقائيًا' : 'الرصيد غير مُسجل'}
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
        <label className="text-xs text-[#705331]">
          التصنيف
          <input aria-label={`تصنيف ${item.name}`} maxLength={60} value={item.category ?? ''} onChange={(event) => onUpdate(item.id, { category: event.target.value || undefined })} className="mt-1 w-full rounded-lg border-[#E5E3B2] px-2 py-1.5 text-sm" />
        </label>
      </div>
      {item.type === 'ingredient' ? (
        <div className="mt-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-[#705331]">
              السعر (ج)
              <input
                aria-label={`سعر ${item.name}`}
                min="0"
                step="any"
                type="number"
                value={item.unitCost === undefined ? '' : Number((item.unitCost * (item.costQuantity ?? 1)).toFixed(4))}
                onChange={(event) => {
                  const per = item.costQuantity ?? 1;
                  onUpdate(item.id, {
                    costQuantity: per,
                    unitCost: event.target.value === '' ? undefined : Number(event.target.value) / per,
                  });
                }}
                className="mt-1 w-full rounded-lg border-[#E5E3B2] px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-[#705331]">
              لكل ({item.unit})
              <input
                aria-label={`لكل كمية ${item.name}`}
                min="0.000001"
                step="any"
                type="number"
                value={item.costQuantity ?? 1}
                onChange={(event) => {
                  const per = Number(event.target.value) > 0 ? Number(event.target.value) : 1;
                  const price = item.unitCost === undefined ? undefined : item.unitCost * (item.costQuantity ?? 1);
                  onUpdate(item.id, {
                    costQuantity: per,
                    unitCost: price === undefined ? undefined : price / per,
                  });
                }}
                className="mt-1 w-full rounded-lg border-[#E5E3B2] px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-[#89877c]">سعر الوحدة: {item.unitCost === undefined ? 'غير مسجل' : `${Number(item.unitCost.toFixed(6))} ج`}</p>
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#E5E3B2] pt-3">
        <span className="text-xs font-semibold text-[#705331]">{stockTracked ? 'الخصم التلقائي مفعّل' : 'أضف الرصيد لتفعيل الخصم'}</span>
        <button type="button" onClick={onAdjust} className="shrink-0 rounded-lg bg-[#f4f6ef] px-3 py-2 text-xs font-semibold text-[#6B8136] hover:bg-[#e9efdf]">تعديل الرصيد</button>
      </div>
    </article>
  );
}

function RecipeQuantityInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <input
      aria-label="كمية الخامة في الوصفة"
      min="0.001"
      step="any"
      type="number"
      defaultValue={value}
      onBlur={(event) => {
        const input = event.currentTarget;
        const quantity = Number(input.value);
        if (Number.isFinite(quantity) && quantity > 0) {
          input.value = String(quantity);
          onChange(quantity);
        } else {
          input.value = String(value);
        }
      }}
      className="w-20 rounded-lg border-[#E5E3B2] px-2 py-1 text-sm"
    />
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
