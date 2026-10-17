'use client';

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PRICING_SETTINGS, type PricingSettings } from '@/lib/pricing';
import MenuManagement from './menu-management';
import InventoryManagement from './inventory-management';

type OrderRow = {
  id: string;
  orderNumber: string;
  type: 'DINE_IN' | 'TAKEAWAY';
  status: 'NEW' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';
  tableNumber?: string;
  subtotal: number;
  serviceFee: number;
  tax: number;
  total: number;
  items: Array<{
    nameAr: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
    selectedOptions: Array<{ groupId: string; optionAr: string; price: number }>;
  }>;
  customerName?: string;
  customerPhone?: string;
  createdAt: string;
};

type OrderFilter = 'ALL' | OrderRow['status'];
type DashboardSection = 'orders' | 'menu' | 'inventory' | 'settings';

const statusLabels: Record<OrderRow['status'], string> = {
  NEW: 'طلب جديد',
  PREPARING: 'قيد التجهيز',
  READY: 'جاهز للاستلام',
  COMPLETED: 'تم التسليم',
  CANCELLED: 'ملغي',
};

const statusStyles: Record<OrderRow['status'], string> = {
  NEW: 'border-amber-200 bg-amber-50 text-amber-800',
  PREPARING: 'border-sky-200 bg-sky-50 text-sky-800',
  READY: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  COMPLETED: 'border-stone-200 bg-stone-100 text-stone-700',
  CANCELLED: 'border-rose-200 bg-rose-50 text-rose-700',
};

export default function CashierDashboard() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [auth, setAuth] = useState<{ email: string; password: string }>({ email: '', password: '' });
  const [loggedIn, setLoggedIn] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('ALL');
  const [pricingSettings, setPricingSettings] = useState<PricingSettings>({ ...DEFAULT_PRICING_SETTINGS });
  const [savedPricingSettings, setSavedPricingSettings] = useState<PricingSettings>({ ...DEFAULT_PRICING_SETTINGS });
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingSaving, setPricingSaving] = useState(false);
  const [pricingSaved, setPricingSaved] = useState(false);
  const [dashboardSection, setDashboardSection] = useState<DashboardSection>('orders');

  const fetchOrders = useCallback(async () => {
    try {
      const response = await fetch('/api/dashboard/orders');
      const data = await response.json() as { orders?: OrderRow[]; error?: string; demoMode?: boolean };
      if (response.ok) {
        setOrders(data.orders || []);
        setLoggedIn(true);
        setDemoMode(Boolean(data.demoMode));
        setError(null);
      } else if (response.status === 401) {
        setLoggedIn(false);
        setError(null);
      } else {
        setError(data.error || 'تعذر تحميل الطلبات');
      }
    } catch {
      setError('تعذر الاتصال بالخادم أثناء تحميل الطلبات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetch('/api/auth/session')
      .then(async (response) => {
        if (!response.ok) throw new Error('تعذر التحقق من جلسة الدخول');
        return await response.json() as { authenticated: boolean };
      })
      .then((session) => {
        if (!active) return;
        if (session.authenticated) {
          setLoggedIn(true);
          void fetchOrders();
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError('تعذر التحقق من جلسة الدخول. حدّث الصفحة أو سجّل الدخول مرة أخرى.');
          setLoading(false);
        }
      })
      .finally(() => {
        if (active) setSessionChecking(false);
      });
    return () => {
      active = false;
    };
  }, [fetchOrders]);

  useEffect(() => {
    if (!loggedIn) return;
    const interval = window.setInterval(() => void fetchOrders(), 4000);
    return () => window.clearInterval(interval);
  }, [fetchOrders, loggedIn]);

  useEffect(() => {
    if (!loggedIn) return;
    let active = true;
    const timeout = window.setTimeout(() => {
      void fetch('/api/dashboard/settings/pricing')
        .then(async (response) => {
          const data = await response.json() as { settings?: PricingSettings; error?: string };
          if (!response.ok || !data.settings) throw new Error(data.error || 'تعذر تحميل إعدادات الرسوم');
          if (active) {
            setPricingSettings(data.settings);
            setSavedPricingSettings(data.settings);
          }
        })
        .catch((loadError: unknown) => {
          if (active) setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل إعدادات الرسوم');
        })
        .finally(() => {
          if (active) setPricingLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [loggedIn]);

  const login = async (credentials = auth) => {
    if (loginSubmitting) return;
    setLoginSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        setError(data.error || 'تعذر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور.');
        return;
      }
      setLoggedIn(true);
      await fetchOrders();
    } catch {
      setError('تعذر الاتصال بالخادم أثناء تسجيل الدخول. تحقق من اتصال الإنترنت وحاول مرة أخرى.');
    } finally {
      setLoginSubmitting(false);
    }
  };

  const savePricingSettings = async () => {
    if (pricingSaving) return;
    setPricingSaving(true);
    setPricingSaved(false);
    setError(null);
    try {
      const response = await fetch('/api/dashboard/settings/pricing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pricingSettings),
      });
      const data = await response.json() as { settings?: PricingSettings; error?: string };
      if (!response.ok || !data.settings) {
        setError(data.error || 'تعذر حفظ إعدادات الرسوم');
        return;
      }
      setPricingSettings(data.settings);
      setSavedPricingSettings(data.settings);
      setPricingSaved(true);
    } catch {
      setError('تعذر الاتصال بالخادم أثناء حفظ إعدادات الرسوم');
    } finally {
      setPricingSaving(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    if (status === 'CANCELLED' && !window.confirm('تأكيد إلغاء هذا الطلب؟ سيظل محفوظًا في سجل الطلبات.')) return;
    setBusyOrderId(id);
    setError(null);
    try {
      const response = await fetch(`/api/dashboard/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await response.json() as { error?: string };
      if (response.ok) {
        await fetchOrders();
      } else {
        setError(data.error || 'تعذر تحديث حالة الطلب');
      }
    } catch {
      setError('تعذر الاتصال بالخادم أثناء تحديث حالة الطلب');
    } finally {
      setBusyOrderId(null);
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      setError('تعذر الاتصال بالخادم أثناء تسجيل الخروج');
    } finally {
      setLoggedIn(false);
      setOrders([]);
    }
  };

  const orderCounts = {
    NEW: orders.filter((order) => order.status === 'NEW').length,
    PREPARING: orders.filter((order) => order.status === 'PREPARING').length,
    READY: orders.filter((order) => order.status === 'READY').length,
    COMPLETED: orders.filter((order) => order.status === 'COMPLETED').length,
  };
  const visibleOrders = orderFilter === 'ALL' ? orders : orders.filter((order) => order.status === orderFilter);
  const pricingHasChanges = JSON.stringify(pricingSettings) !== JSON.stringify(savedPricingSettings);

  if (!loggedIn) {
    if (sessionChecking) {
      return (
        <main className="flex min-h-screen w-full min-w-0 items-center justify-center px-4" aria-busy="true">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#435d32]/25 border-t-[#435d32]" aria-label="جارٍ التحقق من جلسة الدخول" />
        </main>
      );
    }

    return (
      <main className="relative flex min-h-screen w-full min-w-0 items-center justify-center overflow-hidden px-4 py-10 sm:p-6">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full border border-[#7b8d5b]/15 motion-float" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-[#dfe6d0]/55 blur-3xl" />
        <div className="login-cup relative isolate w-full max-w-md px-0 pb-7 sm:px-5">
          <div aria-hidden="true" className="login-cup-handle" />
          <div aria-hidden="true" className="login-cup-body" />
          <div aria-hidden="true" className="login-cup-rim" />
          <div className="relative z-10 px-6 pb-8 pt-9 sm:px-8 sm:pb-10">
            <div className="mb-7 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#edf2e5] text-[#526b3a]">
                <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9" aria-hidden="true">
                  <ellipse cx="24" cy="39" rx="16" ry="3" fill="#849566" fillOpacity=".28" />
                  <path d="M34 19h3.5a5 5 0 0 1 0 10H33" stroke="#C58A55" strokeWidth="3.5" strokeLinecap="round" />
                  <path d="M15 18h19l-2 16a4 4 0 0 1-4 3h-7a4 4 0 0 1-4-3l-2-16Z" fill="#D9825D" />
                  <path d="M17 29c5 2 11 2 16 0l-.6 5a4 4 0 0 1-4 3h-7a4 4 0 0 1-4-3l-.4-5Z" fill="#F2C982" />
                  <ellipse cx="24.5" cy="18" rx="9.5" ry="3.2" fill="#F6DDA9" />
                  <ellipse cx="24.5" cy="18" rx="7.3" ry="2" fill="#714735" />
                  <path d="M23 18c-2-2-4 1-1 1 2 0 3-2 5-1 2 1 0 2-2 2" stroke="#F6DDA9" strokeWidth="1" strokeLinecap="round" />
                  <g className="coffee-steam coffee-steam-one">
                    <path d="M20 12c-2-2 2-3 0-5" stroke="#91A374" strokeWidth="1.8" strokeLinecap="round" />
                  </g>
                  <g className="coffee-steam coffee-steam-two">
                    <path d="M25 11c-2-2 2-3 0-5" stroke="#91A374" strokeWidth="1.8" strokeLinecap="round" />
                  </g>
                  <g className="coffee-steam coffee-steam-three">
                    <path d="M30 12c-2-2 2-3 0-5" stroke="#91A374" strokeWidth="1.8" strokeLinecap="round" />
                  </g>
                </svg>
              </div>
              <div>
                <p className="text-[11px] font-semibold tracking-[.16em] text-[#8d8c7e]">MATCHA CAFÉ</p>
              </div>
            </div>
            <h1 className="text-2xl font-bold leading-relaxed text-[#302b23] sm:text-3xl">دخول الكاشير</h1>

            <form
              className="mt-7 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void login();
              }}
            >
              <label className="block text-sm font-semibold text-[#514d43]">
                البريد الإلكتروني
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={auth.email}
                  onChange={(e) => setAuth({ ...auth, email: e.target.value })}
                  placeholder="name@example.com"
                  className="mt-2 w-full rounded-xl border-[#e6e5dc] bg-[#fbfbf8] py-3 placeholder:text-[#aaa99f] focus:bg-white"
                />
              </label>
              <label className="block text-sm font-semibold text-[#514d43]">
                كلمة المرور
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={auth.password}
                  onChange={(e) => setAuth({ ...auth, password: e.target.value })}
                  placeholder="أدخل كلمة المرور"
                  className="mt-2 w-full rounded-xl border-[#e6e5dc] bg-[#fbfbf8] py-3 placeholder:text-[#aaa99f] focus:bg-white"
                />
              </label>
              {error ? <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-sm leading-6 text-rose-700 motion-enter">{error}</p> : null}
              <button
                type="submit"
                disabled={loginSubmitting}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-[#435d32] px-4 py-3.5 font-bold text-white shadow-[0_8px_20px_rgba(67,93,50,.2)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#344b27] hover:shadow-[0_12px_24px_rgba(67,93,50,.25)] disabled:cursor-wait disabled:opacity-70"
              >
                {loginSubmitting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> : null}
                {loginSubmitting ? 'جارٍ تسجيل الدخول…' : 'تسجيل الدخول'}
                {!loginSubmitting ? <span aria-hidden="true" className="transition-transform group-hover:-translate-x-1">←</span> : null}
              </button>
            </form>
          </div>
          <div aria-hidden="true" className="login-cup-saucer" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full min-w-0 px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4 rounded-[1.5rem] border border-[#e8e6dc] bg-white/90 p-4 shadow-[0_8px_24px_rgba(44,43,35,.045)] backdrop-blur motion-enter sm:p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#edf2e5] text-[#526b3a]">
              <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
                <path d="M4 19h16M6 16V9m4 7V5m4 11v-4m4 4V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-[.14em] text-[#8d8c7e]">MATCHA CAFÉ</p>
              <h1 className="mt-0.5 text-xl font-bold text-[#302b23] sm:text-2xl">لوحة الكاشير</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={logout} className="rounded-xl border border-[#e7e5dc] bg-white px-4 py-2.5 text-sm font-semibold text-[#625f54] transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700">
              تسجيل الخروج
            </button>
          </div>
        </header>

        <nav aria-label="أقسام لوحة التحكم" className="sticky top-2 z-30 mb-6 flex gap-2 overflow-x-auto rounded-2xl border border-[#e8e6dc] bg-white/90 p-2 shadow-[0_4px_16px_rgba(44,43,35,.06)] backdrop-blur">
          {([
            ['orders', 'الطلبات'],
            ['menu', 'إدارة المنيو'],
            ['inventory', 'المخزون والتقارير'],
            ['settings', 'الإعدادات والرسوم'],
          ] as Array<[DashboardSection, string]>).map(([section, title]) => (
            <button key={section} type="button" aria-pressed={dashboardSection === section} onClick={() => setDashboardSection(section)} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition sm:px-5 ${dashboardSection === section ? 'bg-[#435d32] text-white shadow-sm' : 'text-[#676458] hover:bg-[#f5f4ef]'}`}>
              {title}
            </button>
          ))}
        </nav>

        {demoMode ? (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 motion-enter">
            <span aria-hidden="true">ⓘ</span>
            وضع تجريبي — الطلبات مش بتتحفظ بشكل دائم
          </div>
        ) : null}
        {error ? <p role="alert" className="mb-5 rounded-xl border border-rose-100 bg-rose-50 p-3.5 text-sm text-rose-700 motion-enter">{error}</p> : null}

        {dashboardSection === 'orders' ? <>
        <section aria-label="ملخص الطلبات" className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {[
            { label: 'طلبات جديدة', count: orderCounts.NEW, tone: 'bg-amber-50 text-amber-800', marker: 'bg-amber-400' },
            { label: 'قيد التجهيز', count: orderCounts.PREPARING, tone: 'bg-sky-50 text-sky-800', marker: 'bg-sky-400' },
            { label: 'جاهزة للاستلام', count: orderCounts.READY, tone: 'bg-emerald-50 text-emerald-800', marker: 'bg-emerald-500' },
            { label: 'إجمالي الطلبات', count: orders.length, tone: 'bg-[#f2f3ec] text-[#536342]', marker: 'bg-[#819661]' },
          ].map((stat, index) => (
            <div key={stat.label} style={{ animationDelay: `${index * 70}ms` }} className="rounded-2xl border border-[#e8e6dc] bg-white p-4 shadow-[0_5px_18px_rgba(44,43,35,.035)] motion-enter motion-fill-both sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[#77766c] sm:text-sm">{stat.label}</p>
                <span className={`h-2 w-2 rounded-full ${stat.marker}`} />
              </div>
              <p className={`mt-3 inline-flex min-w-11 items-center justify-center rounded-xl px-3 py-1.5 text-2xl font-bold tabular-nums ${stat.tone}`}>{stat.count}</p>
            </div>
          ))}
        </section>

        </> : null}

        {dashboardSection === 'menu' ? <MenuManagement /> : null}
        {dashboardSection === 'inventory' ? <InventoryManagement /> : null}

        {dashboardSection === 'settings' ? <section aria-labelledby="pricing-heading" className="mb-7 rounded-[1.5rem] border border-[#e8e6dc] bg-white/85 p-4 shadow-[0_8px_24px_rgba(44,43,35,.04)] sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="pricing-heading" className="text-xl font-bold text-[#302b23]">إعدادات الخدمة والضريبة</h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#77766c]">فعّل الرسوم اللي بتطبقها بس. التغييرات هتتحسب على الطلبات الجديدة.</p>
            </div>
            <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${pricingSettings.serviceEnabled || pricingSettings.taxEnabled ? 'bg-[#f4f6ef] text-[#66764e]' : 'bg-[#f4f3ef] text-[#77766c]'}`}>
              {pricingSettings.serviceEnabled || pricingSettings.taxEnabled ? 'رسوم مفعّلة' : 'بدون رسوم إضافية'}
            </span>
          </div>

          {pricingLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="h-28 animate-pulse rounded-2xl bg-[#f2f2eb] motion-reduce:animate-none" />
              <div className="h-28 animate-pulse rounded-2xl bg-[#f2f2eb] motion-reduce:animate-none" />
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {([
                  { key: 'service' as const, enabled: pricingSettings.serviceEnabled, rate: pricingSettings.serviceRate, title: 'رسوم الخدمة', description: 'تُحسب على المجموع الفرعي', icon: '＋' },
                  { key: 'tax' as const, enabled: pricingSettings.taxEnabled, rate: pricingSettings.taxRate, title: 'ضريبة القيمة المضافة', description: 'تُحسب بعد رسوم الخدمة إن وُجدت', icon: '%' },
                ]).map((setting) => {
                  const enabledKey = setting.key === 'service' ? 'serviceEnabled' : 'taxEnabled';
                  const rateKey = setting.key === 'service' ? 'serviceRate' : 'taxRate';
                  return (
                    <div key={setting.key} className="rounded-2xl border border-[#ecebe4] bg-[#fcfcf9] p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf2e5] text-lg font-bold text-[#526b3a]">{setting.icon}</span>
                          <div>
                            <h3 className="font-bold text-[#403d33]">{setting.title}</h3>
                            <p className="mt-0.5 text-xs text-[#858378]">{setting.description}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={setting.enabled}
                          aria-label={`تفعيل ${setting.title}`}
                          onClick={() => {
                            setPricingSettings((current) => ({ ...current, [enabledKey]: !current[enabledKey] }));
                            setPricingSaved(false);
                          }}
                          className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors ${setting.enabled ? 'bg-[#617a45]' : 'bg-[#d8d8cf]'}`}
                        >
                          <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${setting.enabled ? 'right-1' : 'right-6'}`} />
                        </button>
                      </div>
                      <label className="mt-4 flex items-center justify-between gap-3 border-t border-[#eeede7] pt-3 text-sm font-medium text-[#625f54]">
                        النسبة
                        <span className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.25"
                            inputMode="decimal"
                            aria-label={`نسبة ${setting.title}`}
                            value={setting.rate}
                            onChange={(event) => {
                              const rate = event.target.value === '' ? 0 : Number(event.target.value);
                              setPricingSettings((current) => ({ ...current, [rateKey]: rate }));
                              setPricingSaved(false);
                            }}
                            className="w-24 rounded-lg border-[#e6e5dc] bg-white px-3 py-2 text-center tabular-nums"
                          />
                          <span className="text-[#858378]">٪</span>
                        </span>
                      </label>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p role="status" className="text-sm text-[#66764e]">
                  {pricingSaved ? 'تم حفظ الإعدادات وتطبيقها على الطلبات الجديدة.' : pricingHasChanges ? 'لديك تغييرات غير محفوظة.' : 'إعدادات الرسوم الحالية محفوظة.'}
                </p>
                <button
                  type="button"
                  onClick={() => void savePricingSettings()}
                  disabled={!pricingHasChanges || pricingSaving || pricingLoading}
                  className="rounded-xl bg-[#435d32] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(67,93,50,.15)] transition hover:bg-[#344b27] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {pricingSaving ? 'جارٍ حفظ الإعدادات…' : 'حفظ إعدادات الرسوم'}
                </button>
              </div>
            </>
          )}
        </section> : null}

        {dashboardSection === 'orders' ? <section aria-labelledby="orders-heading" className="rounded-[1.5rem] border border-[#e8e6dc] bg-white/75 p-4 shadow-[0_10px_30px_rgba(44,43,35,.045)] sm:p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="orders-heading" className="text-xl font-bold text-[#302b23]">الطلبات</h2>
            </div>
            <span className="rounded-full bg-[#f3f4ed] px-3 py-1.5 text-xs font-semibold text-[#687650]">{visibleOrders.length} طلب</span>
          </div>

          <nav aria-label="تصفية الطلبات" className="mb-5 flex gap-2 overflow-x-auto pb-1">
            {([
              ['ALL', 'الكل'],
              ['NEW', 'جديدة'],
              ['PREPARING', 'قيد التجهيز'],
              ['READY', 'جاهزة'],
              ['COMPLETED', 'مكتملة'],
              ['CANCELLED', 'ملغية'],
            ] as Array<[OrderFilter, string]>).map(([filter, label]) => (
              <button
                key={filter}
                type="button"
                aria-pressed={orderFilter === filter}
                onClick={() => setOrderFilter(filter)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${orderFilter === filter ? 'bg-[#435d32] text-white shadow-sm' : 'bg-[#f5f4ef] text-[#676458] hover:bg-[#ecebe3]'}`}
              >
                {label}
              </button>
            ))}
          </nav>

          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((item) => <div key={item} className="h-56 animate-pulse rounded-2xl bg-[#f2f2eb] motion-reduce:animate-none" />)}
            </div>
          ) : visibleOrders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#e1e2d8] bg-[#fafaf7] px-5 py-12 text-center motion-enter">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf2e5] text-2xl text-[#66804a]">✓</div>
              <p className="font-semibold text-[#444136]">{orders.length === 0 ? 'لسه مفيش طلبات' : 'مفيش طلبات في الحالة دي'}</p>
              <p className="mt-1 text-sm text-[#858378]">{orders.length === 0 ? 'الطلبات الجديدة هتظهر هنا تلقائيًا.' : 'اختار تصنيف تاني لمشاهدة الطلبات.'}</p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto rounded-xl border border-[#e9e7df] sm:block">
                <table className="w-full min-w-[970px] border-collapse text-right text-sm">
                  <thead className="bg-[#f6f7f2] text-xs text-[#6c6d5c]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">الطلب والوقت</th>
                      <th className="px-4 py-3 font-semibold">العميل / المكان</th>
                      <th className="px-4 py-3 font-semibold">تفاصيل الطلب</th>
                      <th className="px-4 py-3 font-semibold">الإجمالي</th>
                      <th className="px-4 py-3 font-semibold">الحالة</th>
                      <th className="px-4 py-3 font-semibold">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eeede7]">
                    {visibleOrders.map((order) => (
                      <tr key={order.id} className="align-top transition hover:bg-[#fbfbf8]">
                        <td className="whitespace-nowrap px-4 py-4">
                          <p className="font-bold text-[#302b23]">#{order.orderNumber}</p>
                          <time className="mt-1 block text-xs text-[#89877c]" dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</time>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-semibold text-[#403d33]">{order.type === 'DINE_IN' ? `طاولة ${order.tableNumber ?? '-'}` : 'تيك أواي'}</p>
                          {order.customerName ? <p className="mt-1 text-xs text-[#77766c]">{order.customerName}</p> : null}
                          {order.customerPhone ? <a href={`tel:${order.customerPhone}`} dir="ltr" className="mt-1 inline-block text-xs text-[#526b3a] hover:underline">{order.customerPhone}</a> : null}
                        </td>
                        <td className="max-w-xs px-4 py-4">
                          <OrderItems order={order} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-4">
                          <p className="font-bold text-[#435d32]">{order.total.toFixed(2)} ج.م</p>
                          <p className="mt-1 text-[11px] text-[#89877c]">المجموع {order.subtotal.toFixed(2)}{order.serviceFee ? ` · خدمة ${order.serviceFee.toFixed(2)}` : ''}{order.tax ? ` · ضريبة ${order.tax.toFixed(2)}` : ''}</p>
                        </td>
                        <td className="px-4 py-4"><span className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[order.status]}`}>{statusLabels[order.status]}</span></td>
                        <td className="px-4 py-4"><OrderActions order={order} busy={busyOrderId === order.id} onStatus={(status) => void updateStatus(order.id, status)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 sm:hidden">
                {visibleOrders.map((order) => (
                  <article key={order.id} className="rounded-2xl border border-[#e9e7df] bg-white p-4 shadow-[0_3px_14px_rgba(44,43,35,.035)]">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-[#302b23]">#{order.orderNumber}</h3>
                        <time className="mt-1 block text-xs text-[#89877c]" dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</time>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusStyles[order.status]}`}>{statusLabels[order.status]}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#6c6d5c]">
                      <span className="rounded-lg bg-[#f5f4ef] px-2.5 py-1.5">{order.type === 'DINE_IN' ? `طاولة ${order.tableNumber ?? '-'}` : 'تيك أواي'}</span>
                      {order.customerName ? <span className="rounded-lg bg-[#f5f4ef] px-2.5 py-1.5">{order.customerName}</span> : null}
                      {order.customerPhone ? <a dir="ltr" href={`tel:${order.customerPhone}`} className="rounded-lg bg-[#f5f4ef] px-2.5 py-1.5 text-[#526b3a]">{order.customerPhone}</a> : null}
                    </div>
                    <div className="my-3 border-y border-dashed border-[#e8e6dc] py-3"><OrderItems order={order} /></div>
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs text-[#77766c]">إجمالي الطلب</span>
                      <span className="font-bold text-[#435d32]">{order.total.toFixed(2)} ج.م</span>
                    </div>
                    <OrderActions order={order} busy={busyOrderId === order.id} onStatus={(status) => void updateStatus(order.id, status)} />
                  </article>
                ))}
              </div>
            </>
          )}
        </section> : null}
      </div>
    </main>
  );
}

function OrderItems({ order }: { order: OrderRow }) {
  return (
    <details>
      <summary className="cursor-pointer text-xs font-semibold text-[#526b3a]">{order.items.length} أصناف · اضغط للتفاصيل</summary>
      <div className="mt-2 space-y-2">
        {order.items.map((item, index) => (
          <div key={`${order.id}-${index}`} className="rounded-lg bg-[#f8f8f4] px-3 py-2">
            <p className="flex items-start justify-between gap-2 text-xs font-semibold text-[#403d33]">
              <span>{item.nameAr}</span><span className="shrink-0">× {item.quantity}</span>
            </p>
            {item.selectedOptions.length ? <p className="mt-1 text-[11px] leading-5 text-[#77766c]">{item.selectedOptions.map((option) => `${option.optionAr}${option.price ? ` (+${option.price} ج.م)` : ''}`).join('، ')}</p> : null}
            {item.notes ? <p className="mt-1 border-r-2 border-[#d8dfcc] pe-2 text-[11px] text-[#6c6d5c]">{item.notes}</p> : null}
          </div>
        ))}
      </div>
    </details>
  );
}

function OrderActions({ order, busy, onStatus }: {
  order: OrderRow;
  busy: boolean;
  onStatus: (status: string) => void;
}) {
  const nextAction: Partial<Record<OrderRow['status'], { status: string; label: string; className: string }>> = {
    NEW: { status: 'PREPARING', label: 'بدء التجهيز', className: 'bg-[#435d32] text-white hover:bg-[#344b27]' },
    PREPARING: { status: 'READY', label: 'تحديد كجاهز', className: 'bg-[#eaf2f6] text-sky-800 hover:bg-[#dcebf2]' },
    READY: { status: 'COMPLETED', label: 'تأكيد التسليم', className: 'bg-[#435d32] text-white hover:bg-[#344b27]' },
  };
  const action = nextAction[order.status];
  return (
    <div className="flex flex-wrap gap-2">
      {action ? <button disabled={busy} onClick={() => onStatus(action.status)} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-50 ${action.className}`}>{busy ? 'جارٍ التحديث…' : action.label}</button> : null}
      {order.status !== 'COMPLETED' && order.status !== 'CANCELLED' ? <button disabled={busy} onClick={() => onStatus('CANCELLED')} className="rounded-lg border border-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50">إلغاء</button> : null}
    </div>
  );
}
