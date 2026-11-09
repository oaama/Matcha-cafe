'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import LogoSplash from './logo-splash';
import { DEFAULT_PRICING_SETTINGS, type PricingSettings } from '@/lib/pricing';
import type { OrderRecord } from '@/lib/types';
import type { ShiftRecord, StaffIdentity } from '@/lib/staff-types';
import { formatShiftDuration, getShiftDurationMinutes, shiftEndedToday } from '@/lib/shift-time';
import MenuManagement from './menu-management';
import InventoryManagement from './inventory-management';
import ReceiptPrint from './receipt-print';
import UserManagement from './user-management';
import ExpenseManagement from './expense-management';
import CashierOrder from './cashier-order';
import ShiftReceipt from './shift-receipt';

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
  const [showPassword, setShowPassword] = useState(false);
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
  const [receiptShift, setReceiptShift] = useState<ShiftRecord | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [shiftSaving, setShiftSaving] = useState(false);

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
          void fetch('/api/dashboard/shift')
            .then(async (response) => {
              const data = await response.json() as { active?: ShiftRecord | null; shifts?: ShiftRecord[]; error?: string };
              if (!response.ok) throw new Error(data.error || 'تعذر تحميل سجل الشيفتات');
              setActiveShift(data.active ?? null);
              setShiftRows(data.shifts ?? []);
            })
            .catch((shiftError: unknown) => {
              if (active) setError(shiftError instanceof Error ? shiftError.message : 'تعذر تحميل سجل الشيفتات');
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
      setShiftRows(data.shifts ?? []);
      if (staff?.role === 'EMPLOYEE') setActiveShift(data.active ?? null);
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
    const interval = window.setInterval(() => setClockNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

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
      const shiftResponse = await fetch('/api/dashboard/shift');
      const shiftData = await shiftResponse.json() as { active?: ShiftRecord | null; shifts?: ShiftRecord[]; error?: string };
      if (!shiftResponse.ok) throw new Error(shiftData.error || 'تعذر تحميل الشيفتات');
      setActiveShift(shiftData.active ?? null);
      setShiftRows(shiftData.shifts ?? []);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'تعذر الاتصال بالخادم أثناء تسجيل الدخول. تحقق من اتصال الإنترنت وحاول مرة أخرى.');
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
      const data = await response.json() as { error?: string; shiftAttributionWarning?: string };
      if (response.ok) {
        await fetchOrders();
        if (data.shiftAttributionWarning) setShiftMessage(data.shiftAttributionWarning);
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
    if (staff?.role === 'EMPLOYEE' && activeShift) {
      try {
        const shiftResponse = await fetch('/api/dashboard/shift', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'end' }),
        });
        const shiftData = await shiftResponse.json() as { shift?: ShiftRecord; error?: string };
        if (!shiftResponse.ok) throw new Error(shiftData.error || 'تعذر إنهاء الشيفت قبل تسجيل الخروج');
        setActiveShift(null);
      } catch (logoutError) {
        setError(logoutError instanceof Error ? logoutError.message : 'تعذر إنهاء الشيفت قبل تسجيل الخروج');
        return;
      }
    }
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
    if (shiftSaving) return;
    setShiftSaving(true);
    setShiftMessage('');
    try {
      const shiftResponse = await fetch('/api/dashboard/shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await shiftResponse.json() as { shift?: ShiftRecord; error?: string };
      if (!shiftResponse.ok || !data.shift) {
        setShiftMessage(data.error || 'تعذر تحديث الشيفت');
        return;
      }
      setActiveShift(action === 'start' ? data.shift : null);
      const summaryResponse = await fetch('/api/dashboard/shift');
      const summary = await summaryResponse.json() as { shifts?: ShiftRecord[]; error?: string };
      if (!summaryResponse.ok) {
        setShiftMessage(summary.error || 'تعذر تحديث سجل الشيفتات');
        return;
      }
      setShiftRows(summary.shifts ?? []);
      setShiftMessage(action === 'start' ? 'بدأ الشيفت بتوقيت الخادم.' : `انتهى الشيفت بإجمالي ${formatShiftDuration(data.shift.totalMinutes ?? 0)}.`);
    } catch (shiftError) {
      setShiftMessage(shiftError instanceof Error ? shiftError.message : 'تعذر الاتصال بالخادم أثناء تحديث الشيفت');
    } finally {
      setShiftSaving(false);
    }
  };

  const orderCounts = {
    NEW: orders.filter((order) => order.status === 'NEW').length,
    PREPARING: orders.filter((order) => order.status === 'PREPARING').length,
    READY: orders.filter((order) => order.status === 'READY').length,
    COMPLETED: orders.filter((order) => order.status === 'COMPLETED').length,
  };
  const visibleOrders = orderFilter === 'ALL' ? orders : orders.filter((order) => order.status === orderFilter);
  const completedShiftToday = staff?.role === 'EMPLOYEE'
    && shiftRows.some((shift) => shift.employeeId === staff.id && shiftEndedToday(shift, clockNow));
  const pricingHasChanges = JSON.stringify(pricingSettings) !== JSON.stringify(savedPricingSettings);
  const navigationItems: Array<{ section: DashboardSection; title: string; icon: string }> = staff?.role === 'ADMIN'
    ? [
      { section: 'orders', title: 'الطلبات', icon: '▤' },
      { section: 'new-order', title: 'إنشاء طلب', icon: '＋' },
      { section: 'expenses', title: 'المصروفات', icon: '◈' },
      { section: 'menu', title: 'إدارة المنيو', icon: '☷' },
      { section: 'inventory', title: 'المخزون والتقارير', icon: '▦' },
      { section: 'settings', title: 'الإعدادات والرسوم', icon: '⚙' },
      { section: 'shifts', title: 'الشيفتات', icon: '◷' },
      { section: 'users', title: 'المستخدمون', icon: '♙' },
    ]
    : [
      { section: 'orders', title: 'الطلبات', icon: '▤' },
      { section: 'new-order', title: 'إنشاء طلب', icon: '＋' },
      { section: 'expenses', title: 'المصروفات', icon: '◈' },
      { section: 'shifts', title: 'شيفتاتي', icon: '◷' },
    ];

  if (!loggedIn) {
    if (sessionChecking) {
      return <LogoSplash />;
    }

    return (
      <main className="relative flex min-h-[calc(100svh-3.125rem)] w-full min-w-0 items-center justify-center overflow-hidden px-4 py-7 sm:px-6 sm:py-10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full border border-[#91A560]/20 motion-float" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-[#E5E3B2]/55 blur-3xl" />
        <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_28px_90px_rgba(52,69,39,.14)] md:min-h-[36rem] md:grid-cols-2">
          <section className="relative isolate flex min-h-56 flex-col justify-between overflow-hidden bg-gradient-to-br from-[#176f68] via-[#286f62] to-[#536f3c] px-6 py-7 text-white sm:px-10 sm:py-9 md:min-h-full md:px-12 md:py-12">
            <div aria-hidden="true" className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full border border-white/10" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -right-16 h-72 w-72 rounded-full bg-white/5 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <Image src="/matcha-logo.png" alt="Matcha Coffee and Pancakes" width={54} height={54} className="h-12 w-12 rounded-2xl border border-white/25 object-cover shadow-lg sm:h-14 sm:w-14" priority />
              <div>
                <p className="brand-name text-sm tracking-[.12em]">MATCHA CAFÉ</p>
                <p className="mt-1 text-xs text-white/70">مساحة فريق العمل</p>
              </div>
            </div>
            <div className="relative mt-8 md:mt-0">
              <h2 className="max-w-md text-2xl font-bold leading-relaxed sm:text-3xl">كل شيفت يبدأ بخطوة بسيطة</h2>
              <p className="mt-2 max-w-sm text-sm leading-7 text-white/75">سجّل دخولك لمتابعة الطلبات وإدارة شيفتك ومصروفاتك.</p>
            </div>
            <div className="relative mt-7 hidden items-center gap-2 text-xs text-white/75 sm:flex md:mt-12">
              <span className="rounded-lg border border-white/15 bg-white/10 px-3 py-2">الطلبات</span>
              <span aria-hidden="true" className="text-white/40">·</span>
              <span className="rounded-lg border border-white/15 bg-white/10 px-3 py-2">الشيفتات</span>
              <span aria-hidden="true" className="text-white/40">·</span>
              <span className="rounded-lg border border-white/15 bg-white/10 px-3 py-2">المصروفات</span>
            </div>
          </section>

          <section className="flex items-center px-6 py-8 sm:px-10 sm:py-10 md:px-12">
            <div className="mx-auto w-full max-w-md">
              <p className="text-sm font-semibold text-[#6B8136]">مرحبًا بعودتك</p>
              <h1 className="mt-2 text-2xl font-bold leading-relaxed text-[#232122] sm:text-3xl">تسجيل الدخول</h1>
              <p className="mt-2 text-sm leading-6 text-[#705331]">أدخل بيانات حساب الموظف أو المدير للمتابعة.</p>

              <form
                className="mt-7 space-y-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void login();
                }}
              >
                <label className="block text-sm font-semibold text-[#232122]">
                  البريد الإلكتروني
                  <input
                    type="email"
                    dir="ltr"
                    autoComplete="username"
                    required
                    value={auth.email}
                    onChange={(e) => setAuth({ ...auth, email: e.target.value })}
                    placeholder="name@example.com"
                    className="mt-2 w-full rounded-xl border-[#d9dfc7] bg-[#fbfcf8] px-4 py-3 text-left placeholder:text-[#a6a99b] focus:bg-white focus:ring-4 focus:ring-[#91A560]/10"
                  />
                </label>
                <label className="block text-sm font-semibold text-[#232122]">
                  كلمة المرور
                  <span className="relative mt-2 block">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      dir="ltr"
                      autoComplete="current-password"
                      required
                      value={auth.password}
                      onChange={(e) => setAuth({ ...auth, password: e.target.value })}
                      placeholder="أدخل كلمة المرور"
                      className="w-full rounded-xl border-[#d9dfc7] bg-[#fbfcf8] py-3 pl-20 pr-4 text-left placeholder:text-[#a6a99b] focus:bg-white focus:ring-4 focus:ring-[#91A560]/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-[#58704a] hover:bg-[#edf2e4]"
                    >
                      {showPassword ? 'إخفاء' : 'إظهار'}
                    </button>
                  </span>
                </label>
                {error ? <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-sm leading-6 text-rose-700 motion-enter">{error}</p> : null}
                <button
                  type="submit"
                  disabled={loginSubmitting}
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-[#6B8136] px-4 py-3.5 font-bold text-white shadow-[0_8px_20px_rgba(67,93,50,.2)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#5d702f] hover:shadow-[0_12px_24px_rgba(67,93,50,.25)] disabled:cursor-wait disabled:opacity-70"
                >
                  {loginSubmitting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> : null}
                  {loginSubmitting ? 'جارٍ تسجيل الدخول…' : 'دخول لوحة التحكم'}
                  {!loginSubmitting ? <span aria-hidden="true" className="transition-transform group-hover:-translate-x-1">←</span> : null}
                </button>
                <p className="text-center text-xs leading-5 text-[#8b8b7b]">الدخول مخصص لحسابات فريق Matcha Café.</p>
              </form>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <div className="dashboard-shell min-h-screen w-full min-w-0 bg-[#f1f8f6]">
      <header className="sticky top-0 z-30 flex min-h-[4.5rem] flex-wrap items-center justify-between gap-3 border-b border-[#dbe7e3] bg-[#f7fbf9]/95 px-4 py-2.5 backdrop-blur sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Image src="/matcha-logo.png" alt="Matcha Coffee and Pancakes" width={44} height={44} className="h-10 w-10 rounded-full object-cover" priority />
          <div>
            <p className="brand-name text-sm tracking-[.08em] text-[#176f68]">MATCHA CAFÉ</p>
            {staff ? <p className="text-xs text-[#647b77]">{staff.username}</p> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {staff?.role === 'EMPLOYEE' ? (
            activeShift ? (
              <>
                <span className="hidden rounded-xl bg-[#e5f5f1] px-3 py-2.5 text-xs font-semibold text-[#176f68] sm:inline-flex">
                  الشيفت الحالي · {formatShiftDuration(getShiftDurationMinutes(activeShift, clockNow))}
                </span>
                <button type="button" disabled={shiftSaving} onClick={() => void updateShift('end')} className="rounded-xl bg-[#176f68] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-[#115b56] disabled:opacity-60">{shiftSaving ? 'جارٍ إنهاء الشيفت…' : 'إنهاء الشيفت'}</button>
              </>
            ) : completedShiftToday ? (
              <span className="rounded-xl bg-[#f1f3ef] px-3 py-2.5 text-xs font-semibold text-[#647b77]">انتهى شيفتك اليوم</span>
            ) : <button type="button" disabled={shiftSaving} onClick={() => void updateShift('start')} className="rounded-xl bg-[#176f68] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-[#115b56] disabled:opacity-60">{shiftSaving ? 'جارٍ بدء الشيفت…' : 'بدء الشيفت'}</button>
          ) : null}
          <button onClick={logout} className="rounded-xl border border-[#cbd9d5] bg-white px-4 py-2.5 text-sm font-semibold text-[#315d58] transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700">
            تسجيل الخروج
          </button>
        </div>
      </header>

      <div className="mx-auto flex min-h-[calc(100svh-4.5rem)] w-full max-w-[1600px] gap-4 px-2 py-3 sm:px-4 lg:gap-6 lg:px-6 lg:py-5">
        <aside className="hidden w-[17rem] shrink-0 self-start rounded-[1.5rem] border border-[#dbe7e3] bg-white/80 p-3 shadow-[0_4px_18px_rgba(29,73,68,.04)] xl:sticky xl:top-[5.75rem] xl:block">
          <p className="px-3 pb-2 pt-3 text-xs font-semibold text-[#80918d]">الرئيسية</p>
          <nav aria-label="أقسام لوحة التحكم" className="space-y-2">
            {navigationItems.map(({ section, title, icon }) => (
              <button
                key={section}
                type="button"
                aria-pressed={dashboardSection === section}
                onClick={() => setDashboardSection(section)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-start text-sm font-semibold transition ${dashboardSection === section ? 'border-[#4b9b91] bg-[#d8f3ee] text-[#176f68]' : 'border-transparent text-[#566b67] hover:border-[#dbe7e3] hover:bg-[#f4f9f7]'}`}
              >
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/80 text-base">{icon}</span>
                {title}
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 rounded-[1.5rem] border border-[#dbe7e3] bg-[#f8fcfa] p-3 shadow-[0_5px_22px_rgba(29,73,68,.045)] sm:p-5 lg:p-7">
          <section className="dashboard-hero mb-6 flex flex-wrap items-center justify-between gap-5 rounded-[1.35rem] bg-gradient-to-l from-[#56766f] to-[#18756d] px-5 py-5 text-white shadow-sm sm:px-7 sm:py-6">
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">لوحة الكاشير</h1>
              {staff ? <p className="mt-1 text-sm text-white/75">{staff.username}</p> : null}
            </div>
            <button type="button" onClick={() => setDrawerOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/15 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/25 xl:hidden">
              <span className="text-lg" aria-hidden="true">☰</span> أقسام لوحة التحكم
            </button>
          </section>

        {drawerOpen ? <div className="fixed inset-0 z-50 bg-[#183a36]/40 backdrop-blur-[1px] xl:hidden" onClick={() => setDrawerOpen(false)}>
          <aside className="me-auto h-full w-72 max-w-[85vw] overflow-y-auto bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between"><h2 className="text-lg font-bold text-[#232122]">أقسام الداشبورد</h2><button type="button" onClick={() => setDrawerOpen(false)} className="rounded-lg px-2 py-1 text-xl text-[#315d58]" aria-label="إغلاق القائمة">×</button></div>
            <nav aria-label="أقسام لوحة التحكم" className="space-y-2">
              {navigationItems.map(({ section, title, icon }) => (
                <button key={section} type="button" aria-pressed={dashboardSection === section} onClick={() => { setDashboardSection(section); setDrawerOpen(false); }} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-start text-sm font-semibold transition ${dashboardSection === section ? 'bg-[#176f68] text-white shadow-sm' : 'text-[#315d58] hover:bg-[#edf6f3]'}`}><span aria-hidden="true">{icon}</span>{title}</button>
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
        <section aria-label="ملخص الطلبات" className="mb-7 grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
          {[
            { label: 'طلبات جديدة', count: orderCounts.NEW, tone: 'bg-amber-50 text-amber-800', marker: 'bg-amber-400' },
            { label: 'قيد التجهيز', count: orderCounts.PREPARING, tone: 'bg-sky-50 text-sky-800', marker: 'bg-sky-400' },
            { label: 'جاهزة للاستلام', count: orderCounts.READY, tone: 'bg-emerald-50 text-emerald-800', marker: 'bg-emerald-500' },
            { label: 'إجمالي الطلبات', count: orders.length, tone: 'bg-[#f2f3ec] text-[#536342]', marker: 'bg-[#819661]' },
          ].map((stat, index) => (
            <div key={stat.label} style={{ animationDelay: `${index * 70}ms` }} className="rounded-2xl border border-[#e0eae7] bg-white p-4 shadow-[0_5px_18px_rgba(29,73,68,.055)] motion-enter motion-fill-both sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[#647b77] sm:text-sm">{stat.label}</p>
                <span aria-hidden="true" className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-[#e5f5f1] text-sm text-[#176f68]">▤<span className={`absolute -left-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${stat.marker}`} /></span>
              </div>
              <p className="mt-3 text-3xl font-bold tabular-nums text-[#232a28]">{stat.count}</p>
            </div>
          ))}
        </section>

        </> : null}

        {dashboardSection === 'new-order' && staff?.role === 'EMPLOYEE' && !activeShift && !completedShiftToday ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
            ابدأ الشيفت أولًا عشان الطلبات والمبيعات تتسجل على شيفتك.
            <button type="button" onClick={() => void updateShift('start')} disabled={shiftSaving} className="mt-3 block rounded-xl bg-[#176f68] px-4 py-2.5 font-semibold text-white disabled:opacity-60">بدء الشيفت</button>
          </section>
        ) : dashboardSection === 'new-order' && staff?.role === 'EMPLOYEE' && completedShiftToday ? (
          <section className="rounded-2xl border border-[#dbe7e3] bg-[#f1f3ef] p-5 text-sm leading-6 text-[#647b77]">
            انتهى شيفتك اليوم، لذلك لا يمكنك إنشاء طلبات مرتبطة بشيفت. يمكنك بدء شيفت جديد غدًا.
          </section>
        ) : dashboardSection === 'new-order' ? <CashierOrder onCreated={() => void fetchOrders()} /> : null}
        {dashboardSection === 'expenses' && staff ? <ExpenseManagement staff={staff} activeShift={activeShift} /> : null}
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

        {dashboardSection === 'shifts' && staff ? <section className="rounded-[1.5rem] border border-[#e0eae7] bg-white/85 p-4 shadow-[0_10px_30px_rgba(29,73,68,.05)] sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-[#232a28]">{staff.role === 'ADMIN' ? 'سجل الشيفتات' : 'شيفتاتي'}</h2>
              <p className="mt-1 text-sm text-[#647b77]">سجل مستقل لساعات كل شيفت؛ ويظهر تقرير الشيفت للمدير بعد انتهائه.</p>
            </div>
            {staff.role === 'EMPLOYEE' && !activeShift && !completedShiftToday ? <button type="button" onClick={() => void updateShift('start')} disabled={shiftSaving} className="rounded-xl bg-[#176f68] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">بدء شيفت جديد</button> : null}
            {staff.role === 'EMPLOYEE' && completedShiftToday ? <p className="text-sm font-semibold text-[#647b77]">انتهى شيفتك اليوم؛ يمكنك بدء شيفت جديد غدًا.</p> : null}
          </div>
          {shiftRows.length === 0 ? <p className="rounded-xl bg-[#f1f8f6] p-5 text-sm text-[#647b77]">لا توجد شيفتات مسجلة حتى الآن.</p> : (
            <div className="grid gap-3 xl:grid-cols-2">
              {shiftRows.map((shift) => (
                <article key={shift.id} className="min-w-0 rounded-2xl border border-[#e0eae7] bg-white p-4 shadow-[0_3px_14px_rgba(29,73,68,.035)] sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-bold text-[#232a28]">{shift.username} · {shift.shiftType === 'DAY' ? 'نهاري' : 'ليلي'}</h3>
                      <p className="mt-1 text-xs text-[#647b77]">بداية الشيفت: {new Date(shift.startedAt).toLocaleString('ar-EG')}</p>
                      <p className="mt-1 text-xs text-[#647b77]">النهاية: {shift.endedAt ? new Date(shift.endedAt).toLocaleString('ar-EG') : 'شيفت نشط'}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${shift.endedAt ? 'bg-[#f1f3ef] text-[#647b77]' : 'bg-[#d8f3ee] text-[#176f68]'}`}>{shift.endedAt ? 'مكتمل' : 'نشط'}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#e8efec] pt-3">
                    <p className="text-sm font-semibold text-[#315d58]">مدة الشيفت: {formatShiftDuration(getShiftDurationMinutes(shift, clockNow))}</p>
                    {staff.role === 'ADMIN' ? shift.endedAt ? (
                      <button type="button" onClick={() => setReceiptShift(shift)} className="rounded-xl border border-[#b8d7d1] bg-[#f1f8f6] px-4 py-2.5 text-sm font-semibold text-[#176f68] transition hover:bg-[#d8f3ee]">عرض وطباعة التقرير</button>
                    ) : (
                      <span className="text-xs text-[#80918d]">التقرير متاح بعد انتهاء الشيفت</span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section> : null}
        {dashboardSection === 'users' && staff?.role === 'ADMIN' ? <UserManagement /> : null}

        {dashboardSection === 'orders' ? <section aria-labelledby="orders-heading" className="rounded-[1.5rem] border border-[#e0eae7] bg-white/85 p-4 shadow-[0_10px_30px_rgba(29,73,68,.05)] sm:p-6">
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
              <div className="hidden overflow-x-auto rounded-xl border border-[#e9e7df] 2xl:block">
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
                        <td className="space-y-2 px-4 py-4"><OrderActions order={order} busy={busyOrderId === order.id} shiftRequired={staff?.role === 'EMPLOYEE' && !activeShift} onStatus={(status) => void updateStatus(order.id, status)} /><button type="button" onClick={() => setReceiptOrder(order)} className="w-full rounded-lg border border-[#E5E3B2] px-3 py-2 text-xs font-semibold text-[#6B8136] hover:bg-[#FCF5ED]">طباعة الإيصال</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 2xl:hidden">
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
                    <OrderActions order={order} busy={busyOrderId === order.id} shiftRequired={staff?.role === 'EMPLOYEE' && !activeShift} onStatus={(status) => void updateStatus(order.id, status)} />
                    <button type="button" onClick={() => setReceiptOrder(order)} className="mt-2 w-full rounded-lg border border-[#E5E3B2] px-3 py-2 text-xs font-semibold text-[#6B8136] hover:bg-[#FCF5ED]">طباعة الإيصال</button>
                  </article>
                ))}
              </div>
              {receiptOrder ? <ReceiptPrint order={receiptOrder} onClose={() => setReceiptOrder(null)} /> : null}
            </>
          )}
        </section> : null}
        {receiptShift ? <ShiftReceipt shift={receiptShift} onClose={() => setReceiptShift(null)} /> : null}
        </main>
      </div>
    </div>
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

function OrderActions({ order, busy, shiftRequired, onStatus }: {
  order: OrderRow;
  busy: boolean;
  shiftRequired: boolean;
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
      {action ? <button disabled={busy || shiftRequired} onClick={() => onStatus(action.status)} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${action.className}`}>{busy ? 'جارٍ التحديث…' : action.label}</button> : null}
      {order.status !== 'COMPLETED' && order.status !== 'CANCELLED' ? <button disabled={busy || shiftRequired} onClick={() => onStatus('CANCELLED')} className="rounded-lg border border-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50">إلغاء</button> : null}
      {shiftRequired ? <p className="w-full text-xs text-[#8a6a22]">ابدأ الشيفت لتسجيل حركة الطلب.</p> : null}
    </div>
  );
}
