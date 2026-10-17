'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CatalogGroup, Category, Product } from '@/lib/types';

type CatalogData = {
  categories: Category[];
  products: Product[];
  groups: Record<string, CatalogGroup>;
};

type Section = 'products' | 'categories' | 'options';
type ProductAvailability = 'available' | 'hidden' | 'all';

const emptyProduct = (): Product => ({
  id: '',
  categoryId: '',
  ar: '',
  en: '',
  descriptionAr: '',
  descriptionEn: '',
  price: 0,
  available: true,
  bestSeller: false,
  groups: [],
  displayOrder: 1,
});

const emptyCategory = (): Category => ({
  id: '',
  ar: '',
  en: '',
  station: 'bar',
  displayOrder: 1,
  active: true,
});

const emptyGroup = (): CatalogGroup => ({
  id: '',
  ar: '',
  en: '',
  required: false,
  multi: false,
  options: [{ ar: '', en: '', price: 0 }],
});

const fieldClass = 'mt-1.5 w-full rounded-xl border-[#e5e5dc] bg-white px-3 py-2.5 text-sm';
const labelClass = 'block text-sm font-semibold text-[#514d43]';

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export default function MenuManagement() {
  const [catalog, setCatalog] = useState<CatalogData>({ categories: [], products: [], groups: {} });
  const [section, setSection] = useState<Section>('products');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [productAvailability, setProductAvailability] = useState<ProductAvailability>('available');
  const [productEditor, setProductEditor] = useState<Product | null>(null);
  const [categoryEditor, setCategoryEditor] = useState<Category | null>(null);
  const [groupEditor, setGroupEditor] = useState<CatalogGroup | null>(null);

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      void fetch('/api/dashboard/catalog')
        .then(async (response) => {
          const data = await response.json() as { catalog?: CatalogData; error?: string };
          if (!response.ok || !data.catalog) throw new Error(data.error || 'تعذر تحميل المنيو');
          if (active) setCatalog(data.catalog);
        })
        .catch((loadError: unknown) => {
          if (active) setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل المنيو');
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

  const persist = async (nextCatalog: CatalogData) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/dashboard/catalog', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextCatalog),
      });
      const data = await response.json() as { catalog?: CatalogData; error?: string };
      if (!response.ok || !data.catalog) {
        setError(data.error || 'تعذر حفظ تعديلات المنيو');
        return false;
      }
      setCatalog(data.catalog);
      setMessage('تم حفظ التعديلات بنجاح.');
      return true;
    } catch {
      setError('تعذر الاتصال بالخادم أثناء حفظ المنيو');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = useMemo(() => catalog.products
    .map((product, index) => ({ product, index }))
    .filter(({ product }) => {
      const matchesAvailability = productAvailability === 'all'
        || product.available === (productAvailability === 'available');
      const matchesSearch = !search.trim() || `${product.ar} ${product.en}`.toLowerCase().includes(search.trim().toLowerCase());
      return matchesAvailability && matchesSearch;
    })
    .sort((a, b) => (a.product.displayOrder ?? a.index) - (b.product.displayOrder ?? b.index))
    .map(({ product }) => product), [catalog.products, productAvailability, search]);

  const saveProduct = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!productEditor) return;
    const editing = catalog.products.some((product) => product.id === productEditor.id);
    const product = {
      ...productEditor,
      id: productEditor.id || newId('product'),
      displayOrder: productEditor.displayOrder ?? catalog.products.length + 1,
    };
    const nextCatalog = {
      ...catalog,
      products: editing
        ? catalog.products.map((item) => item.id === product.id ? product : item)
        : [...catalog.products, product],
    };
    if (await persist(nextCatalog)) setProductEditor(null);
  };

  const saveCategory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!categoryEditor) return;
    const editing = catalog.categories.some((category) => category.id === categoryEditor.id);
    const category = {
      ...categoryEditor,
      id: categoryEditor.id || newId('category'),
      displayOrder: categoryEditor.displayOrder || catalog.categories.length + 1,
    };
    const nextCatalog = {
      ...catalog,
      categories: editing
        ? catalog.categories.map((item) => item.id === category.id ? category : item)
        : [...catalog.categories, category],
    };
    if (await persist(nextCatalog)) setCategoryEditor(null);
  };

  const saveGroup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!groupEditor) return;
    const id = groupEditor.id || newId('option');
    const group = { ...groupEditor, id };
    const nextCatalog = { ...catalog, groups: { ...catalog.groups, [id]: group } };
    if (await persist(nextCatalog)) setGroupEditor(null);
  };

  const archiveProduct = async (product: Product) => {
    if (product.available && !window.confirm(`إخفاء «${product.ar}» من منيو العملاء؟ ستظل بياناته محفوظة في الطلبات السابقة ويمكن إظهاره مرة أخرى.`)) return;
    await persist({
      ...catalog,
      products: catalog.products.map((item) => item.id === product.id ? { ...item, available: !item.available } : item),
    });
  };

  const archiveCategory = async (category: Category) => {
    if (category.active && !window.confirm(`إخفاء تصنيف «${category.ar}»؟ ستظل الأصناف والطلبات السابقة محفوظة.`)) return;
    await persist({
      ...catalog,
      categories: catalog.categories.map((item) => item.id === category.id ? { ...item, active: !item.active } : item),
    });
  };

  const deleteGroup = async (group: CatalogGroup) => {
    const usingProducts = catalog.products.filter((product) => product.groups.includes(group.id));
    if (!window.confirm(usingProducts.length
      ? `حذف مجموعة «${group.ar}» وإزالتها من ${usingProducts.length} صنف؟ تفاصيل الطلبات السابقة تظل محفوظة.`
      : `حذف مجموعة «${group.ar}»؟`)) return;
    const groups = { ...catalog.groups };
    delete groups[group.id];
    await persist({
      ...catalog,
      groups,
      products: catalog.products.map((product) => ({ ...product, groups: product.groups.filter((id) => id !== group.id) })),
    });
  };

  return (
    <section aria-labelledby="menu-management-heading" className="rounded-[1.5rem] border border-[#e8e6dc] bg-white/85 p-4 shadow-[0_8px_24px_rgba(44,43,35,.04)] sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="menu-management-heading" className="text-xl font-bold text-[#302b23]">إدارة المنيو</h2>
          <p className="mt-1 text-sm text-[#77766c]">{catalog.products.filter((product) => product.available).length} صنف متاح · {catalog.categories.filter((category) => category.active).length} تصنيف</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError('');
            if (section === 'products') setProductEditor({
              ...emptyProduct(),
              categoryId: catalog.categories[0]?.id ?? '',
              displayOrder: Math.max(0, ...catalog.products.map((product) => product.displayOrder ?? 0)) + 1,
            });
            if (section === 'categories') setCategoryEditor({ ...emptyCategory(), displayOrder: catalog.categories.length + 1 });
            if (section === 'options') setGroupEditor(emptyGroup());
          }}
          disabled={loading || saving}
          className="rounded-xl bg-[#435d32] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#344b27] disabled:opacity-50"
        >
          + إضافة {section === 'products' ? 'صنف' : section === 'categories' ? 'تصنيف' : 'مجموعة خيارات'}
        </button>
      </div>

      <nav aria-label="أقسام إدارة المنيو" className="mb-5 flex gap-2 overflow-x-auto border-b border-[#eeede7] pb-3">
        {([
          ['products', `الأصناف (${catalog.products.filter((product) => product.available).length})`],
          ['categories', `التصنيفات (${catalog.categories.filter((category) => category.active).length})`],
          ['options', `الخيارات والإضافات (${Object.keys(catalog.groups).length})`],
        ] as Array<[Section, string]>).map(([id, title]) => (
          <button key={id} type="button" aria-pressed={section === id} onClick={() => setSection(id)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${section === id ? 'bg-[#435d32] text-white' : 'bg-[#f5f4ef] text-[#676458] hover:bg-[#ecebe3]'}`}>
            {title}
          </button>
        ))}
      </nav>

      {error ? <p role="alert" className="mb-4 rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
      {message ? <p role="status" className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-[#f2f2eb] motion-reduce:animate-none" />)}</div>
      ) : null}

      {!loading && section === 'products' ? (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن صنف..." aria-label="ابحث عن صنف" className="min-w-0 w-full sm:max-w-sm" />
            <div role="group" aria-label="تصفية الأصناف حسب الحالة" className="grid grid-cols-3 gap-1 rounded-xl bg-[#f5f4ef] p-1">
              {([
                ['available', `ظاهرة (${catalog.products.filter((product) => product.available).length})`],
                ['hidden', `مخفية (${catalog.products.filter((product) => !product.available).length})`],
                ['all', 'الكل'],
              ] as Array<[ProductAvailability, string]>).map(([availability, label]) => (
                <button
                  key={availability}
                  type="button"
                  aria-pressed={productAvailability === availability}
                  onClick={() => setProductAvailability(availability)}
                  className={`min-h-10 rounded-lg px-2 text-xs font-semibold transition sm:px-3 sm:text-sm ${productAvailability === availability ? 'bg-white text-[#435d32] shadow-sm' : 'text-[#77766c] hover:text-[#435d32]'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {filteredProducts.length ? (
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-3">
              {filteredProducts.map((product) => {
                const category = catalog.categories.find((item) => item.id === product.categoryId);
                return (
                  <article key={product.id} className={`flex min-w-0 flex-col rounded-2xl border p-2.5 transition sm:p-4 ${product.available ? 'border-[#e9e7df] bg-white' : 'border-dashed border-[#dedbd0] bg-[#f8f7f3] opacity-75'}`}>
                    <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:justify-between sm:gap-3">
                      <div className="min-w-0">
                        <h3 className="line-clamp-1 text-sm font-bold text-[#343128] sm:text-base">{product.ar}</h3>
                        <p className="mt-1 line-clamp-1 text-[10px] text-[#858378] sm:text-xs">{[product.en, category?.ar].filter(Boolean).join(' · ')}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold sm:px-2.5 sm:text-[11px] ${product.available ? 'bg-emerald-50 text-emerald-800' : 'bg-stone-100 text-stone-600'}`}>{product.available ? 'ظاهر' : 'مخفي'}</span>
                    </div>
                    <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1 sm:mt-3 sm:gap-2">
                      {product.offerPrice !== undefined ? <><span className="text-sm font-bold text-[#435d32] sm:text-base">{product.offerPrice} ج.م</span><span className="text-[10px] text-[#99978d] line-through sm:text-xs">{product.price} ج.م</span></> : <span className="text-sm font-bold text-[#435d32] sm:text-base">{product.price} ج.م</span>}
                      {product.bestSeller ? <span className="rounded-full bg-[#fbf4e4] px-1.5 py-0.5 text-[9px] text-[#93733b] sm:px-2 sm:text-[10px]">الأكثر طلبًا</span> : null}
                    </div>
                    <div className="mt-2 flex min-h-5 flex-wrap gap-1 sm:mt-3 sm:gap-1.5">
                      {product.groups.map((groupId) => catalog.groups[groupId] ? <span key={groupId} className="max-w-full truncate rounded-md bg-[#f5f4ef] px-1.5 py-1 text-[9px] text-[#6c6d5c] sm:px-2 sm:text-[10px]">{catalog.groups[groupId].ar}</span> : null)}
                      {!product.groups.length ? <span className="text-xs text-[#99978d]">بدون خيارات</span> : null}
                    </div>
                    <div className="mt-3 flex gap-1.5 border-t border-[#f0efe9] pt-2 sm:mt-4 sm:gap-2 sm:pt-3">
                      <button type="button" onClick={() => setProductEditor({ ...product, groups: [...product.groups] })} className="min-h-10 min-w-0 flex-1 rounded-lg bg-[#f0f3e9] px-1.5 py-2 text-xs font-semibold text-[#435d32] hover:bg-[#e4ead9] sm:px-3 sm:text-sm">تعديل</button>
                      <button type="button" disabled={saving} onClick={() => void archiveProduct(product)} className="min-h-10 min-w-0 flex-1 rounded-lg px-1.5 py-2 text-xs font-semibold text-[#77766c] hover:bg-[#f1f0eb] disabled:opacity-50 sm:px-3 sm:text-sm">{product.available ? 'إخفاء' : 'إظهار'}</button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : <p className="rounded-2xl border border-dashed border-[#e1e2d8] p-8 text-center text-sm text-[#77766c]">لا توجد أصناف مطابقة.</p>}
        </>
      ) : null}

      {!loading && section === 'categories' ? (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-3">
          {[...catalog.categories].sort((a, b) => a.displayOrder - b.displayOrder).map((category) => (
            <article key={category.id} className="flex min-w-0 flex-col justify-between gap-3 rounded-2xl border border-[#e9e7df] bg-white p-2.5 sm:flex-row sm:items-center sm:p-4">
              <div className="min-w-0">
                <h3 className="line-clamp-1 text-sm font-bold text-[#343128] sm:text-base">{category.ar}</h3>
                <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[#858378] sm:text-xs">{[category.en, category.station === 'bar' ? 'بار' : 'مطبخ', `${catalog.products.filter((product) => product.categoryId === category.id && product.available).length} صنف`].filter(Boolean).join(' · ')}</p>
                {!category.active ? <span className="mt-2 inline-flex rounded-full bg-stone-100 px-2.5 py-1 text-[10px] text-stone-600">مخفي</span> : null}
              </div>
              <div className="flex shrink-0 gap-1 sm:flex-col">
                <button type="button" onClick={() => setCategoryEditor({ ...category })} className="min-h-9 flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#435d32] hover:bg-[#f0f3e9] sm:flex-none sm:px-3 sm:text-sm">تعديل</button>
                <button type="button" disabled={saving} onClick={() => void archiveCategory(category)} className="min-h-9 flex-1 rounded-lg px-2 py-1.5 text-[10px] text-[#77766c] hover:bg-[#f1f0eb] disabled:opacity-50 sm:flex-none sm:px-3 sm:text-xs">{category.active ? 'إخفاء' : 'إظهار'}</button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {!loading && section === 'options' ? (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-3">
          {Object.values(catalog.groups).map((group) => (
            <article key={group.id} className="flex min-w-0 flex-col rounded-2xl border border-[#e9e7df] bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-[#343128]">{group.ar}</h3>
                  <p className="mt-1 text-xs text-[#858378]">{group.required ? 'اختيار مطلوب' : 'اختياري'} · {group.multi ? 'متعدد الاختيارات' : 'اختيار واحد'}</p>
                </div>
                <span className="rounded-full bg-[#f3f4ed] px-2.5 py-1 text-[10px] text-[#687650]">{catalog.products.filter((product) => product.groups.includes(group.id)).length} أصناف</span>
              </div>
              <ul className="mt-3 flex-1 divide-y divide-[#f0efe9]">
                {group.options.map((option, index) => (
                  <li key={`${group.id}-${index}`} className="flex justify-between gap-2 py-2 text-sm">
                    <span className="truncate text-[#514d43]">{option.ar}{option.default ? ' · افتراضي' : ''}</span>
                    <span className="shrink-0 font-semibold text-[#435d32]">{option.price ? `+${option.price} ج.م` : 'بدون زيادة'}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2 border-t border-[#f0efe9] pt-3">
                <button type="button" onClick={() => setGroupEditor(structuredClone(group))} className="flex-1 rounded-lg bg-[#f0f3e9] px-3 py-2 text-sm font-semibold text-[#435d32] hover:bg-[#e4ead9]">تعديل المجموعة</button>
                <button type="button" disabled={saving} onClick={() => void deleteGroup(group)} className="rounded-lg px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50">حذف</button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {productEditor ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto bg-[#15170f]/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <form role="dialog" aria-modal="true" aria-labelledby="product-editor-title" onSubmit={(event) => void saveProduct(event)} className="my-0 max-h-[94dvh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-t-[1.5rem] bg-white p-5 shadow-2xl sm:my-auto sm:rounded-[1.5rem] sm:p-7">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div><h3 id="product-editor-title" className="text-xl font-bold text-[#302b23]">{catalog.products.some((product) => product.id === productEditor.id) ? 'تعديل صنف' : 'إضافة صنف جديد'}</h3></div>
              <button type="button" onClick={() => setProductEditor(null)} aria-label="إغلاق" className="rounded-full bg-[#f3f1e9] px-3 py-1 text-xl">×</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>الاسم بالعربي<input required maxLength={150} value={productEditor.ar} onChange={(event) => setProductEditor({ ...productEditor, ar: event.target.value })} className={fieldClass} /></label>
              <label className={labelClass}>الاسم بالإنجليزي<input maxLength={150} value={productEditor.en} onChange={(event) => setProductEditor({ ...productEditor, en: event.target.value })} className={fieldClass} /></label>
              <label className={labelClass}>التصنيف<select required value={productEditor.categoryId} onChange={(event) => setProductEditor({ ...productEditor, categoryId: event.target.value })} className={fieldClass}>{catalog.categories.filter((category) => category.active).map((category) => <option key={category.id} value={category.id}>{category.ar}</option>)}</select></label>
              <label className={labelClass}>السعر الأساسي (ج.م)<input required type="number" min="0" max="1000000" step="0.01" value={productEditor.price} onChange={(event) => setProductEditor({ ...productEditor, price: Number(event.target.value) })} className={fieldClass} /></label>
              <label className={labelClass}>سعر العرض (اختياري)<input type="number" min="0" max={productEditor.price} step="0.01" value={productEditor.offerPrice ?? ''} onChange={(event) => setProductEditor({ ...productEditor, offerPrice: event.target.value === '' ? undefined : Number(event.target.value) })} className={fieldClass} placeholder="اتركه فارغًا بدون عرض" /></label>
              <label className={labelClass}>ترتيب الظهور<input type="number" min="0" step="1" value={productEditor.displayOrder ?? 1} onChange={(event) => setProductEditor({ ...productEditor, displayOrder: Number(event.target.value) })} className={fieldClass} /></label>
              <label className={labelClass}>رابط صورة (اختياري)<input type="url" maxLength={500} value={productEditor.image ?? ''} onChange={(event) => setProductEditor({ ...productEditor, image: event.target.value || undefined })} className={fieldClass} placeholder="https://..." /></label>
              <label className={`${labelClass} sm:col-span-2`}>الوصف بالعربي<textarea maxLength={500} rows={2} value={productEditor.descriptionAr} onChange={(event) => setProductEditor({ ...productEditor, descriptionAr: event.target.value })} className={fieldClass} /></label>
              <label className={`${labelClass} sm:col-span-2`}>الوصف بالإنجليزي<textarea maxLength={500} rows={2} value={productEditor.descriptionEn} onChange={(event) => setProductEditor({ ...productEditor, descriptionEn: event.target.value })} className={fieldClass} /></label>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={productEditor.available} onChange={(event) => setProductEditor({ ...productEditor, available: event.target.checked })} className="accent-[#435d32]" />ظاهر في منيو العملاء</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(productEditor.bestSeller)} onChange={(event) => setProductEditor({ ...productEditor, bestSeller: event.target.checked })} className="accent-[#435d32]" />الأكثر طلبًا</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(productEditor.featured)} onChange={(event) => setProductEditor({ ...productEditor, featured: event.target.checked })} className="accent-[#435d32]" />صنف مميز</label>
            </div>
            <fieldset className="mt-5 rounded-xl border border-[#e9e7df] p-3">
              <legend className="px-1 text-sm font-semibold text-[#514d43]">خيارات وإضافات الصنف</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.values(catalog.groups).map((group) => (
                  <label key={group.id} className="flex items-start gap-2 rounded-lg bg-[#fafaf7] p-2.5 text-sm">
                    <input type="checkbox" checked={productEditor.groups.includes(group.id)} onChange={(event) => setProductEditor({ ...productEditor, groups: event.target.checked ? [...productEditor.groups, group.id] : productEditor.groups.filter((id) => id !== group.id) })} className="mt-1 accent-[#435d32]" />
                    <span>{group.ar}<span className="mt-0.5 block text-[11px] text-[#858378]">{group.required ? 'مطلوب' : 'اختياري'} · {group.options.length} اختيارات</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            {error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : null}
            <div className="mt-5 flex flex-col-reverse gap-2 border-t border-[#efeee7] pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setProductEditor(null)} className="rounded-xl bg-[#f3f1e9] px-5 py-2.5 text-sm font-semibold text-[#514d43]">إلغاء</button>
              <button type="submit" disabled={saving} className="rounded-xl bg-[#435d32] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'جارٍ الحفظ…' : 'حفظ الصنف'}</button>
            </div>
          </form>
        </div>
      ) : null}

      {categoryEditor ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto bg-[#15170f]/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <form role="dialog" aria-modal="true" aria-labelledby="category-editor-title" onSubmit={(event) => void saveCategory(event)} className="my-0 w-full max-w-lg rounded-t-[1.5rem] bg-white p-5 shadow-2xl sm:my-auto sm:rounded-[1.5rem] sm:p-7">
            <div className="mb-5 flex justify-between"><h3 id="category-editor-title" className="text-xl font-bold text-[#302b23]">{catalog.categories.some((category) => category.id === categoryEditor.id) ? 'تعديل التصنيف' : 'إضافة تصنيف'}</h3><button type="button" onClick={() => setCategoryEditor(null)} aria-label="إغلاق">×</button></div>
            <div className="space-y-3">
              <label className={labelClass}>الاسم بالعربي<input required maxLength={100} value={categoryEditor.ar} onChange={(event) => setCategoryEditor({ ...categoryEditor, ar: event.target.value })} className={fieldClass} /></label>
              <label className={labelClass}>الاسم بالإنجليزي<input maxLength={100} value={categoryEditor.en} onChange={(event) => setCategoryEditor({ ...categoryEditor, en: event.target.value })} className={fieldClass} /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className={labelClass}>مكان التحضير<select value={categoryEditor.station} onChange={(event) => setCategoryEditor({ ...categoryEditor, station: event.target.value as Category['station'] })} className={fieldClass}><option value="bar">البار</option><option value="kitchen">المطبخ</option></select></label>
                <label className={labelClass}>الترتيب<input type="number" min="0" step="1" value={categoryEditor.displayOrder} onChange={(event) => setCategoryEditor({ ...categoryEditor, displayOrder: Number(event.target.value) })} className={fieldClass} /></label>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={categoryEditor.active} onChange={(event) => setCategoryEditor({ ...categoryEditor, active: event.target.checked })} className="accent-[#435d32]" />التصنيف ظاهر للعملاء</label>
            </div>
            {error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : null}
            <div className="mt-5 flex flex-col-reverse gap-2 border-t border-[#efeee7] pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setCategoryEditor(null)} className="rounded-xl bg-[#f3f1e9] px-5 py-2.5 text-sm font-semibold">إلغاء</button>
              <button type="submit" disabled={saving} className="rounded-xl bg-[#435d32] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'جارٍ الحفظ…' : 'حفظ التصنيف'}</button>
            </div>
          </form>
        </div>
      ) : null}

      {groupEditor ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto bg-[#15170f]/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <form role="dialog" aria-modal="true" aria-labelledby="group-editor-title" onSubmit={(event) => void saveGroup(event)} className="my-0 max-h-[94dvh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-t-[1.5rem] bg-white p-5 shadow-2xl sm:my-auto sm:rounded-[1.5rem] sm:p-7">
            <div className="mb-5 flex justify-between"><div><h3 id="group-editor-title" className="text-xl font-bold text-[#302b23]">{catalog.groups[groupEditor.id] ? 'تعديل مجموعة الخيارات' : 'إضافة مجموعة خيارات'}</h3></div><button type="button" onClick={() => setGroupEditor(null)} aria-label="إغلاق">×</button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>اسم المجموعة بالعربي<input required maxLength={100} value={groupEditor.ar} onChange={(event) => setGroupEditor({ ...groupEditor, ar: event.target.value })} className={fieldClass} /></label>
              <label className={labelClass}>اسم المجموعة بالإنجليزي<input maxLength={100} value={groupEditor.en} onChange={(event) => setGroupEditor({ ...groupEditor, en: event.target.value })} className={fieldClass} /></label>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={groupEditor.required} onChange={(event) => {
                const required = event.target.checked;
                setGroupEditor({
                  ...groupEditor,
                  required,
                  options: required && !groupEditor.multi && !groupEditor.options.some((option) => option.default)
                    ? groupEditor.options.map((option, index) => ({ ...option, default: index === 0 }))
                    : groupEditor.options,
                });
              }} className="accent-[#435d32]" />اختيار مطلوب</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={groupEditor.multi} onChange={(event) => {
                const multi = event.target.checked;
                setGroupEditor({
                  ...groupEditor,
                  multi,
                  options: !multi && groupEditor.required && !groupEditor.options.some((option) => option.default)
                    ? groupEditor.options.map((option, index) => ({ ...option, default: index === 0 }))
                    : groupEditor.options,
                });
              }} className="accent-[#435d32]" />السماح بأكثر من اختيار</label>
            </div>
            <div className="mt-5 flex items-center justify-between gap-2"><h4 className="font-bold text-[#403d33]">الاختيارات والأسعار</h4><button type="button" onClick={() => setGroupEditor({ ...groupEditor, options: [...groupEditor.options, { ar: '', en: '', price: 0 }] })} className="rounded-lg bg-[#f0f3e9] px-3 py-2 text-xs font-semibold text-[#435d32]">+ إضافة اختيار</button></div>
            <div className="mt-3 space-y-2">
              {groupEditor.options.map((option, index) => (
                <div key={index} className="grid grid-cols-2 items-end gap-2 rounded-xl bg-[#fafaf7] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_100px_auto_auto]">
                  <label className={`${labelClass} col-span-2 sm:col-span-1`}>الاسم بالعربي<input required maxLength={100} value={option.ar} onChange={(event) => setGroupEditor({ ...groupEditor, options: groupEditor.options.map((item, i) => i === index ? { ...item, ar: event.target.value } : item) })} className={fieldClass} /></label>
                  <label className={`${labelClass} col-span-2 sm:col-span-1`}>الاسم بالإنجليزي<input maxLength={100} value={option.en} onChange={(event) => setGroupEditor({ ...groupEditor, options: groupEditor.options.map((item, i) => i === index ? { ...item, en: event.target.value } : item) })} className={fieldClass} /></label>
                  <label className={`${labelClass} col-span-1`}>زيادة السعر<input type="number" min="0" max="1000000" step="0.01" value={option.price} onChange={(event) => setGroupEditor({ ...groupEditor, options: groupEditor.options.map((item, i) => i === index ? { ...item, price: Number(event.target.value) } : item) })} className={fieldClass} /></label>
                  {!groupEditor.multi ? <label className="col-span-1 flex items-center gap-1.5 pb-2 text-xs"><input type="radio" name="default-option" checked={Boolean(option.default)} onChange={() => setGroupEditor({ ...groupEditor, options: groupEditor.options.map((item, i) => ({ ...item, default: i === index })) })} className="accent-[#435d32]" />افتراضي</label> : <span />}
                  <button type="button" disabled={groupEditor.options.length <= 1} onClick={() => setGroupEditor({ ...groupEditor, options: groupEditor.options.filter((_, i) => i !== index) })} className="col-span-2 rounded-lg px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-40 sm:col-span-1">حذف الاختيار</button>
                </div>
              ))}
            </div>
            {error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : null}
            <div className="mt-5 flex flex-col-reverse gap-2 border-t border-[#efeee7] pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setGroupEditor(null)} className="rounded-xl bg-[#f3f1e9] px-5 py-2.5 text-sm font-semibold">إلغاء</button>
              <button type="submit" disabled={saving} className="rounded-xl bg-[#435d32] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'جارٍ الحفظ…' : 'حفظ مجموعة الخيارات'}</button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
