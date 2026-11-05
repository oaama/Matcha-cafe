'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogGroup, Category, Product } from '@/lib/types';
import { calculateOrderTotal } from '@/lib/store';
import { DEFAULT_PRICING_SETTINGS, getProductPrice, type PricingSettings } from '@/lib/pricing';

type MenuResponse = {
  categories: Category[];
  products: Product[];
  groups: Record<string, CatalogGroup>;
  pricing?: PricingSettings;
};

type OrderFeedback = {
  message: string;
  type: 'success' | 'error' | 'info';
};

type CartItem = {
  productId: string;
  quantity: number;
  notes?: string;
  customizations: Array<{ groupId: string; optionIndex: number }>;
};

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.productId === 'string'
    && typeof item.quantity === 'number'
    && Number.isInteger(item.quantity)
    && item.quantity > 0
    && (item.notes === undefined || typeof item.notes === 'string')
    && Array.isArray(item.customizations)
    && item.customizations.every((customization) => {
      if (!customization || typeof customization !== 'object') return false;
      const selection = customization as Record<string, unknown>;
      return typeof selection.groupId === 'string'
        && typeof selection.optionIndex === 'number'
        && Number.isInteger(selection.optionIndex)
        && selection.optionIndex >= 0;
    });
}

export default function CustomerOrdering() {
  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('matcha');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartReady, setCartReady] = useState(false);
  const [orderType, setOrderType] = useState<'DINE_IN' | 'TAKEAWAY' | 'DELIVERY'>('DINE_IN');
  const [tableNumber, setTableNumber] = useState('3');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [additionalAddressDetails, setAdditionalAddressDetails] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [loading, setLoading] = useState(true);
  const [orderStatus, setOrderStatus] = useState<OrderFeedback | null>(null);
  const [menuError, setMenuError] = useState(false);
  const [menuLoadAttempt, setMenuLoadAttempt] = useState(0);
  const [customizing, setCustomizing] = useState<Product | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, number[]>>({});
  const [productNotes, setProductNotes] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const idempotencyAttempt = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        const saved = localStorage.getItem('matcha-cart');
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.every(isCartItem)) {
            setCart(parsed);
          } else {
            setOrderStatus({ message: 'تعذر استعادة السلة المحفوظة، يمكنك بدء سلة جديدة', type: 'error' });
          }
        }
      } catch {
        setOrderStatus({ message: 'تعذر استعادة السلة المحفوظة، يمكنك بدء سلة جديدة', type: 'error' });
      } finally {
        setCartReady(true);
      }
    });
    let active = true;
    fetch('/api/menu')
      .then((res) => {
        if (!res.ok) throw new Error('Unable to load catalog');
        return res.json() as Promise<MenuResponse>;
      })
      .then((data) => {
        if (!active) return;
        setMenu(data);
        if (!data.categories.some((category) => category.id === 'matcha' && category.active)) {
          setSelectedCategory('all');
        }
      })
      .catch(() => {
        if (active) setMenuError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [menuLoadAttempt]);

  useEffect(() => {
    if (!cartReady) return;
    const timeout = window.setTimeout(() => {
      try {
        localStorage.setItem('matcha-cart', JSON.stringify(cart));
      } catch {
        setOrderStatus({ message: 'تعذر حفظ السلة على هذا الجهاز', type: 'error' });
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [cart, cartReady]);

  useEffect(() => {
    if (!customizing && !mobileCartOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCustomizing(null);
        setMobileCartOpen(false);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [customizing, mobileCartOpen]);

  const filteredProducts = useMemo(() => {
    if (!menu) return [];
    const lower = search.trim().toLowerCase();
    return menu.products.filter((product) => {
      const matchesCategory = Boolean(lower) || selectedCategory === 'all' || product.categoryId === selectedCategory;
      const matchesSearch = !lower || `${product.ar} ${product.en} ${product.descriptionAr} ${product.descriptionEn}`.toLowerCase().includes(lower);
      return matchesCategory && matchesSearch && product.available;
    });
  }, [menu, search, selectedCategory]);

  const addToCart = (product: Product) => {
    const groups = product.groups ?? [];
    const validSelections = groups.reduce<Record<string, number[]>>((acc, groupId) => {
      const group = menu?.groups?.[groupId];
      if (!group) return acc;
      if (group.required && group.options.length > 0) {
        const defaultIndex = group.options.findIndex((option) => option.default);
        acc[groupId] = [defaultIndex >= 0 ? defaultIndex : 0];
      }
      return acc;
    }, {});

    setCustomizing(product);
    setSelectedOptions(validSelections);
    setProductNotes('');
    setQuantity(1);
  };

  const finalizeAddToCart = () => {
    if (!customizing || !menu) return;
    const missingRequiredGroup = customizing.groups.find((groupId) => {
      const group = menu.groups[groupId];
      return group?.required && !(selectedOptions[groupId]?.length);
    });
    if (missingRequiredGroup) {
      setOrderStatus({ message: `من فضلك اختر ${menu.groups[missingRequiredGroup].ar}`, type: 'error' });
      return;
    }

    const customizations = customizing.groups.flatMap((groupId) =>
      (selectedOptions[groupId] ?? []).map((optionIndex) => ({ groupId, optionIndex })),
    );
    const customizationKey = (options: CartItem['customizations']) => JSON.stringify(
      [...options].sort((a, b) => a.groupId.localeCompare(b.groupId) || a.optionIndex - b.optionIndex),
    );
    const lineKey = customizationKey(customizations);

    const existing = cart.find((item) => item.productId === customizing.id
      && customizationKey(item.customizations) === lineKey
      && item.notes === (productNotes || undefined));
    if (existing) {
      setCart((prev) => prev.map((item) => item.productId === customizing.id
        && customizationKey(item.customizations) === lineKey
        && item.notes === (productNotes || undefined)
        ? { ...item, quantity: item.quantity + quantity }
        : item));
    } else {
      setCart((prev) => [...prev, { productId: customizing.id, quantity, notes: productNotes || undefined, customizations }]);
    }
    setCustomizing(null);
    setProductNotes('');
    setQuantity(1);
    setOrderStatus({ message: 'تمت إضافة المنتج إلى السلة', type: 'success' });
  };

  const updateCartQuantity = (productId: string, delta: number, customizations: Array<{ groupId: string; optionIndex: number }>, notes?: string) => {
    setCart((prev) => {
      const next = [...prev];
      const targetIndex = next.findIndex((item) => item.productId === productId
        && JSON.stringify(item.customizations) === JSON.stringify(customizations)
        && item.notes === notes);
      if (targetIndex === -1) return prev;
      const item = next[targetIndex];
      const updated = item.quantity + delta;
      if (updated <= 0) {
        next.splice(targetIndex, 1);
      } else {
        next[targetIndex] = { ...item, quantity: updated };
      }
      return next;
    });
  };

  const pricing = menu?.pricing ?? DEFAULT_PRICING_SETTINGS;
  const { subtotal, serviceFee, tax, total } = calculateOrderTotal(cart, pricing);

  const submitOrder = async () => {
    if (submitting) return;
    if (!menu || cart.length === 0) {
      setOrderStatus({ message: 'السلة فارغة', type: 'error' });
      return;
    }
    if (orderType === 'DINE_IN' && !tableNumber.trim()) {
      setOrderStatus({ message: 'من فضلك أدخل رقم الطاولة', type: 'error' });
      return;
    }
    if (orderType === 'DELIVERY' && (!customerName.trim() || !customerPhone.trim() || !customerAddress.trim())) {
      setOrderStatus({ message: 'من فضلك أدخل الاسم ورقم الهاتف وعنوان التوصيل', type: 'error' });
      return;
    }

    const fingerprint = JSON.stringify({
      orderType,
      tableNumber: orderType === 'DINE_IN' ? tableNumber.trim() : undefined,
      customerName,
      customerPhone,
      customerAddress: orderType === 'DELIVERY' ? customerAddress : undefined,
      additionalAddressDetails: orderType === 'DELIVERY' ? additionalAddressDetails : undefined,
      deliveryInstructions: orderType === 'DELIVERY' ? deliveryInstructions : undefined,
      items: cart,
    });
    const submittedCart = JSON.stringify(cart);
    if (idempotencyAttempt.current?.fingerprint !== fingerprint) {
      idempotencyAttempt.current = { fingerprint, key: `matcha-${crypto.randomUUID()}` };
    }
    const payload = {
      orderType,
      tableNumber: orderType === 'DINE_IN' ? tableNumber : undefined,
      customerName: customerName || 'ضيف',
      customerPhone: customerPhone || undefined,
      customerAddress: orderType === 'DELIVERY' ? customerAddress : undefined,
      additionalAddressDetails: orderType === 'DELIVERY' ? additionalAddressDetails : undefined,
      deliveryInstructions: orderType === 'DELIVERY' ? deliveryInstructions : undefined,
      paymentMethod: 'cash',
      notes: '',
      items: cart.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        notes: item.notes,
        customizations: item.customizations,
      })),
      idempotencyKey: idempotencyAttempt.current.key,
    };

    setSubmitting(true);
    setOrderStatus(null);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        setOrderStatus({ message: result.error || 'تعذر إرسال الطلب', type: 'error' });
        return;
      }

      setCart((currentCart) => JSON.stringify(currentCart) === submittedCart ? [] : currentCart);
      idempotencyAttempt.current = null;
      setOrderStatus({ message: `تم إرسال الطلب بنجاح رقم ${result.order.orderNumber}`, type: 'success' });
    } catch {
      setOrderStatus({ message: 'تعذر الاتصال بالخادم. حاول مرة أخرى، وسيُستخدم نفس رقم المحاولة لتجنب تكرار الطلب.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const customizationTotal = customizing
    ? (getProductPrice(customizing) + customizing.groups.reduce((groupTotal, groupId) => {
      const selectedTotal = (selectedOptions[groupId] ?? []).reduce(
        (optionTotal, optionIndex) => optionTotal + (menu?.groups[groupId]?.options[optionIndex]?.price ?? 0),
        0,
      );
      return groupTotal + selectedTotal;
    }, 0)) * quantity
    : 0;

  if (loading) {
    return (
      <main aria-label="جارٍ تحميل المنيو" aria-busy="true" className="mx-auto min-h-screen w-full min-w-0 max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 h-16 animate-pulse rounded-2xl bg-white/80 motion-reduce:animate-none" />
        <div className="mb-6 h-56 animate-pulse rounded-[1.75rem] bg-[#E5E3B2]/70 motion-reduce:animate-none" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-48 animate-pulse rounded-2xl bg-white/80 motion-reduce:animate-none" />)}
        </div>
      </main>
    );
  }

  if (menuError || !menu) {
    return (
      <main className="flex min-h-screen w-full min-w-0 items-center justify-center px-4 py-10">
        <section role="alert" className="w-full max-w-md rounded-3xl border border-[#E5E3B2] bg-white p-7 text-center shadow-[0_12px_36px_rgba(44,43,35,.08)] sm:p-9">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-2xl text-rose-700" aria-hidden="true">!</div>
          <h1 className="text-xl font-bold text-[#232122]">تعذر تحميل المنيو</h1>
          <p className="mt-2 text-sm leading-6 text-[#705331]">تحقق من اتصالك وحاول مرة أخرى. لن تتمكن من إرسال طلب قبل تحميل الأصناف.</p>
          <button type="button" onClick={() => {
            setMenuError(false);
            setLoading(true);
            setMenuLoadAttempt((attempt) => attempt + 1);
          }} className="mt-5 w-full rounded-xl bg-[#6B8136] px-4 py-3 font-semibold text-white transition hover:bg-[#5d702f]">
            إعادة المحاولة
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full min-w-0 max-w-7xl px-4 pb-28 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-10">
      <header className="mb-5 flex items-center justify-between rounded-2xl border border-[#E5E3B2] bg-white/90 px-4 py-3 shadow-[0_8px_24px_rgba(44,43,35,.045)] backdrop-blur sm:mb-7 sm:px-6">
        <div className="flex items-center gap-3">
        <Image src="/matcha-logo.png" alt="Matcha Coffee and Pancakes" width={52} height={52} className="h-12 w-12 rounded-full object-cover" priority />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-[#705331]">MATCHA CAFÉ</p>
            <h1 className="text-lg font-bold text-[#232122] sm:text-xl">منيو اليوم</h1>
          </div>
        </div>
      </header>

      <section className="relative mb-5 grid min-h-[208px] grid-cols-[minmax(0,1fr)_7rem] items-center gap-4 overflow-hidden rounded-[1.75rem] bg-gradient-to-l from-[#354a2c] via-[#405a34] to-[#617247] px-4 py-4 text-white shadow-[0_18px_42px_rgba(48,68,38,.16)] sm:mb-7 sm:block sm:min-h-[260px] sm:px-8 sm:py-9">
        <div className="pointer-events-none absolute -left-12 -top-20 h-64 w-64 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -left-1 top-8 h-36 w-36 rounded-full border border-white/10" />
        <div className="relative z-10 min-w-0 sm:max-w-2xl sm:pl-56 xl:pl-0">
          <h2 aria-label="خدلك بريك على مزاجك" className="max-w-xl text-xl font-bold leading-[1.35] tracking-tight sm:text-3xl sm:leading-[1.4] lg:text-4xl">
            <span className="sr-only">خدلك بريك على مزاجك</span>
            <span aria-hidden="true">
              {'خدلك بريك على مزاجك'.split(' ').map((word, index) => (
                <span key={word} className="hero-writing-word" style={{ animationDelay: `${index * 150}ms` }}>{word}</span>
              ))}
            </span>
          </h2>
          <p aria-label="قهوة وماتشا وحاجة حلوة.. اختار اللي بتحبه." className="mt-1 max-w-md text-xs leading-5 text-white/80 sm:mt-2 sm:text-base sm:leading-6">
            <span className="sr-only">قهوة وماتشا وحاجة حلوة.. اختار اللي بتحبه.</span>
            <span aria-hidden="true">
              {'قهوة وماتشا وحاجة حلوة.. اختار اللي بتحبه.'.split(' ').map((word, index) => (
                <span key={`${word}-${index}`} className="hero-writing-word" style={{ animationDelay: `${850 + index * 90}ms` }}>{word}</span>
              ))}
            </span>
          </p>
          <a
            href="#customer-menu"
            className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#f3ead8] px-3 py-2 text-xs font-bold text-[#34472d] shadow-[0_6px_16px_rgba(20,30,17,.16)] transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:mt-5 sm:min-h-11 sm:gap-2 sm:px-5 sm:py-2.5 sm:text-sm"
          >
            اختار مشروبك
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
              <path d="M12 5v14m-6-6 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
        <div aria-hidden="true" className="pointer-events-none relative flex h-28 w-28 items-center justify-center rounded-full bg-[#a7b783]/15 sm:absolute sm:bottom-0 sm:left-7 sm:top-auto sm:h-56 sm:w-56 lg:left-10">
          <div className="absolute inset-3 rounded-full border border-white/10 sm:inset-5" />
          <svg viewBox="0 0 160 160" fill="none" className="hero-coffee-cup relative z-10 h-24 w-24 drop-shadow-[0_12px_16px_rgba(20,30,17,.24)] sm:h-44 sm:w-44">
            <defs>
              <linearGradient id="coffee-cup-body" x1="43" y1="78" x2="117" y2="137" gradientUnits="userSpaceOnUse">
                <stop stopColor="#F3B27F" />
                <stop offset="1" stopColor="#C9634C" />
              </linearGradient>
              <linearGradient id="coffee-cup-saucer" x1="39" y1="134" x2="124" y2="150" gradientUnits="userSpaceOnUse">
                <stop stopColor="#DCE7C8" />
                <stop offset="1" stopColor="#94A96D" />
              </linearGradient>
              <linearGradient id="coffee-cup-handle" x1="121" y1="94" x2="146" y2="129" gradientUnits="userSpaceOnUse">
                <stop stopColor="#F6D493" />
                <stop offset="1" stopColor="#D8995E" />
              </linearGradient>
              <radialGradient id="coffee-cup-latte" cx="0" cy="0" r="1" gradientTransform="matrix(31 0 0 10 79 81)" gradientUnits="userSpaceOnUse">
                <stop stopColor="#D79A5B" />
                <stop offset="1" stopColor="#70402D" />
              </radialGradient>
            </defs>
            <ellipse cx="81" cy="143" rx="48" ry="8" fill="#172518" fillOpacity=".24" />
            <ellipse cx="81" cy="139" rx="49" ry="8" fill="url(#coffee-cup-saucer)" />
            <ellipse cx="81" cy="137" rx="36" ry="4" fill="#F4EAD9" fillOpacity=".8" />
            <path d="M121 95h7c13 0 18 8 16 19-2 10-9 15-22 15" stroke="url(#coffee-cup-handle)" strokeWidth="10" strokeLinecap="round" />
            <path d="M124 101h3c8 0 11 5 10 12-1 6-5 9-12 9" stroke="#617247" strokeWidth="3" strokeLinecap="round" />
            <g className="coffee-steam coffee-steam-one">
              <path d="M59 73c-7-8 7-11 0-20s6-11 3-18" stroke="#F8DCA8" strokeWidth="4" strokeLinecap="round" />
            </g>
            <g className="coffee-steam coffee-steam-two">
              <path d="M80 68c-7-8 7-11 0-20s6-11 3-18" stroke="#F4EAD9" strokeWidth="4" strokeLinecap="round" />
            </g>
            <g className="coffee-steam coffee-steam-three">
              <path d="M101 73c-7-8 7-11 0-20s6-11 3-18" stroke="#C7D5A6" strokeWidth="4" strokeLinecap="round" />
            </g>
            <path d="M39 79h83l-8 48c-1 7-7 12-14 12H62c-7 0-13-5-14-12l-9-48Z" fill="url(#coffee-cup-body)" />
            <path d="M47 112c20 5 47 5 68 0l-2 12c-1 7-7 12-14 12H62c-7 0-13-5-14-12l-1-12Z" fill="#F5D89A" />
            <path d="M48 115c18 4 47 4 65 0" stroke="#FFF0C7" strokeWidth="2" strokeLinecap="round" />
            <ellipse cx="80.5" cy="80" rx="41.5" ry="10" fill="#F7D9A4" />
            <ellipse cx="80.5" cy="81" rx="34" ry="6.5" fill="url(#coffee-cup-latte)" />
            <path d="M80 82c-10-7-18 4-7 5 7 1 13-8 20-6 8 2 2 8-5 7" stroke="#F5D89A" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M56 93c3 3 4 7 4 11" stroke="#FFD6B2" strokeOpacity=".7" strokeWidth="2" strokeLinecap="round" />
            <path d="M99 124c-4-5-10-5-14 0 4 1 7 3 8 7 2-3 4-5 6-7Z" fill="#B95045" fillOpacity=".8" />
          </svg>
        </div>
      </section>

      <section id="customer-menu" className="mb-6 scroll-mt-4 rounded-[1.5rem] border border-[#E5E3B2] bg-white p-3 shadow-[0_8px_24px_rgba(44,43,35,.04)] sm:mb-8 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <span className="shrink-0 rounded-full bg-[#f3f4ed] px-3 py-1.5 text-xs font-semibold text-[#687650]">{filteredProducts.length} صنف</span>
        </div>
        <div className="relative">
          <svg viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#929084]" aria-hidden="true">
            <circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.7" />
            <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-transparent bg-[#FCF5ED] py-3 pe-11 ps-4 text-sm placeholder:text-[#705331] transition focus:border-[#E5E3B2] focus:bg-white focus:ring-2 focus:ring-[#91A560]/20"
            placeholder="بتدور على إيه؟"
            aria-label="ابحث في المنيو"
          />
          {search ? (
            <button type="button" onClick={() => setSearch('')} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-1.5 text-xs font-semibold text-[#705331] hover:bg-[#E5E3B2]" aria-label="مسح البحث">
              مسح
            </button>
          ) : null}
        </div>
        <nav aria-label="تصنيفات المنيو" className="category-scroll mt-3 flex gap-2 overflow-x-auto pb-1">
            {['all', ...((menu?.categories ?? []).map((category) => category.id))].map((categoryId) => (
              <button
                key={categoryId}
                type="button"
                onClick={() => setSelectedCategory(categoryId)}
                aria-pressed={selectedCategory === categoryId}
                className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold transition ${selectedCategory === categoryId ? 'bg-[#6B8136] text-white shadow-sm' : 'bg-[#FCF5ED] text-[#705331] hover:bg-[#ecebe3]'}`}
              >
                {categoryId === 'all' ? 'كل المنيو' : (menu?.categories.find((c) => c.id === categoryId)?.ar ?? categoryId)}
              </button>
            ))}
        </nav>
      </section>

      {orderStatus ? (
        <div role={orderStatus.type === 'error' ? 'alert' : 'status'} aria-live="polite" className={`fixed inset-x-4 top-[max(5.5rem,calc(env(safe-area-inset-top)+5rem))] z-[60] mx-auto flex max-w-lg items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm leading-6 shadow-lg sm:top-6 ${orderStatus.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : orderStatus.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-[#E5E3B2] bg-white text-[#232122]'}`}>
          {orderStatus.message}
          <button type="button" onClick={() => setOrderStatus(null)} aria-label="إغلاق الرسالة" className="shrink-0 rounded-full px-2 font-bold opacity-70 hover:bg-black/5">×</button>
        </div>
      ) : null}

      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="min-w-0 space-y-8">
          {(menu?.categories ?? []).map((category) => {
            if (selectedCategory !== 'all' && selectedCategory !== category.id) return null;
            const items = filteredProducts.filter((product) => product.categoryId === category.id);
            if (!items.length) return null;
            return (
              <section key={category.id} aria-labelledby={`category-${category.id}`}>
                <div className="mb-4 flex items-end justify-between px-1">
                  <div>
                    <h2 id={`category-${category.id}`} className="text-xl font-bold text-[#232122] sm:text-2xl">{category.ar}</h2>
                  </div>
                  <span className="rounded-full border border-[#e9e9df] bg-white px-3 py-1.5 text-xs font-semibold text-[#6f705f]">{items.length} صنف</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 xl:grid-cols-3">
                  {items.map((product, index) => (
                    <article key={product.id} className="group flex min-h-[196px] min-w-0 flex-col justify-between rounded-[1.1rem] border border-[#eae8e0] bg-white p-2.5 shadow-[0_3px_14px_rgba(44,43,35,.035)] transition duration-200 hover:-translate-y-1 hover:border-[#d9dfcc] hover:shadow-[0_16px_32px_rgba(44,43,35,.085)] sm:min-h-44 sm:rounded-[1.35rem] sm:p-4">
                      <div className="flex min-h-[112px] min-w-0 flex-col sm:min-h-[112px]">
                        <div className="mb-2 flex items-start justify-between gap-1.5 sm:mb-3 sm:gap-3">
                          <div className={`relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl sm:h-12 sm:w-12 sm:rounded-2xl ${index % 3 === 0 ? 'bg-[#edf1e5] text-[#587044]' : index % 3 === 1 ? 'bg-[#f4eee7] text-[#967354]' : 'bg-[#f2f0e6] text-[#89804d]'}`}>
                            <span className="absolute -bottom-3 -left-2 h-8 w-8 rounded-full bg-current opacity-[.07]" />
                            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true">
                              <path d="M5 8h13l-1 11H7L5 8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                              <path d="M18 10h1.2a2.8 2.8 0 1 1 0 5.6H17M8 5c0-1 1-1.2 1-2M12 5c0-1 1-1.2 1-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                            </svg>
                          </div>
                          <div className="flex min-w-0 flex-wrap justify-end gap-1">
                            {product.featured ? <span className="rounded-full bg-[#f4eee7] px-1.5 py-1 text-[8px] font-semibold leading-3 text-[#795b3e] sm:px-2.5 sm:py-1.5 sm:text-[10px]">صنف مميز</span> : null}
                            {product.bestSeller ? <span className="rounded-full bg-[#fbf4e4] px-1.5 py-1 text-[8px] font-semibold leading-3 text-[#93733b] sm:px-2.5 sm:py-1.5 sm:text-[10px]">الأكثر طلبًا</span> : null}
                          </div>
                        </div>
                        <h3 className="line-clamp-2 text-sm font-bold leading-5 text-[#232122] transition-colors group-hover:text-[#6B8136] sm:text-base">{product.ar}</h3>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#858378] sm:text-xs sm:leading-5">{product.descriptionAr}</p>
                      </div>
                      <div className="mt-3 flex flex-col items-stretch gap-2 border-t border-[#f0efe9] pt-2.5 sm:mt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:pt-3">
                        <p className="text-base font-bold text-[#6B8136] sm:text-lg">{getProductPrice(product)} <span className="text-[10px] font-medium text-[#705331] sm:text-xs">ج.م</span>{product.offerPrice !== undefined ? <span className="ms-1 text-[10px] font-medium text-[#99978d] line-through sm:text-xs">{product.price}</span> : null}</p>
                        <button
                          type="button"
                          onClick={() => addToCart(product)}
                          className="min-h-10 w-full rounded-full bg-[#edf1e7] px-2 py-2.5 text-[11px] font-bold text-[#6B8136] transition hover:bg-[#6B8136] hover:text-white sm:min-h-0 sm:w-auto sm:px-3.5 sm:text-xs"
                        >
                          <span className="sm:hidden">{product.groups.length ? 'خصص +' : 'أضف +'}</span>
                          <span className="hidden sm:inline">{product.groups.length ? 'خصص و أضف +' : 'أضف للسلة +'}</span>
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
          {filteredProducts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#dedcd2] bg-white px-5 py-12 text-center">
              <p className="font-semibold text-[#444136]">ملقيناش الصنف ده</p>
              <p className="mt-1 text-sm text-[#858378]">جرب كلمة تانية أو اختار تصنيف مختلف.</p>
            </div>
          ) : null}
        </div>

        <aside
          role={mobileCartOpen ? 'dialog' : undefined}
          aria-modal={mobileCartOpen ? true : undefined}
          aria-labelledby={mobileCartOpen ? 'customer-cart-title' : undefined}
          className={`${mobileCartOpen ? 'fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-[1.75rem] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]' : 'hidden'} border border-[#E5E3B2] bg-white shadow-[0_12px_36px_rgba(43,43,34,.12)] lg:sticky lg:top-5 lg:z-auto lg:block lg:max-h-none lg:overflow-visible lg:rounded-3xl lg:p-5`}
        >
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 id="customer-cart-title" className="text-xl font-bold text-[#232122]">طلبك</h2>
              <p className="mt-1 text-sm text-[#705331]">{cartItemCount} {cartItemCount === 1 ? 'صنف' : 'أصناف'} في السلة</p>
            </div>
            <button
              type="button"
              onClick={() => setMobileCartOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FCF5ED] text-xl text-[#232122] lg:hidden"
              aria-label="إغلاق السلة"
            >
              ×
            </button>
          </div>

          {cart.length === 0 ? (
            <div className="rounded-2xl bg-[#f8f7f2] px-5 py-8 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#e9eedf] text-2xl text-[#52713b]">＋</div>
              <p className="font-semibold text-[#353329]">لسه مفيش حاجه في السلة</p>
            </div>
          ) : (
            <div className="max-h-[32vh] space-y-3 overflow-y-auto pe-1 lg:max-h-[34vh]">
              {cart.map((item, index) => {
                const product = menu?.products.find((p) => p.id === item.productId);
                if (!product) return null;
                const optionText = item.customizations.map((customization) => {
                  const group = menu?.groups?.[customization.groupId];
                  const option = group?.options?.[customization.optionIndex];
                  return option ? `${group?.ar ?? ''}: ${option.ar}` : '';
                }).filter(Boolean).join('، ');
                const itemTotal = (getProductPrice(product) + item.customizations.reduce((sum, customization) =>
                  sum + (menu?.groups?.[customization.groupId]?.options?.[customization.optionIndex]?.price ?? 0), 0)) * item.quantity;
                return (
                  <div key={`${item.productId}-${index}`} className="rounded-2xl border border-[#efeee7] bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[#232122]">{product.ar}</p>
                        {optionText ? <p className="mt-1 text-xs leading-5 text-[#705331]">{optionText}</p> : null}
                        {item.notes ? <p className="mt-1 text-xs text-[#705331]">{item.notes}</p> : null}
                      </div>
                      <p className="shrink-0 text-sm font-bold text-[#6B8136]">{itemTotal.toFixed(2)} ج.م</p>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <button type="button" onClick={() => updateCartQuantity(item.productId, -1, item.customizations, item.notes)} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FCF5ED] text-lg" aria-label="تقليل الكمية">−</button>
                      <span className="min-w-4 text-center text-sm font-semibold">{item.quantity}</span>
                      <button type="button" onClick={() => updateCartQuantity(item.productId, 1, item.customizations, item.notes)} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FCF5ED] text-lg" aria-label="زيادة الكمية">+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-5 space-y-2 border-t border-dashed border-[#e4e2d8] pt-4 text-sm">
            <div className="flex justify-between text-[#705331]"><span>المجموع</span><span>{subtotal.toFixed(2)} ج.م</span></div>
            {pricing.serviceEnabled ? <div className="flex justify-between text-[#705331]"><span>الخدمة ({pricing.serviceRate}%)</span><span>{serviceFee.toFixed(2)} ج.م</span></div> : null}
            {pricing.taxEnabled ? <div className="flex justify-between text-[#705331]"><span>الضريبة ({pricing.taxRate}%)</span><span>{tax.toFixed(2)} ج.م</span></div> : null}
            <div className="flex justify-between border-t border-[#efeee7] pt-3 text-base font-bold text-[#232122]"><span>الإجمالي</span><span>{total.toFixed(2)} ج.م</span></div>
          </div>

          <div className="mt-5 space-y-3">
            <div className="grid grid-cols-3 rounded-xl bg-[#FCF5ED] p-1">
              <button type="button" onClick={() => setOrderType('DINE_IN')} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${orderType === 'DINE_IN' ? 'bg-white text-[#6B8136] shadow-sm' : 'text-[#705331]'}`}>داخل الكافيه</button>
              <button type="button" onClick={() => setOrderType('TAKEAWAY')} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${orderType === 'TAKEAWAY' ? 'bg-white text-[#6B8136] shadow-sm' : 'text-[#705331]'}`}>تيك أواي</button>
              <button type="button" onClick={() => setOrderType('DELIVERY')} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${orderType === 'DELIVERY' ? 'bg-white text-[#6B8136] shadow-sm' : 'text-[#705331]'}`}>توصيل</button>
            </div>
            {orderType === 'DINE_IN' ? (
              <label className="block text-sm font-medium text-[#232122]">
                رقم الترابيزة
                <input value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} placeholder="مثال: 3" className="mt-1.5 w-full" />
              </label>
            ) : orderType === 'TAKEAWAY' ? (
              <label className="block text-sm font-medium text-[#232122]">
                طريقة الاستلام
                <p className="mt-1.5 rounded-xl border border-[#E5E3B2] bg-[#FCF5ED] px-3 py-2.5 text-sm text-[#705331]">استلام من الكافيه — بدون طاولة أو عنوان توصيل</p>
              </label>
            ) : (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-[#232122]">
                  عنوان التوصيل <span className="text-rose-600">*</span>
                  <input required value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="الشارع والمنطقة" className="mt-1.5 w-full" />
                </label>
                <label className="block text-sm font-medium text-[#232122]">
                  تفاصيل إضافية للعنوان
                  <input value={additionalAddressDetails} onChange={(e) => setAdditionalAddressDetails(e.target.value)} placeholder="رقم المبنى، الدور، الشقة" className="mt-1.5 w-full" />
                </label>
                <label className="block text-sm font-medium text-[#232122]">
                  تعليمات التوصيل
                  <textarea value={deliveryInstructions} onChange={(e) => setDeliveryInstructions(e.target.value)} placeholder="أي تعليمات تساعد في الوصول" className="mt-1.5 min-h-20 w-full resize-y" />
                </label>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <input required={orderType === 'DELIVERY'} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder={orderType === 'DELIVERY' ? 'الاسم *' : 'الاسم'} aria-label="الاسم" />
              <input required={orderType === 'DELIVERY'} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder={orderType === 'DELIVERY' ? 'رقم الهاتف *' : 'رقم الهاتف'} aria-label="رقم الهاتف" inputMode="tel" />
            </div>
            <button type="button" onClick={submitOrder} disabled={submitting || cart.length === 0} className="w-full rounded-xl bg-[#6B8136] px-4 py-3.5 font-semibold text-white shadow-[0_8px_20px_rgba(67,93,50,.18)] transition hover:bg-[#5d702f] disabled:cursor-not-allowed disabled:opacity-45">
              {submitting ? 'جارٍ إرسال الطلب…' : 'تأكيد الطلب'}
            </button>
          </div>
        </aside>
      </div>

      <section aria-labelledby="contact-title" className="mt-8 rounded-[1.5rem] border border-[#E5E3B2] bg-white p-5 shadow-[0_8px_24px_rgba(44,43,35,.045)] sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6">
        <div>
          <p className="text-xs font-semibold tracking-[.14em] text-[#705331]">MATCHA CAFÉ</p>
          <h2 id="contact-title" className="mt-1 text-xl font-bold text-[#232122]">محتاج مساعدة؟ تواصل معنا</h2>
          <p className="mt-1 text-sm text-[#705331]">نحن سعداء بخدمتك — اطلب الآن أو تواصل معنا مباشرة.</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 sm:mt-0">
          <a href="tel:01036618656" dir="ltr" className="inline-flex min-h-11 items-center rounded-xl border border-[#E5E3B2] px-4 py-2.5 text-sm font-semibold text-[#6B8136] transition hover:bg-[#FCF5ED]">01036618656</a>
          <a href="https://maps.app.goo.gl/jYKaTj3xof2xcSoo6" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-[#6B8136] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5d702f]">موقع الكافيه على الخريطة</a>
        </div>
      </section>

      {mobileCartOpen ? <button type="button" className="fixed inset-0 z-40 bg-[#15170f]/50 backdrop-blur-[2px] lg:hidden" aria-label="إغلاق السلة" onClick={() => setMobileCartOpen(false)} /> : null}
      <button
        type="button"
        onClick={() => setMobileCartOpen(true)}
        className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex items-center justify-between rounded-2xl bg-[#354a2c] px-5 py-3.5 text-white shadow-[0_12px_32px_rgba(31,47,26,.28)] lg:hidden"
        aria-label={`عرض السلة، ${cartItemCount} أصناف`}
      >
        <span className="flex items-center gap-2 font-semibold">
          <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-white/15 px-2 text-xs">{cartItemCount}</span>
          عرض السلة
        </span>
        <span className="font-bold">{total.toFixed(2)} ج.م <span className="me-1 text-white/70">←</span></span>
      </button>

      {customizing ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#15170f]/50 p-0 backdrop-blur-[2px] sm:p-4 md:items-center">
          <div role="dialog" aria-modal="true" aria-labelledby="customizing-title" className="my-auto max-h-[90dvh] w-full max-w-xl overflow-y-auto overscroll-contain rounded-t-[1.75rem] bg-white p-5 shadow-2xl sm:rounded-[1.75rem] sm:p-7">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-[#705331]">تخصيص طلبك</p>
                <h3 id="customizing-title" className="mt-1 text-2xl font-bold text-[#6b4a2e]">{customizing.ar}</h3>
              </div>
              <button type="button" onClick={() => setCustomizing(null)} aria-label="إغلاق نافذة التخصيص" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FCF5ED] text-xl">×</button>
            </div>
            <div className="space-y-4">
              {customizing.groups.map((groupId) => {
                const group = menu?.groups?.[groupId];
                if (!group) return null;
                return (
                  <fieldset key={groupId} className="rounded-2xl border border-[#efeee7] p-3.5">
                    <legend className="px-1 text-sm font-semibold text-[#403d33]">{group.ar}{' '}<span className="ms-2 text-xs font-normal text-[#858378]">{group.required ? 'مطلوب' : 'اختياري'}{group.multi ? ' · اختيارات متعددة' : ''}</span></legend>
                    <div className="flex flex-wrap gap-2">
                      {group.options.map((option, index) => (
                        <button
                          key={`${groupId}-${index}`}
                          type="button"
                          aria-pressed={(selectedOptions[groupId] ?? []).includes(index)}
                          onClick={() => setSelectedOptions((prev) => {
                            const current = prev[groupId] ?? [];
                            const selected = current.includes(index);
                            if (group.multi) {
                              return { ...prev, [groupId]: selected ? current.filter((value) => value !== index) : [...current, index] };
                            }
                            return { ...prev, [groupId]: [index] };
                          })}
                          className={`min-h-11 rounded-xl border px-3 py-2 text-sm transition ${(selectedOptions[groupId] ?? []).includes(index) ? 'border-[#6B8136] bg-[#E5E3B2] text-[#232122]' : 'border-[#E5E3B2] bg-white hover:bg-[#FCF5ED]'}`}
                        >
                          {option.ar} {option.price ? `(+${option.price})` : ''}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                );
              })}

              <div>
                <label className="mb-2 block text-sm font-medium text-[#6c6d5c]">ملاحظات للمطبخ <span className="font-normal text-[#99978d]">(اختياري)</span></label>
                <textarea value={productNotes} onChange={(e) => setProductNotes(e.target.value)} maxLength={250} rows={2} placeholder="مثلًا: بدون سكر" className="w-full" />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#efeee7] pt-4">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="تقليل الكمية" className="h-10 w-10 rounded-full bg-[#FCF5ED] text-lg">−</button>
                  <span aria-live="polite" className="min-w-6 text-center font-semibold tabular-nums">{quantity}</span>
                  <button type="button" onClick={() => setQuantity((q) => q + 1)} aria-label="زيادة الكمية" className="h-10 w-10 rounded-full bg-[#FCF5ED] text-lg">+</button>
                </div>
                <button type="button" onClick={finalizeAddToCart} className="min-h-11 flex-1 rounded-xl bg-[#6B8136] px-5 py-3 font-semibold text-white transition hover:bg-[#5d702f] sm:flex-none">إضافة {quantity} · {customizationTotal.toFixed(2)} ج.م</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
