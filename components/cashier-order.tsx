'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CatalogGroup, Category, Product } from '@/lib/types';
import { getProductPrice } from '@/lib/pricing';

type MenuResponse = { products: Product[]; categories?: Category[]; groups?: Record<string, CatalogGroup> };
type Selection = { groupId: string; optionIndex: number };
type CartLine = { key: string; productId: string; quantity: number; customizations: Selection[] };

const lineKey = (productId: string, customizations: Selection[]) => `${productId}|${[...customizations]
  .sort((a, b) => a.groupId.localeCompare(b.groupId) || a.optionIndex - b.optionIndex)
  .map((c) => `${c.groupId}:${c.optionIndex}`).join(',')}`;

const inputClass = 'w-full rounded-xl border border-[#dbe7e3] bg-white px-3 py-2.5 text-sm transition placeholder:text-[#a6b3b0] focus:border-[#176f68] focus:outline-none focus:ring-2 focus:ring-[#4b9b91]/20';

export default function CashierOrder({ onCreated }: { onCreated: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<CartLine[]>([]);
  const [groups, setGroups] = useState<Record<string, CatalogGroup>>({});
  const [customizing, setCustomizing] = useState<Product | null>(null);
  const [selected, setSelected] = useState<Record<string, number[]>>({});
  const [customQty, setCustomQty] = useState(1);
  const [orderType, setOrderType] = useState<'DINE_IN' | 'TAKEAWAY' | 'DELIVERY'>('DINE_IN');
  const [tableNumber, setTableNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void fetch('/api/menu')
      .then(async (response) => {
        const data = await response.json() as MenuResponse & { error?: string };
        if (!response.ok) throw new Error(data.error || 'تعذر تحميل المنيو');
        setGroups(data.groups ?? {});
        setProducts(data.products.filter((product) => product.available));
        setCategories((data.categories ?? []).filter((category) => category.active).sort((a, b) => a.displayOrder - b.displayOrder));
      })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل المنيو'))
      .finally(() => setLoading(false));
  }, []);

  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rank = new Map(categories.map((category, index) => [category.id, index]));
    return products
      .filter((product) => (Boolean(query) || activeCategory === 'all' || product.categoryId === activeCategory)
        && (!query || `${product.ar} ${product.en}`.toLowerCase().includes(query)))
      .map((product, index) => ({ product, index }))
      .sort((a, b) => (rank.get(a.product.categoryId) ?? 99) - (rank.get(b.product.categoryId) ?? 99)
        || (a.product.displayOrder ?? a.index) - (b.product.displayOrder ?? b.index))
      .map(({ product }) => product);
  }, [products, categories, activeCategory, search]);
  const extrasPrice = (customizations: Selection[]) => customizations.reduce((sum, c) => sum + (groups[c.groupId]?.options[c.optionIndex]?.price ?? 0), 0);
  const linePrice = (line: CartLine) => {
    const product = productsById.get(line.productId);
    return product ? getProductPrice(product) + extrasPrice(line.customizations) : 0;
  };
  const total = items.reduce((sum, line) => sum + linePrice(line) * line.quantity, 0);

  const addLine = (productId: string, customizations: Selection[], quantity = 1) => {
    const key = lineKey(productId, customizations);
    setItems((current) => current.some((item) => item.key === key)
      ? current.map((item) => item.key === key ? { ...item, quantity: item.quantity + quantity } : item)
      : [...current, { key, productId, quantity, customizations }]);
  };

  const addItem = (product: Product) => {
    const productGroups = (product.groups ?? []).filter((groupId) => groups[groupId]);
    if (productGroups.length === 0) {
      addLine(product.id, []);
      return;
    }
    const defaults: Record<string, number[]> = {};
    for (const groupId of productGroups) {
      const group = groups[groupId];
      if (group.required && group.options.length > 0) {
        const index = group.options.findIndex((option) => option.default);
        defaults[groupId] = [index >= 0 ? index : 0];
      }
    }
    setSelected(defaults);
    setCustomQty(1);
    setCustomizing(product);
  };

  const confirmCustom = () => {
    if (!customizing) return;
    const productGroups = (customizing.groups ?? []).filter((groupId) => groups[groupId]);
    const missing = productGroups.find((groupId) => groups[groupId].required && !(selected[groupId]?.length));
    if (missing) {
      setError(`اختار ${groups[missing].ar}`);
      return;
    }
    setError('');
    const customizations = productGroups.flatMap((groupId) => (selected[groupId] ?? []).map((optionIndex) => ({ groupId, optionIndex })));
    addLine(customizing.id, customizations, customQty);
    setCustomizing(null);
  };

  const changeQuantity = (key: string, quantity: number) => {
    setItems((current) => quantity > 0 ? current.map((item) => item.key === key ? { ...item, quantity } : item) : current.filter((item) => item.key !== key));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (items.length === 0) {
      setError('أضف صنفًا واحدًا على الأقل للطلب');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderType,
          tableNumber: orderType === 'DINE_IN' ? tableNumber : undefined,
          customerName: customerName || undefined,
          customerPhone: customerPhone || undefined,
          customerAddress: orderType === 'DELIVERY' ? customerAddress : undefined,
          paymentMethod,
          items: items.map(({ productId, quantity, customizations }) => ({ productId, quantity, customizations })),
          idempotencyKey: `cashier-${crypto.randomUUID()}`,
        }),
      });
      const data = await response.json() as { error?: string; order?: { orderNumber: string } };
      if (!response.ok) {
        setError(data.error || 'تعذر إنشاء الطلب');
        return;
      }
      setItems([]);
      setTableNumber('');
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
      setMessage(`تم إنشاء الطلب ${data.order?.orderNumber ?? ''}`);
      onCreated();
    } catch {
      setError('تعذر الاتصال بالخادم أثناء إنشاء الطلب');
    } finally {
      setSubmitting(false);
    }
  };

  const delivery = orderType === 'DELIVERY';

  return (
    <section className="space-y-5">
      <div className="rounded-[1.5rem] border border-[#dbe7e3] bg-white p-5">
        <h2 className="text-xl font-bold text-[#232122]">إنشاء طلب من الكاشير</h2>
        <p className="mt-1 text-sm text-[#705331]">سجّل طلب العميل مباشرة من نفس مسار الطلبات.</p>
      </div>
      <form onSubmit={submit} className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,.7fr)]">
        <div className="min-w-0 rounded-[1.5rem] border border-[#dbe7e3] bg-white p-4 sm:p-5">
          <label className="mb-3 block">
            <span className="sr-only">ابحث عن صنف في المنيو</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث عن صنف..."
              aria-label="ابحث عن صنف في المنيو"
              className={inputClass}
            />
          </label>
          {categories.length ? (
            <nav aria-label="تصنيفات المنيو" className="category-scroll mb-4 flex gap-2 overflow-x-auto pb-1">
              {[{ id: 'all', ar: 'الكل' }, ...categories].map((category) => (
                <button key={category.id} type="button" aria-pressed={activeCategory === category.id} onClick={() => setActiveCategory(category.id)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95 ${activeCategory === category.id ? 'bg-[#176f68] text-white shadow-sm' : 'bg-[#eef5f3] text-[#4f6762] hover:bg-[#dfeeea]'}`}>{category.ar}</button>
              ))}
            </nav>
          ) : null}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4">
            {loading ? <p className="col-span-full text-sm text-[#705331]">جارٍ تحميل المنيو…</p> : filteredProducts.map((product) => {
              const quantity = items.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
              return (
                <button key={product.id} type="button" onClick={() => addItem(product)} className={`group relative flex min-w-0 flex-col rounded-2xl border bg-white p-2 text-right transition active:scale-[.97] hover:-translate-y-0.5 hover:shadow-md ${quantity ? 'border-[#4b9b91] ring-2 ring-[#4b9b91]/25' : 'border-[#e0eae7]'}`}>
                  <span className="relative block aspect-square w-full overflow-hidden rounded-xl bg-[#f1f6f4]">
                    {product.image ? <Image src={product.image} alt={product.ar} fill sizes="(max-width: 640px) 45vw, 180px" unoptimized className="object-cover transition duration-300 group-hover:scale-105" /> : <span className="flex h-full w-full items-center justify-center text-3xl text-[#8bb5ae]" aria-hidden="true">☕</span>}
                    {quantity ? <span className="absolute start-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#176f68] px-1.5 text-xs font-bold text-white shadow">{quantity}</span> : null}
                  </span>
                  <span className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-5 text-[#232122]">{product.ar}</span>
                  <span className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-[#176f68]">{getProductPrice(product).toFixed(2)} <span className="text-[10px] font-medium text-[#647b77]">ج.م</span></span>
                    <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#176f68] text-lg leading-none text-white transition group-hover:bg-[#115b56]">+</span>
                  </span>
                </button>
              );
            })}
            {!loading && filteredProducts.length === 0 ? <p className="col-span-full text-sm text-[#705331]">ملقيناش صنف بالاسم ده. جرّب كلمة تانية.</p> : null}
          </div>
        </div>
        <div className="min-w-0 space-y-3 rounded-[1.5rem] border border-[#dbe7e3] bg-white p-4 sm:p-5">
          <div className="flex gap-2" role="group" aria-label="نوع الطلب">{([['DINE_IN', 'داخلي'], ['TAKEAWAY', 'تيك أواي'], ['DELIVERY', 'توصيل']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={orderType === value} onClick={() => setOrderType(value)} className={`flex-1 rounded-xl px-2 py-2 text-sm font-semibold transition active:scale-95 ${orderType === value ? 'bg-[#176f68] text-white' : 'bg-[#eef5f3] text-[#4f6762] hover:bg-[#dfeeea]'}`}>{label}</button>)}</div>

          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#dbe7e3] bg-[#f4f9f7] px-3 py-4 text-center text-xs text-[#8b8b7b]">السلة فاضية — اختار أصناف من المنيو.</p>
          ) : items.map((item) => {
            const product = productsById.get(item.productId);
            const name = product?.ar ?? '';
            return (
              <div key={item.key} className="flex items-center gap-2.5 rounded-xl border border-[#e0eae7] bg-white p-2 text-sm">
                <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-[#f1f6f4]">{product?.image ? <Image src={product.image} alt={name} fill sizes="44px" unoptimized className="object-cover" /> : null}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-[#232122]">{name}</span>
                  {item.customizations.length ? <span className="block text-xs leading-5 text-[#705331]">{item.customizations.map((c) => groups[c.groupId]?.options[c.optionIndex]?.ar).filter(Boolean).join('، ')}</span> : null}
                  <span className="text-xs text-[#647b77]">{linePrice(item).toFixed(2)} ج.م</span>
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" aria-label={`تقليل كمية ${name}`} onClick={() => changeQuantity(item.key, item.quantity - 1)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#dbe7e3] bg-white text-base font-bold text-[#176f68] transition hover:bg-[#edf6f3] active:scale-95">−</button>
                  <span aria-label={`كمية ${name}`} className="w-6 text-center font-bold tabular-nums">{item.quantity}</span>
                  <button type="button" aria-label={`زيادة كمية ${name}`} onClick={() => changeQuantity(item.key, item.quantity + 1)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#dbe7e3] bg-white text-base font-bold text-[#176f68] transition hover:bg-[#edf6f3] active:scale-95">+</button>
                </div>
              </div>
            );
          })}

          {orderType === 'DINE_IN' ? (
            <label className="block text-xs font-semibold text-[#705331]">
              رقم الطاولة
              <input required placeholder="مثال: 3" value={tableNumber} onChange={(event) => setTableNumber(event.target.value)} className={`mt-1 ${inputClass}`} />
            </label>
          ) : null}
          {delivery ? (
            <>
              <label className="block text-xs font-semibold text-[#705331]">
                اسم العميل
                <input required placeholder="اسم العميل" value={customerName} onChange={(event) => setCustomerName(event.target.value)} className={`mt-1 ${inputClass}`} />
              </label>
              <label className="block text-xs font-semibold text-[#705331]">
                رقم الهاتف
                <input required type="tel" autoComplete="tel" placeholder="01xxxxxxxxx" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} className={`mt-1 ${inputClass}`} />
              </label>
              <label className="block text-xs font-semibold text-[#705331]">
                العنوان
                <input required placeholder="العنوان بالتفصيل" value={customerAddress} onChange={(event) => setCustomerAddress(event.target.value)} className={`mt-1 ${inputClass}`} />
              </label>
            </>
          ) : (
            <>
              <label className="block text-xs font-semibold text-[#705331]">
                اسم العميل <span className="font-normal text-[#a6a99b]">(اختياري)</span>
                <input placeholder="اسم العميل" value={customerName} onChange={(event) => setCustomerName(event.target.value)} className={`mt-1 ${inputClass}`} />
              </label>
              <label className="block text-xs font-semibold text-[#705331]">
                رقم الهاتف <span className="font-normal text-[#a6a99b]">(اختياري)</span>
                <input type="tel" autoComplete="tel" placeholder="01xxxxxxxxx" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} className={`mt-1 ${inputClass}`} />
              </label>
            </>
          )}
          <label className="block text-xs font-semibold text-[#705331]">
            طريقة الدفع
            <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as 'cash' | 'card')} className={`mt-1 ${inputClass}`}>
              <option value="cash">كاش</option>
              <option value="card">بطاقة</option>
            </select>
          </label>
          <div className="flex items-center justify-between border-t border-[#dbe7e3] pt-3 font-bold"><span>الإجمالي التقريبي</span><span>{total.toFixed(2)} ج.م</span></div>
          <button type="submit" disabled={submitting || loading || items.length === 0} className="w-full rounded-xl bg-[#176f68] px-4 py-3 font-semibold text-white transition hover:bg-[#115b56] active:scale-[.99] disabled:opacity-50">{submitting ? 'جارٍ إنشاء الطلب…' : 'تأكيد الطلب'}</button>
          {message ? <p role="status" className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 motion-enter">{message}</p> : null}
          {error ? <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 motion-enter">{error}</p> : null}
        </div>
      </form>
      {customizing && typeof document !== 'undefined' ? createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div role="dialog" aria-modal="true" aria-label={`إضافات ${customizing.ar}`} className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-[1.5rem] bg-white p-5 shadow-2xl sm:rounded-[1.5rem]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#232122]">{customizing.ar}</h3>
              <button type="button" onClick={() => setCustomizing(null)} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f1f6f4] text-xl">×</button>
            </div>
            <div className="space-y-3">
              {(customizing.groups ?? []).map((groupId) => {
                const group = groups[groupId];
                if (!group) return null;
                return (
                  <fieldset key={groupId} className="rounded-2xl border border-[#dbe7e3] p-3">
                    <legend className="px-1 text-sm font-semibold text-[#232122]">{group.ar} <span className="text-xs font-normal text-[#647b77]">{group.required ? 'مطلوب' : 'اختياري'}{group.multi ? ' · أكتر من اختيار' : ''}</span></legend>
                    <div className="flex flex-wrap gap-2">
                      {group.options.map((option, index) => {
                        const on = (selected[groupId] ?? []).includes(index);
                        return (
                          <button key={`${groupId}-${index}`} type="button" aria-pressed={on} onClick={() => setSelected((prev) => {
                            const current = prev[groupId] ?? [];
                            if (group.multi) return { ...prev, [groupId]: on ? current.filter((value) => value !== index) : [...current, index] };
                            return { ...prev, [groupId]: !on || group.required ? [index] : [] };
                          })} className={`min-h-10 rounded-xl border px-3 py-2 text-sm transition ${on ? 'border-[#176f68] bg-[#e3f1ee] font-semibold text-[#115b56]' : 'border-[#dbe7e3] bg-white'}`}>
                            {option.ar}{option.price ? ` (+${option.price})` : ''}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              })}
              {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
              <div className="flex items-center justify-between gap-3 border-t border-[#dbe7e3] pt-3">
                <div className="flex items-center gap-2">
                  <button type="button" aria-label="تقليل الكمية" onClick={() => setCustomQty((q) => Math.max(1, q - 1))} className="h-9 w-9 rounded-full bg-[#f1f6f4] text-lg">−</button>
                  <span className="min-w-6 text-center font-bold tabular-nums">{customQty}</span>
                  <button type="button" aria-label="زيادة الكمية" onClick={() => setCustomQty((q) => q + 1)} className="h-9 w-9 rounded-full bg-[#f1f6f4] text-lg">+</button>
                </div>
                <button type="button" onClick={confirmCustom} className="flex-1 rounded-xl bg-[#176f68] px-4 py-3 font-semibold text-white">
                  إضافة · {((getProductPrice(customizing) + extrasPrice((customizing.groups ?? []).flatMap((groupId) => (selected[groupId] ?? []).map((optionIndex) => ({ groupId, optionIndex }))))) * customQty).toFixed(2)} ج.م
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </section>
  );
}
