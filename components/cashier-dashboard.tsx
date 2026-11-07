'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import LogoSplash from './logo-splash';
import { DEFAULT_PRICING_SETTINGS, type PricingSettings } from '@/lib/pricing';
import type { OrderRecord } from '@/lib/types';
import type { ShiftRecord, StaffIdentity } from '@/lib/staff-types';
import MenuManagement from './menu-management';
import InventoryManagement from './inventory-management';
import ReceiptPrint from './receipt-print';
import UserManagement from './user-management';
import ExpenseManagement from './expense-management';
import CashierOrder from './cashier-order';

type OrderRow = OrderRecord;

type OrderFilter = 'ALL' | OrderRow['status'];
type DashboardSection = 'orders' | 'new-order' | 'menu' | 'inventory' | 'settings' | 'shifts' | 'users' | 'expenses';

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
  const [staff, setStaff] = useState<StaffIdentity | null>(null);
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
  const [receiptOrder, setReceiptOrder] = useState<OrderRecord | null>(null);
  const [activeShift, setActiveShift] = useState<ShiftRecord | null>(null);
  const [shiftRows, setShiftRows] = useState<ShiftRecord[]>([]);
  const [shiftMessage, setShiftMessage] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

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
        return await response.json() as { authenticated: boolean; staff?: StaffIdentity | null; activeShift?: ShiftRecord | null };
      })
      .then((session) => {
        if (!active) return;
        if (session.authenticated) {
          setStaff(session.staff ?? null);
          setActiveShift(session.activeShift ?? null);
          setLoggedIn(true);
          void fetchOrders();
          void fetch('/api/dashboard/shift').then((response) => response.json() as Promise<{ active?: ShiftRecord | null; shifts?: ShiftRecord[] }>).then((data) => {
            setActiveShift(data.active ?? null);
            if (data.shifts) setShiftRows(data.shifts);
          });
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

  const refreshShiftSummary = useCallback(async () => {
    if (!loggedIn) return;
    try {
      const response = await fetch('/api/dashboard/shift');
      const data = await response.json() as { active?: ShiftRecord | null; shifts?: ShiftRecord[]; error?: string };
      if (!response.ok) {
        if (data.error) setError(data.error);
        return;
      }
      if (staff?.role === 'ADMIN') {
        setShiftRows(data.shifts ?? []);
      } else {
        setActiveShift(data.active ?? null);
      }
    } catch {
      setError('تعذر تحديث سجل الشيفتات');
    }
  }, [loggedIn, staff]);

  useEffect(() => {
    if (!loggedIn) return;
    const interval = window.setInterval(() => {
      void fetchOrders();
      void refreshShiftSummary();
    }, 4000);
    return () => window.clearInterval(interval);
  }, [fetchOrders, loggedIn, refreshShiftSummary]);

  useEffect(() => {
    if (!loggedIn || staff?.role !== 'ADMIN') {
      return;
    }
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
  }, [loggedIn, staff]);

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
      const data = await response.json() as { error?: string; staff?: StaffIdentity; activeShift?: ShiftRecord | null };
      if (!response.ok) {
        setError(data.error || 'تعذر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور.');
        return;
      }
      setStaff(data.staff ?? null);
      setActiveShift(data.activeShift ?? null);
      setLoggedIn(true);
      await fetchOrders();
      await refreshShiftSummary();
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
      setStaff(null);
      setOrders([]);
    }
  };

  const updateShift = async (action: 'start' | 'end') => {
    setShiftMessage('');
    const response = await fetch('/api/dashboard/shift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await response.json() as { shift?: ShiftRecord; error?: string };
    if (!response.ok) {
      setShiftMessage(data.error || 'تعذر تحديث الشيفت');
      return;
    }
    setActiveShift(action === 'start' ? data.shift ?? null : null);
    if (staff?.role === 'ADMIN') {
      await refreshShiftSummary();
    }
    setShiftMessage(action === 'start' ? 'بدأ الشيفت بتوقيت الخادم.' : `انتهى الشيفت بإجمالي ${data.shift?.totalMinutes ?? 0} دقيقة.`);
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
      return <LogoSplash />;
    }

    return (
      <main className="relative flex min-h-[calc(100svh-3.125rem)] w-full min-w-0 items-center justify-center overflow-hidden px-4 py-6 sm:p-6">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full border border-[#91A560]/15 motion-float" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-[#E5E3B2]/55 blur-3xl" />
        <div className="login-cup relative isolate w-full max-w-md px-0 pb-7 sm:px-5">
          <div aria-hidden="true" className="login-cup-handle" />
          <div aria-hidden="true" className="login-cup-body" />
          <div aria-hidden="true" className="login-cup-rim" />
          <div className="relative z-10 px-5 pb-6 pt-7 sm:px-8 sm:pb-8 sm:pt-8">
            <div className="mb-5 flex min-w-0 items-center gap-3">
              <Image src="/matcha-logo.png" alt="Matcha Coffee and Pancakes" width={48} height={48} className="h-12 w-12 shrink-0 rounded-full object-cover" priority />
              <div>
                <p className="brand-name text-[11px] tracking-[.16em] text-[#705331]">MATCHA CAFÉ</p>
              </div>
            </div>
            <h1 className="text-xl font-bold leading-relaxed text-[#232122] sm:text-2xl">دخول الكاشير</h1>

            <form
              className="mt-5 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void login();
              }}
            >
              <label className="block text-sm font-semibold text-[#232122]">
                البريد الإلكتروني
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={auth.email}
                  onChange={(e) => setAuth({ ...auth, email: e.target.value })}
                  placeholder="name@example.com"
                  className="mt-2 w-full rounded-xl border-[#E5E3B2] bg-[#fbfbf8] py-2.5 placeholder:text-[#aaa99f] focus:bg-white"
                />
              </label>
              <label className="block text-sm font-semibold text-[#232122]">
                كلمة المرور
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={auth.password}
                  onChange={(e) => setAuth({ ...auth, password: e.target.value })}
                  placeholder="أدخل كلمة المرور"
                  className="mt-2 w-full rounded-xl border-[#E5E3B2] bg-[#fbfbf8] py-2.5 placeholder:text-[#aaa99f] focus:bg-white"
                />
              </label>
              {error ? <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-sm leading-6 text-rose-700 motion-enter">{error}</p> : null}
              <button
                type="submit"
                disabled={loginSubmitting}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-[#6B8136] px-4 py-3 font-bold text-white shadow-[0_8px_20px_rgba(67,93,50,.2)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#5d702f] hover:shadow-[0_12px_24px_rgba(67,93,50,.25)] disabled:cursor-wait disabled:opacity-70"
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
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4 rounded-[1.5rem] border border-[#E5E3B2] bg-white/90 p-4 shadow-[0_8px_24px_rgba(44,43,35,.045)] backdrop-blur motion-enter sm:p-5">
          <div className="flex items-center gap-3">
          <Image src="/matcha-logo.png" alt="Matcha Coffee and Pancakes" width={64} height={64} className="h-14 w-14 rounded-full object-cover" priority />
            <div>
              <p className="brand-name text-[11px] tracking-[.14em] text-[#705331]">MATCHA CAFÉ</p>
              <h1 className="mt-0.5 text-xl font-bold text-[#232122] sm:text-2xl">لوحة الكاشير</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {staff ? <span className="hidden rounded-xl bg-[#FCF5ED] px-3 py-2 text-sm font-semibold text-[#705331] sm:inline-block">{staff.username}</span> : null}
            {staff?.role === 'EMPLOYEE' && activeShift ? <button type="button" onClick={() => void updateShift('end')} className="rounded-xl bg-[#6B8136] px-3 py-2.5 text-sm font-semibold text-white">مغادرة الشفت</button> : null}
            <div className="flex items-center gap-2">
              <button onClick={logout} className="rounded-xl border border-[#E5E3B2] bg-white px-4 py-2.5 text-sm font-semibold text-[#705331] transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700">
                تسجيل الخروج
              </button>
            </div>
          </div>
        </header>

        <button type="button" onClick={() => setDrawerOpen(true)} className="mb-6 inline-flex items-center gap-2 rounded-xl border border-[#E5E3B2] bg-white/90 px-4 py-3 text-sm font-semibold text-[#705331] shadow-[0_4px_16px_rgba(44,43,35,.06)]">
          <span className="text-lg" aria-hidden="true">☰</span> أقسام لوحة التحكم
        </button>
        {drawerOpen ? <div className="fixed inset-0 z-50 bg-[#232122]/35 backdrop-blur-[1px]" onClick={() => setDrawerOpen(false)}>
          <aside className="h-full w-72 max-w-[85vw] bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between"><h2 className="text-lg font-bold text-[#232122]">أقسام الداشبورد</h2><button type="button" onClick={() => setDrawerOpen(false)} className="rounded-lg px-2 py-1 text-xl text-[#705331]" aria-label="إغلاق القائمة">×</button></div>
            <nav aria-label="أقسام لوحة التحكم" className="space-y-2">
              {((staff?.role === 'ADMIN' ? [['orders', 'الطلبات'], ['new-order', 'إنشاء طلب'], ['expenses', 'المصروفات'], ['menu', 'إدارة المنيو'], ['inventory', 'المخزون والتقارير'], ['settings', 'الإعدادات والرسوم'], ['shifts', 'الشيفتات'], ['users', 'المستخدمون']] : [['orders', 'الطلبات'], ['new-order', 'إنشاء طلب'], ['expenses', 'المصروفات']]) as Array<[DashboardSection, string]>).map(([section, title]) => (
                <button key={section} type="button" aria-pressed={dashboardSection === section} onClick={() => { setDashboardSection(section); setDrawerOpen(false); }} className={`w-full rounded-xl px-4 py-3 text-start text-sm font-semibold transition ${dashboardSection === section ? 'bg-[#6B8136] text-white shadow-sm' : 'text-[#705331] hover:bg-[#FCF5ED]'}`}>{title}</button>
              ))}
            </nav>
          </aside>
        </div> : null}
        {shiftMessage ? <p role="status" className="mb-5 rounded-xl border border-[#E5E3B2] bg-[#FCF5ED] px-4 py-3 text-sm text-[#705331]">{shiftMessage}</p> : null}

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
            <div key={stat.label} style={{ animationDelay: `${index * 70}ms` }} className="rounded-2xl border border-[#E5E3B2] bg-white p-4 shadow-[0_5px_18px_rgba(44,43,35,.035)] motion-enter motion-fill-both sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[#705331] sm:text-sm">{stat.label}</p>
                <span className={`h-2 w-2 rounded-full ${stat.marker}`} />
              </div>
              <p className={`mt-3 inline-flex min-w-11 items-center justify-center rounded-xl px-3 py-1.5 text-2xl font-bold tabular-nums ${stat.tone}`}>{stat.count}</p>
            </div>
          ))}
        </section>

        </> : null}

        {dashboardSection === 'new-order' ? <CashierOrder onCreated={() => void fetchOrders()} /> : null}
        {dashboardSection === 'expenses' && staff ? <ExpenseManagement staff={staff} /> : null}
        {dashboardSection === 'menu' ? <MenuManagement /> : null}
        {dashboardSection === 'inventory' ? <InventoryManagement /> : null}

        {dashboardSection === 'settings' ? <section aria-labelledby="pricing-heading" className="mb-7 rounded-[1.5rem] border border-[#E5E3B2] bg-white/85 p-4 shadow-[0_8px_24px_rgba(44,43,35,.04)] sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="pricing-heading" className="text-xl font-bold text-[#232122]">إعدادات الخدمة والضريبة</h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#705331]">فعّل الرسوم اللي بتطبقها بس. التغييرات هتتحسب على الطلبات الجديدة.</p>
            </div>
            <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${pricingSettings.serviceEnabled || pricingSettings.taxEnabled ? 'bg-[#f4f6ef] text-[#66764e]' : 'bg-[#f4f3ef] text-[#705331]'}`}>
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
                    <div key={setting.key} className="rounded-2xl border border-[#E5E3B2] bg-[#fcfcf9] p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E5E3B2] text-lg font-bold text-[#6B8136]">{setting.icon}</span>
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
                      <label className="mt-4 flex items-center justify-between gap-3 border-t border-[#E5E3B2] pt-3 text-sm font-medium text-[#705331]">
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
                            className="w-24 rounded-lg border-[#E5E3B2] bg-white px-3 py-2 text-center tabular-nums"
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
                  className="rounded-xl bg-[#6B8136] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(67,93,50,.15)] transition hover:bg-[#5d702f] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {pricingSaving ? 'جارٍ حفظ الإعدادات…' : 'حفظ إعدادات الرسوم'}
                </button>
              </div>
            </>
          )}
        </section> : null}

        {dashboardSection === 'shifts' && staff?.role === 'ADMIN' ? <section className="rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-4 shadow-[0_10px_30px_rgba(44,43,35,.045)] sm:p-6">
          <h2 className="text-xl font-bold text-[#232122]">سجل الشيفتات</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[700px] text-right text-sm">
              <thead className="border-b border-[#E5E3B2] text-xs text-[#705331]"><tr><th className="px-3 py-3">الموظف</th><th className="px-3 py-3">الوردية</th><th className="px-3 py-3">البداية</th><th className="px-3 py-3">النهاية</th><th className="px-3 py-3">المدة</th><th className="px-3 py-3">الحالة</th></tr></thead>
              <tbody>{shiftRows.map((shift) => <tr key={shift.id} className="border-b border-[#E5E3B2]"><td className="px-3 py-3 font-semibold">{shift.username}</td><td className="px-3 py-3">{shift.shiftType === 'DAY' ? 'نهاري' : 'ليلي'}</td><td className="px-3 py-3" dir="ltr">{new Date(shift.startedAt).toLocaleString('ar-EG')}</td><td className="px-3 py-3" dir="ltr">{shift.endedAt ? new Date(shift.endedAt).toLocaleString('ar-EG') : '-'}</td><td className="px-3 py-3">{shift.totalMinutes ?? '-'} دقيقة</td><td className="px-3 py-3">{shift.endedAt ? 'مكتمل' : 'نشط'}</td></tr>)}</tbody>
            </table>
          </div>
        </section> : null}
        {dashboardSection === 'users' && staff?.role === 'ADMIN' ? <UserManagement /> : null}

        {dashboardSection === 'orders' ? <section aria-labelledby="orders-heading" className="rounded-[1.5rem] border border-[#E5E3B2] bg-white/75 p-4 shadow-[0_10px_30px_rgba(44,43,35,.045)] sm:p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="orders-heading" className="text-xl font-bold text-[#232122]">الطلبات</h2>
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
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${orderFilter === filter ? 'bg-[#6B8136] text-white shadow-sm' : 'bg-[#FCF5ED] text-[#705331] hover:bg-[#ecebe3]'}`}
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
            <div className="rounded-2xl border border-dashed border-[#E5E3B2] bg-[#FCF5ED] px-5 py-12 text-center motion-enter">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E5E3B2] text-2xl text-[#66804a]">✓</div>
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
                  <tbody className="divide-y divide-[#E5E3B2]">
                    {visibleOrders.map((order) => (
                      <tr key={order.id} className="align-top transition hover:bg-[#fbfbf8]">
                        <td className="whitespace-nowrap px-4 py-4">
                          <p className="font-bold text-[#232122]">#{order.orderNumber}</p>
                          <time className="mt-1 block text-xs text-[#89877c]" dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</time>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-semibold text-[#403d33]">{order.type === 'DINE_IN' ? `طاولة ${order.tableNumber ?? '-'}` : order.type === 'DELIVERY' ? 'توصيل' : 'تيك أواي'}</p>
                          {order.customerName ? <p className="mt-1 text-xs text-[#705331]">{order.customerName}</p> : null}
                          {order.customerPhone ? <a href={`tel:${order.customerPhone}`} dir="ltr" className="mt-1 inline-block text-xs text-[#6B8136] hover:underline">{order.customerPhone}</a> : null}
                          {order.type === 'DELIVERY' && order.customerAddress ? <p className="mt-1 text-xs text-[#705331]">{order.customerAddress}</p> : null}
                        </td>
                        <td className="max-w-xs px-4 py-4">
                          <OrderItems order={order} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-4">
                          <p className="font-bold text-[#6B8136]">{order.total.toFixed(2)} ج.م</p>
                          <p className="mt-1 text-[11px] text-[#89877c]">المجموع {order.subtotal.toFixed(2)}{order.serviceFee ? ` · خدمة ${order.serviceFee.toFixed(2)}` : ''}{order.tax ? ` · ضريبة ${order.tax.toFixed(2)}` : ''}</p>
                        </td>
                        <td className="px-4 py-4"><span className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[order.status]}`}>{statusLabels[order.status]}</span></td>
                        <td className="space-y-2 px-4 py-4"><OrderActions order={order} busy={busyOrderId === order.id} onStatus={(status) => void updateStatus(order.id, status)} /><button type="button" onClick={() => setReceiptOrder(order)} className="w-full rounded-lg border border-[#E5E3B2] px-3 py-2 text-xs font-semibold text-[#6B8136] hover:bg-[#FCF5ED]">طباعة الإيصال</button></td>
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
                        <h3 className="font-bold text-[#232122]">#{order.orderNumber}</h3>
                        <time className="mt-1 block text-xs text-[#89877c]" dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</time>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusStyles[order.status]}`}>{statusLabels[order.status]}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#6c6d5c]">
                      <span className="rounded-lg bg-[#FCF5ED] px-2.5 py-1.5">{order.type === 'DINE_IN' ? `طاولة ${order.tableNumber ?? '-'}` : order.type === 'DELIVERY' ? 'توصيل' : 'تيك أواي'}</span>
                      {order.customerName ? <span className="rounded-lg bg-[#FCF5ED] px-2.5 py-1.5">{order.customerName}</span> : null}
                      {order.customerPhone ? <a dir="ltr" href={`tel:${order.customerPhone}`} className="rounded-lg bg-[#FCF5ED] px-2.5 py-1.5 text-[#6B8136]">{order.customerPhone}</a> : null}
                      {order.type === 'DELIVERY' && order.customerAddress ? <span className="rounded-lg bg-[#FCF5ED] px-2.5 py-1.5">{order.customerAddress}</span> : null}
                    </div>
                    <div className="my-3 border-y border-dashed border-[#E5E3B2] py-3"><OrderItems order={order} /></div>
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs text-[#705331]">إجمالي الطلب</span>
                      <span className="font-bold text-[#6B8136]">{order.total.toFixed(2)} ج.م</span>
                    </div>
                    <OrderActions order={order} busy={busyOrderId === order.id} onStatus={(status) => void updateStatus(order.id, status)} />
                    <button type="button" onClick={() => setReceiptOrder(order)} className="mt-2 w-full rounded-lg border border-[#E5E3B2] px-3 py-2 text-xs font-semibold text-[#6B8136] hover:bg-[#FCF5ED]">طباعة الإيصال</button>
                  </article>
                ))}
              </div>
              {receiptOrder ? <ReceiptPrint order={receiptOrder} onClose={() => setReceiptOrder(null)} /> : null}
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
      <summary className="cursor-pointer text-xs font-semibold text-[#6B8136]">{order.items.length} أصناف · اضغط للتفاصيل</summary>
      <div className="mt-2 space-y-2">
        {order.items.map((item, index) => (
          <div key={`${order.id}-${index}`} className="rounded-lg bg-[#f8f8f4] px-3 py-2">
            <p className="flex items-start justify-between gap-2 text-xs font-semibold text-[#403d33]">
              <span>{item.nameAr}</span><span className="shrink-0">× {item.quantity}</span>
            </p>
            {item.selectedOptions.length ? <p className="mt-1 text-[11px] leading-5 text-[#705331]">{item.selectedOptions.map((option) => `${option.optionAr}${option.price ? ` (+${option.price} ج.م)` : ''}`).join('، ')}</p> : null}
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
    NEW: { status: 'PREPARING', label: 'بدء التجهيز', className: 'bg-[#6B8136] text-white hover:bg-[#5d702f]' },
    PREPARING: { status: 'READY', label: 'تحديد كجاهز', className: 'bg-[#eaf2f6] text-sky-800 hover:bg-[#dcebf2]' },
    READY: { status: 'COMPLETED', label: 'تأكيد التسليم', className: 'bg-[#6B8136] text-white hover:bg-[#5d702f]' },
  };
  const action = nextAction[order.status];
  return (
    <div className="flex flex-wrap gap-2">
      {action ? <button disabled={busy} onClick={() => onStatus(action.status)} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-50 ${action.className}`}>{busy ? 'جارٍ التحديث…' : action.label}</button> : null}
      {order.status !== 'COMPLETED' && order.status !== 'CANCELLED' ? <button disabled={busy} onClick={() => onStatus('CANCELLED')} className="rounded-lg border border-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50">إلغاء</button> : null}
    </div>
  );
}
