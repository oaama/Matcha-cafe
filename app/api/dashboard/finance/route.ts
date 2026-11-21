import { NextResponse } from 'next/server';
import { getCatalog } from '@/lib/catalog-repository';
import { listDebts } from '@/lib/debt-repository';
import { listExpenses } from '@/lib/expense-repository';
import { getInventoryData, calculateOrderInventoryConsumption } from '@/lib/inventory-repository';
import { getOrderRepository } from '@/lib/order-repository';
import { listPayrollRecords, getPayrollStatement } from '@/lib/payroll-repository';
import { listPurchaseInvoices } from '@/lib/purchase-repository';
import { listManualRevenue } from '@/lib/revenue-repository';
import { requireStaffRole } from '@/lib/staff-api';
import { listStaffAccounts } from '@/lib/staff-user-repository';
import { listActivityLogs } from '@/lib/activity-log-repository';
import { listShifts } from '@/lib/shift-repository';
import type { OrderRecord } from '@/lib/types';
import { calculateFinancialSummary } from '@/lib/finance-calculations';

function parseBound(value: string | null, timezoneOffset: number, endOfDay: boolean) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsedDay = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsedDay.getTime()) || parsedDay.toISOString().slice(0, 10) !== value) return null;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  date.setTime(date.getTime() + timezoneOffset * 60_000);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDateKey(value: string, timezoneOffset: number) {
  const date = new Date(new Date(value).getTime() - timezoneOffset * 60_000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function GET(request: Request) {
  if (!await requireStaffRole(['ADMIN'])) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const fromValue = params.get('from');
  const toValue = params.get('to');
  const timezoneOffset = Number(params.get('timezoneOffset') ?? '0');
  if (!Number.isInteger(timezoneOffset) || Math.abs(timezoneOffset) > 840) {
    return NextResponse.json({ error: 'المنطقة الزمنية غير صالحة' }, { status: 400 });
  }
  const from = parseBound(fromValue, timezoneOffset, false);
  const to = parseBound(toValue, timezoneOffset, true);
  if (!from || !to || from > to) {
    return NextResponse.json({ error: 'اختار فترة زمنية صحيحة' }, { status: 400 });
  }

  try {
    const [orders, catalog, expenses, revenues, purchases, debtData, shifts, staffAccounts] = await Promise.all([
      getOrderRepository().list(),
      getCatalog(),
      listExpenses({ from: fromValue!, to: toValue! }),
      listManualRevenue({ from: fromValue!, to: toValue! }),
      listPurchaseInvoices({ from: fromValue!, to: toValue!, status: 'APPROVED' }),
      listDebts(),
      listShifts(),
      listStaffAccounts(),
    ]);
    const inventory = await getInventoryData(catalog.products);
    const inRange = (value: string) => {
      const time = new Date(value).getTime();
      return Number.isFinite(time) && time >= from.getTime() && time <= to.getTime();
    };
    const periodOrders = orders.filter((order) => inRange(order.createdAt));
    const completedOrders = periodOrders.filter((order) => order.status === 'COMPLETED');
    let estimatedProductCosts = 0;
    let uncostedOrderCount = 0;
    for (const order of completedOrders) {
      if (order.inventoryCostSnapshot !== undefined) continue;
      const estimate = estimateLegacyOrderCost(order, inventory.items, inventory.recipes);
      if (estimate === null) uncostedOrderCount += 1;
      else estimatedProductCosts += estimate;
    }

    const employeeAccounts = staffAccounts.filter((account) => account.role === 'EMPLOYEE');
    const payrollRecords = await listPayrollRecords(employeeAccounts.map((account) => account.id));
    const profiles = new Map(payrollRecords.map((record) => [record.employeeId, record.profile]));
    const payrollStatements = await Promise.all(employeeAccounts.map((account) =>
      getPayrollStatement(account.id, fromValue!, toValue!)));
    const summary = calculateFinancialSummary({
      completedOrders,
      estimatedProductCosts,
      uncostedOrderCount,
      manualRevenue: revenues.reduce((sum, revenue) => sum + revenue.amount, 0),
      operatingExpenses: expenses.reduce((sum, expense) => sum + expense.amount, 0),
      payroll: payrollStatements,
      outstandingDebts: debtData.totals.remainingAmount,
      approvedPurchases: purchases.reduce((sum, invoice) => sum + invoice.total, 0),
    });

    const daily = new Map<string, { online: number; manual: number; expenses: number }>();
    const getDay = (date: string) => {
      const row = daily.get(date) ?? { online: 0, manual: 0, expenses: 0 };
      daily.set(date, row);
      return row;
    };
    for (const order of completedOrders) {
      const date = localDateKey(order.createdAt, timezoneOffset);
      if (date) getDay(date).online += order.total;
    }
    for (const revenue of revenues) getDay(revenue.date).manual += revenue.amount;
    for (const expense of expenses) getDay(expense.expenseDate).expenses += expense.amount;
    const dailySummary = [...daily.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, values]) => ({
      date,
      online: roundMoney(values.online),
      manual: roundMoney(values.manual),
      expenses: roundMoney(values.expenses),
    }));

    const recentActivities = await listActivityLogs({ from, to, limit: 12 });
    const lowStock = inventory.items.filter((item) => item.trackStock || item.quantity > 0 || item.lowStockThreshold > 0)
      .filter((item) => item.quantity <= item.lowStockThreshold)
      .map((item) => ({ id: item.id, name: item.name, quantity: item.quantity, unit: item.unit, outOfStock: item.quantity === 0 }))
      .slice(0, 8);
    const activeShifts = shifts.filter((shift) => !shift.endedAt);
    const recentOrders = [...periodOrders].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 8);
    return NextResponse.json({
      range: { from: fromValue, to: toValue },
      summary,
      daily: dailySummary,
      recentOrders,
      recentActivities,
      lowStock,
      activeShifts,
      attendanceCount: payrollStatements.filter((statement) => statement.regularHours > 0).length,
      employeesWithProfiles: employeeAccounts.filter((account) => profiles.has(account.id)).length,
    });
  } catch (error) {
    console.error('Unable to build financial overview:', error);
    return NextResponse.json({ error: 'تعذر تحميل الملخص المالي' }, { status: 500 });
  }
}

function estimateLegacyOrderCost(
  order: OrderRecord,
  items: Awaited<ReturnType<typeof getInventoryData>>['items'],
  recipes: Awaited<ReturnType<typeof getInventoryData>>['recipes'],
) {
  const consumption = calculateOrderInventoryConsumption(order, items, recipes);
  if (!consumption.length) return null;
  const itemCosts = new Map(items.map((item) => [item.id, item.unitCost]));
  let total = 0;
  for (const entry of consumption) {
    const unitCost = itemCosts.get(entry.itemId);
    if (unitCost === undefined) return null;
    total += entry.quantity * unitCost;
  }
  return roundMoney(total);
}
