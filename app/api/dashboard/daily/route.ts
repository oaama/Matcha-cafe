import { NextResponse } from 'next/server';
import { getCatalog } from '@/lib/catalog-repository';
import { listExpenses } from '@/lib/expense-repository';
import { getInventoryData, calculateOrderInventoryConsumption } from '@/lib/inventory-repository';
import { getOrderRepository } from '@/lib/order-repository';
import { getPayrollStatement } from '@/lib/payroll-repository';
import { listManualRevenue } from '@/lib/revenue-repository';
import { requireStaffRole } from '@/lib/staff-api';
import { listStaffAccounts } from '@/lib/staff-user-repository';
import { calculateRecipeCost } from '@/lib/recipe-cost';
import { dailyFixedOverhead } from '@/lib/overhead-costing';
import { getOverheadConfig } from '@/lib/overhead-settings';
import { computeDailyReport, type DailyReportItemSale } from '@/lib/daily-report';
import { WORK_DAY_START_HOUR } from '@/lib/shift-time';
import type { OrderRecord } from '@/lib/types';

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// timezoneOffset is the client's minutes AHEAD of UTC (e.g. +120 for EET),
// as sent by components/daily-report.tsx (-getTimezoneOffset()).
function localDateKey(value: string, timezoneOffset: number) {
  const date = new Date(new Date(value).getTime() + timezoneOffset * 60_000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

// Single-day profit view ("اليومية"): one date in, one full day summary out.
export async function GET(request: Request) {
  if (!await requireStaffRole(['ADMIN'])) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const date = params.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'اختار تاريخ صحيح' }, { status: 400 });
  }
  const timezoneOffset = Number(params.get('timezoneOffset') ?? '0');
  if (!Number.isInteger(timezoneOffset) || Math.abs(timezoneOffset) > 840) {
    return NextResponse.json({ error: 'المنطقة الزمنية غير صالحة' }, { status: 400 });
  }

  try {
    const [orders, catalog, expenses, revenues, staffAccounts, overhead] = await Promise.all([
      getOrderRepository().list(),
      getCatalog(),
      listExpenses({ from: date, to: date }),
      listManualRevenue({ from: date, to: date }),
      listStaffAccounts(),
      getOverheadConfig(),
    ]);
    const inventory = await getInventoryData(catalog.products);
    const recipesByProduct = new Map(inventory.recipes.map((recipe) => [recipe.productId, recipe]));

    const dayOrders = orders.filter((order) =>
      order.status === 'COMPLETED' && localDateKey(order.createdAt, timezoneOffset - WORK_DAY_START_HOUR * 60) === date);

    let productCosts = 0;
    let uncostedOrderCount = 0;
    const itemSales = new Map<string, DailyReportItemSale>();
    for (const order of dayOrders) {
      const cost = order.inventoryCostSnapshot ?? estimateLegacyOrderCost(order, inventory.items, inventory.recipes);
      if (cost === null) uncostedOrderCount += 1;
      else productCosts += cost;
      for (const item of order.items) {
        const key = item.productId;
        const row = itemSales.get(key) ?? { name: item.nameAr, quantity: 0, revenue: 0, cost: 0 };
        row.quantity += item.quantity;
        row.revenue = roundMoney(row.revenue
          + (item.unitPrice + item.selectedOptions.reduce((sum, option) => sum + option.price, 0)) * item.quantity);
        const recipeCost = calculateRecipeCost(recipesByProduct.get(item.productId), inventory.items).totalCost;
        if (recipeCost !== undefined) row.cost = roundMoney((row.cost ?? 0) + recipeCost * item.quantity);
        itemSales.set(key, row);
      }
    }

    const employeeAccounts = staffAccounts.filter((account) => account.role === 'EMPLOYEE');
    const payrollStatements = await Promise.all(employeeAccounts.map((account) =>
      getPayrollStatement(account.id, date, date)));
    const wages = payrollStatements.reduce((sum, statement) =>
      sum + statement.baseWages + statement.overtimeEarnings, 0);

    const report = computeDailyReport({
      date,
      ordersRevenue: roundMoney(dayOrders.reduce((sum, order) => sum + order.total, 0)),
      orderCount: dayOrders.length,
      manualRevenue: roundMoney(revenues.reduce((sum, revenue) => sum + revenue.amount, 0)),
      productCosts: roundMoney(productCosts),
      uncostedOrderCount,
      expenses: roundMoney(expenses.reduce((sum, expense) => sum + expense.amount, 0)),
      wages: roundMoney(wages),
      fixedOverhead: dailyFixedOverhead(overhead),
      itemSales: [...itemSales.values()].sort((left, right) => right.revenue - left.revenue),
    });

    return NextResponse.json({ report });
  } catch (error) {
    console.error('Unable to build daily report:', error);
    return NextResponse.json({ error: 'تعذر تحميل تقرير اليومية' }, { status: 500 });
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
