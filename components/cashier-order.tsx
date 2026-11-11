'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Category, Product } from '@/lib/types';
import { getProductPrice } from '@/lib/pricing';

type MenuResponse = { categories: Category[]; products: Product[] };

export default function CashierOrder({ onCreated }: { onCreated: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<Array<{ productId: string; quantity: number }>>([]);
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
        setProducts(data.products.filter((product) => product.available));
      })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل المنيو'))
      .finally(() => setLoading(false));
  }, []);

  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => !query || `${product.ar} ${product.en}`.toLowerCase().includes(query));
  }, [products, search]);
  const total = items.reduce((sum, item) => sum + (productsById.get(item.productId) ? getProductPrice(productsById.get(item.productId)!) * item.quantity : 0), 0);

  const addItem = (productId: string) => {
    setItems((current) => {
      const existing = current.find((item) => item.productId === productId);
      return existing
        ? current.map((item) => item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { productId, quantity: 1 }];
    });
  };

  const changeQuantity = (productId: string, quantity: number) => {
    setItems((current) => quantity > 0 ? current.map((item) => item.productId === productId ? { ...item, quantity } : item) : current.filter((item) => item.productId !== productId));
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
          items: items.map((item) => ({ ...item, customizations: [] })),
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

  return (
    <section className="space-y-5">
      <div className="rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-5">
        <h2 className="text-xl font-bold text-[#232122]">إنشاء طلب من الكاشير</h2>
        <p className="mt-1 text-sm text-[#705331]">سجّل طلب العميل مباشرة من نفس مسار الطلبات.</p>
      </div>
      <form onSubmit={submit} className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,.7fr)]">
        <div className="min-w-0 rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-4 sm:p-5">
          <label className="mb-3 block">
            <span className="sr-only">ابحث عن صنف في المنيو</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث عن صنف..."
              aria-label="ابحث عن صنف في المنيو"
              className="w-full"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {loading ? <p className="text-sm text-[#705331]">جارٍ تحميل المنيو…</p> : filteredProducts.map((product) => {
              const quantity = items.find((item) => item.productId === product.id)?.quantity ?? 0;
              return <button key={product.id} type="button" onClick={() => addItem(product.id)} className={`flex min-w-0 items-center justify-between gap-2 rounded-xl border px-3 py-3 text-right transition ${quantity ? 'border-[#6B8136] bg-[#f3f6ec]' : 'border-[#E5E3B2] bg-white hover:bg-[#FCF5ED]'}`}><span className="min-w-0 break-words"><strong className="block">{product.ar}</strong><span className="text-xs text-[#705331]">{getProductPrice(product).toFixed(2)} ج.م</span></span>{quantity ? <span className="shrink-0 rounded-full bg-[#6B8136] px-2 py-1 text-xs text-white">{quantity}</span> : <span className="shrink-0 text-[#6B8136]">+ إضافة</span>}</button>;
            })}
            {!loading && filteredProducts.length === 0 ? <p className="text-sm text-[#705331] sm:col-span-2">ملقيناش صنف بالاسم ده. جرّب كلمة تانية.</p> : null}
          </div>
        </div>
        <div className="min-w-0 space-y-3 rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-4 sm:p-5">
          <div className="flex gap-2">{([['DINE_IN', 'داخلي'], ['TAKEAWAY', 'تيك أواي'], ['DELIVERY', 'توصيل']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setOrderType(value)} className={`flex-1 rounded-xl px-2 py-2 text-sm font-semibold ${orderType === value ? 'bg-[#6B8136] text-white' : 'bg-[#FCF5ED] text-[#705331]'}`}>{label}</button>)}</div>
          {items.map((item) => <div key={item.productId} className="flex items-center justify-between gap-2 text-sm"><span>{productsById.get(item.productId)?.ar}</span><input aria-label={`كمية ${productsById.get(item.productId)?.ar}`} type="number" min="0" value={item.quantity} onChange={(event) => changeQuantity(item.productId, Number(event.target.value))} className="w-20" /></div>)}
          {orderType === 'DINE_IN' ? <input required placeholder="رقم الطاولة" value={tableNumber} onChange={(event) => setTableNumber(event.target.value)} /> : null}
          {orderType === 'DELIVERY' ? <><input required placeholder="اسم العميل" value={customerName} onChange={(event) => setCustomerName(event.target.value)} /><input required type="tel" autoComplete="tel" placeholder="رقم الهاتف" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} /><input required placeholder="العنوان" value={customerAddress} onChange={(event) => setCustomerAddress(event.target.value)} /></> : <><input placeholder="اسم العميل (اختياري)" value={customerName} onChange={(event) => setCustomerName(event.target.value)} /><input required type="tel" autoComplete="tel" placeholder="رقم الهاتف" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} /></>}
          <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as 'cash' | 'card')}><option value="cash">كاش</option><option value="card">بطاقة</option></select>
          <div className="flex items-center justify-between border-t border-[#E5E3B2] pt-3 font-bold"><span>الإجمالي التقريبي</span><span>{total.toFixed(2)} ج.م</span></div>
          <button type="submit" disabled={submitting || loading} className="w-full rounded-xl bg-[#6B8136] px-4 py-3 font-semibold text-white disabled:opacity-50">{submitting ? 'جارٍ إنشاء الطلب…' : 'تأكيد الطلب'}</button>
          {message ? <p role="status" className="text-sm text-[#6B8136]">{message}</p> : null}
          {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
        </div>
      </form>
    </section>
  );
}
