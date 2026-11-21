import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import { getCatalog } from '@/lib/catalog-repository';
import { requireStaffRole } from '@/lib/staff-api';
import { getInventoryData, getInventoryMovements } from '@/lib/inventory-repository';
import { getOrderRepository } from '@/lib/order-repository';
import { listManualRevenue } from '@/lib/revenue-repository';
import { listPurchaseInvoices } from '@/lib/purchase-repository';
import { listDebts } from '@/lib/debt-repository';
import { getPayrollStatement } from '@/lib/payroll-repository';
import { listStaffAccounts } from '@/lib/staff-user-repository';
import { calculateRecipeCost } from '@/lib/recipe-cost';
import { getProductPrice } from '@/lib/pricing';
import { listExpenses } from '@/lib/expense-repository';

function parseDate(value: string | null, timezoneOffset = 0, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  date.setTime(date.getTime() + timezoneOffset * 60_000);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request: Request) {
  if (!await requireStaffRole(['ADMIN'])) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const timezoneOffset = Number(url.searchParams.get('timezoneOffset') ?? '0');
  if (!Number.isInteger(timezoneOffset) || Math.abs(timezoneOffset) > 840) {
    return NextResponse.json({ error: 'اختار منطقة زمنية صحيحة للتقرير' }, { status: 400 });
  }
  const from = parseDate(url.searchParams.get('from'), timezoneOffset);
  const to = parseDate(url.searchParams.get('to'), timezoneOffset, true);
  if (!from || !to || from > to) {
    return NextResponse.json({ error: 'اختار فترة زمنية صحيحة للتقرير' }, { status: 400 });
  }

  try {
    const [orders, catalog, revenues, expenses, purchases, debtData, staffAccounts] = await Promise.all([
      getOrderRepository().list(),
      getCatalog(),
      listManualRevenue({ from: url.searchParams.get('from')!, to: url.searchParams.get('to')! }),
      listExpenses({ from: url.searchParams.get('from')!, to: url.searchParams.get('to')! }),
      listPurchaseInvoices({ from: url.searchParams.get('from')!, to: url.searchParams.get('to')! }),
      listDebts(),
      listStaffAccounts(),
    ]);
    const [inventory, movements] = await Promise.all([
      getInventoryData(catalog.products),
      getInventoryMovements(from, to),
    ]);
    const employeeAccounts = staffAccounts.filter((account) => account.role === 'EMPLOYEE');
    const payrollStatements = await Promise.all(employeeAccounts.map((account) =>
      getPayrollStatement(account.id, url.searchParams.get('from')!, url.searchParams.get('to')!)));
    const inDateRange = (value: string) => value >= url.searchParams.get('from')! && value <= url.searchParams.get('to')!;
    const debts = debtData.debts.filter((debt) => inDateRange(debt.debtDate));
    const inRange = (value: string) => {
      const time = new Date(value).getTime();
      return Number.isFinite(time) && time >= from.getTime() && time <= to.getTime();
    };
    const reportOrders = orders.filter((order) => inRange(order.createdAt));
    const completedOrders = reportOrders.filter((order) => order.status === 'COMPLETED');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Matcha Café';
    workbook.created = new Date();

    const summary = workbook.addWorksheet('ملخص المبيعات', { views: [{ rightToLeft: true }] });
    summary.columns = [
      { header: 'المؤشر', key: 'label', width: 32 },
      { header: 'القيمة', key: 'value', width: 24 },
    ];
    summary.addRows([
      { label: 'الفترة من', value: url.searchParams.get('from') },
      { label: 'الفترة إلى', value: url.searchParams.get('to') },
      { label: 'عدد الطلبات المكتملة', value: completedOrders.length },
      { label: 'إجمالي المبيعات المكتملة (ج.م)', value: completedOrders.reduce((sum, order) => sum + order.total, 0) },
      { label: 'تكلفة المنتجات المحفوظة (ج.م)', value: completedOrders.reduce((sum, order) => sum + (order.inventoryCostSnapshot ?? 0), 0) },
      { label: 'طلبات بلا لقطة تكلفة', value: completedOrders.filter((order) => order.inventoryCostSnapshot === undefined).length },
      { label: 'الإيرادات اليدوية (ج.م)', value: revenues.reduce((sum, revenue) => sum + revenue.amount, 0) },
      { label: 'المصروفات التشغيلية (ج.م)', value: expenses.reduce((sum, expense) => sum + expense.amount, 0) },
      { label: 'المشتريات المعتمدة (ج.م) — منفصلة عن المصروفات', value: purchases.filter((invoice) => invoice.status === 'APPROVED').reduce((sum, invoice) => sum + invoice.total, 0) },
      { label: 'الأجور الأساسية (ج.م)', value: payrollStatements.reduce((sum, statement) => sum + statement.baseWages, 0) },
      { label: 'تكلفة العمل الإضافي (ج.م)', value: payrollStatements.reduce((sum, statement) => sum + statement.overtimeEarnings, 0) },
      { label: 'السلف المدفوعة (ج.م) — معروضة منفصلة', value: payrollStatements.reduce((sum, statement) => sum + statement.totalAdvances, 0) },
      { label: 'الديون القائمة حاليًا (ج.م)', value: debtData.totals.remainingAmount },
      { label: 'طلبات ملغية', value: reportOrders.filter((order) => order.status === 'CANCELLED').length },
      { label: 'رسوم الخدمة (ج.م)', value: completedOrders.reduce((sum, order) => sum + order.serviceFee, 0) },
      { label: 'الضريبة (ج.م)', value: completedOrders.reduce((sum, order) => sum + order.tax, 0) },
    ]);

    const ordersSheet = workbook.addWorksheet('الطلبات', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    ordersSheet.columns = [
      { header: 'رقم الطلب', key: 'number', width: 25 },
      { header: 'التاريخ والوقت', key: 'date', width: 24 },
      { header: 'النوع', key: 'type', width: 18 },
      { header: 'الحالة', key: 'status', width: 20 },
      { header: 'العميل', key: 'customer', width: 24 },
      { header: 'الطاولة', key: 'table', width: 14 },
      { header: 'الأصناف', key: 'items', width: 50 },
      { header: 'المجموع', key: 'subtotal', width: 16 },
      { header: 'الخدمة', key: 'service', width: 14 },
      { header: 'الضريبة', key: 'tax', width: 14 },
      { header: 'الإجمالي ج.م', key: 'total', width: 18 },
      { header: 'تكلفة المخزون المحفوظة ج.م', key: 'cost', width: 24 },
    ];
    ordersSheet.addRows(reportOrders.map((order) => ({
      number: order.orderNumber,
      date: order.createdAt,
      type: order.type === 'DINE_IN' ? 'داخل الكافيه' : 'تيك أواي',
      status: order.status,
      customer: order.customerName ?? '',
      table: order.tableNumber ?? '',
      items: order.items.map((item) => `${item.nameAr} × ${item.quantity}`).join('، '),
      subtotal: order.subtotal,
      service: order.serviceFee,
      tax: order.tax,
      total: order.total,
      cost: order.inventoryCostSnapshot ?? '',
    })));

    const stockSheet = workbook.addWorksheet('المخزون الحالي', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    stockSheet.columns = [
      { header: 'الاسم', key: 'name', width: 32 },
      { header: 'النوع', key: 'type', width: 18 },
      { header: 'الرصيد', key: 'quantity', width: 16 },
      { header: 'الوحدة', key: 'unit', width: 16 },
      { header: 'حد التنبيه', key: 'threshold', width: 16 },
      { header: 'متابعة المخزون', key: 'tracked', width: 20 },
    ];
    stockSheet.addRows(inventory.items.map((item) => ({
      name: item.name,
      type: item.type === 'product' ? 'صنف بيع' : 'خامة',
      quantity: item.quantity,
      unit: item.unit,
      threshold: item.lowStockThreshold,
      tracked: item.trackStock ? 'مفعّلة' : 'غير مفعّلة',
    })));

    const movementSheet = workbook.addWorksheet('حركة المخزون', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    movementSheet.columns = [
      { header: 'التاريخ والوقت', key: 'date', width: 24 },
      { header: 'الصنف', key: 'name', width: 32 },
      { header: 'النوع', key: 'type', width: 16 },
      { header: 'الكمية (+/-)', key: 'quantity', width: 18 },
      { header: 'سبب الحركة', key: 'reason', width: 20 },
      { header: 'رقم الطلب', key: 'reference', width: 26 },
      { header: 'ملاحظة', key: 'note', width: 36 },
      { header: 'المسؤول', key: 'performedBy', width: 24 },
      { header: 'الرصيد السابق', key: 'previous', width: 18 },
      { header: 'الرصيد الجديد', key: 'next', width: 18 },
    ];
    movementSheet.addRows(movements.map((movement) => ({
      date: movement.createdAt,
      name: movement.itemName,
      type: movement.itemType === 'product' ? 'صنف بيع' : 'خامة',
      quantity: movement.quantity,
      reason: movement.reason === 'sale' ? 'بيع' : movement.reason === 'cancellation' ? 'استرجاع إلغاء' : movement.reason === 'purchase' ? 'استلام مشتريات' : 'تعديل يدوي',
      reference: movement.referenceId ?? '',
      note: movement.note ?? '',
      performedBy: movement.performedBy ?? '',
      previous: movement.previousBalance ?? '',
      next: movement.newBalance ?? '',
    })));

    const revenueSheet = workbook.addWorksheet('الإيرادات اليدوية', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    revenueSheet.columns = [
      { header: 'التاريخ', key: 'date', width: 16 },
      { header: 'الشيفت', key: 'shift', width: 18 },
      { header: 'الموظف', key: 'employee', width: 24 },
      { header: 'الوصف', key: 'description', width: 40 },
      { header: 'المبلغ ج.م', key: 'amount', width: 18 },
      { header: 'المسجل', key: 'createdBy', width: 24 },
    ];
    revenueSheet.addRows(revenues.map((revenue) => ({
      date: revenue.date,
      shift: revenue.shiftType === 'DAY' ? 'نهاري' : 'ليلي',
      employee: revenue.username,
      description: revenue.description,
      amount: revenue.amount,
      createdBy: revenue.createdBy ?? revenue.username,
    })));

    const purchaseSheet = workbook.addWorksheet('المشتريات', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    purchaseSheet.columns = [
      { header: 'المورد', key: 'supplier', width: 28 },
      { header: 'رقم الفاتورة', key: 'number', width: 22 },
      { header: 'التاريخ', key: 'date', width: 16 },
      { header: 'الحالة', key: 'status', width: 16 },
      { header: 'الأصناف', key: 'items', width: 50 },
      { header: 'الإجمالي ج.م', key: 'total', width: 18 },
      { header: 'اعتمدها', key: 'approvedBy', width: 24 },
    ];
    purchaseSheet.addRows(purchases.map((invoice) => ({
      supplier: invoice.supplier,
      number: invoice.invoiceNumber,
      date: invoice.invoiceDate,
      status: invoice.status === 'APPROVED' ? 'معتمدة' : invoice.status === 'CANCELLED' ? 'ملغاة' : 'مسودة',
      items: invoice.items.map((item) => `${item.itemName} × ${item.quantity} ${item.unit} @ ${item.unitPrice}`).join('، '),
      total: invoice.total,
      approvedBy: invoice.approvedBy ?? '',
    })));

    const debtSheet = workbook.addWorksheet('الديون اليدوية', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    debtSheet.columns = [
      { header: 'الشخص أو المورد', key: 'person', width: 28 },
      { header: 'التاريخ', key: 'date', width: 16 },
      { header: 'السبب', key: 'reason', width: 24 },
      { header: 'الوصف', key: 'description', width: 36 },
      { header: 'أصل الدين', key: 'original', width: 18 },
      { header: 'المدفوع', key: 'paid', width: 18 },
      { header: 'المتبقي', key: 'remaining', width: 18 },
      { header: 'الحالة', key: 'status', width: 18 },
      { header: 'سجل الدفعات', key: 'payments', width: 50 },
    ];
    debtSheet.addRows(debts.map((debt) => ({
      person: debt.person,
      date: debt.debtDate,
      reason: debt.reason,
      description: debt.description,
      original: debt.originalAmount,
      paid: debt.totalPaid,
      remaining: debt.remainingAmount,
      status: debt.status,
      payments: debt.payments.map((payment) => `${payment.paymentDate}: ${payment.amount} — ${payment.description}`).join(' | '),
    })));

    const expensesSheet = workbook.addWorksheet('المصروفات', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    expensesSheet.columns = [
      { header: 'التاريخ', key: 'date', width: 16 },
      { header: 'النوع', key: 'category', width: 20 },
      { header: 'الوصف', key: 'description', width: 40 },
      { header: 'الشيفت', key: 'shift', width: 18 },
      { header: 'الموظف', key: 'employee', width: 24 },
      { header: 'المبلغ ج.م', key: 'amount', width: 18 },
    ];
    expensesSheet.addRows(expenses.map((expense) => ({
      date: expense.expenseDate,
      category: expense.category,
      description: expense.description,
      shift: expense.shiftType === 'DAY' ? 'نهاري' : 'ليلي',
      employee: expense.username,
      amount: expense.amount,
    })));

    const payrollSheet = workbook.addWorksheet('كشوف الرواتب', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    payrollSheet.columns = [
      { header: 'الموظف', key: 'employee', width: 26 },
      { header: 'ساعات العمل', key: 'hours', width: 18 },
      { header: 'الأجر الأساسي', key: 'base', width: 18 },
      { header: 'ساعات إضافية', key: 'overtimeHours', width: 18 },
      { header: 'أجر إضافي', key: 'overtime', width: 18 },
      { header: 'السلف', key: 'advances', width: 18 },
      { header: 'الصافي المستحق', key: 'net', width: 20 },
    ];
    payrollSheet.addRows(payrollStatements.map((statement) => ({
      employee: employeeAccounts.find((account) => account.id === statement.employeeId)?.username ?? statement.employeeId,
      hours: statement.regularHours,
      base: statement.baseWages,
      overtimeHours: statement.overtimeHours,
      overtime: statement.overtimeEarnings,
      advances: statement.totalAdvances,
      net: statement.netPay,
    })));

    const advancesSheet = workbook.addWorksheet('السلف', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    advancesSheet.columns = [
      { header: 'الموظف', key: 'employee', width: 26 },
      { header: 'التاريخ', key: 'date', width: 16 },
      { header: 'الوصف', key: 'description', width: 40 },
      { header: 'المبلغ ج.م', key: 'amount', width: 18 },
    ];
    advancesSheet.addRows(payrollStatements.flatMap((statement) => statement.advances.map((advance) => ({
      employee: employeeAccounts.find((account) => account.id === statement.employeeId)?.username ?? statement.employeeId,
      date: advance.date,
      description: advance.description,
      amount: advance.amount,
    }))));

    const overtimeSheet = workbook.addWorksheet('العمل الإضافي', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    overtimeSheet.columns = [
      { header: 'الموظف', key: 'employee', width: 26 },
      { header: 'التاريخ', key: 'date', width: 16 },
      { header: 'الوصف', key: 'description', width: 40 },
      { header: 'الساعات', key: 'hours', width: 16 },
      { header: 'أجر الساعة', key: 'rate', width: 18 },
      { header: 'الإجمالي ج.م', key: 'total', width: 18 },
    ];
    overtimeSheet.addRows(payrollStatements.flatMap((statement) => statement.overtimeEntries.map((entry) => ({
      employee: employeeAccounts.find((account) => account.id === statement.employeeId)?.username ?? statement.employeeId,
      date: entry.date,
      description: entry.description,
      hours: entry.hours,
      rate: entry.hourlyRate,
      total: entry.hours * entry.hourlyRate,
    }))));

    const recipeSheet = workbook.addWorksheet('تكلفة الوصفات', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    recipeSheet.columns = [
      { header: 'المنتج', key: 'product', width: 30 },
      { header: 'سعر البيع ج.م', key: 'price', width: 18 },
      { header: 'تكلفة الوصفة ج.م', key: 'cost', width: 20 },
      { header: 'الربح الإجمالي ج.م', key: 'profit', width: 22 },
      { header: 'هامش الربح %', key: 'margin', width: 18 },
      { header: 'المكونات', key: 'ingredients', width: 60 },
    ];
    const recipesByProduct = new Map(inventory.recipes.map((recipe) => [recipe.productId, recipe]));
    recipeSheet.addRows(catalog.products.map((product) => {
      const recipe = recipesByProduct.get(product.id);
      const cost = calculateRecipeCost(recipe, inventory.items);
      const price = getProductPrice(product);
      const ingredientNames = recipe?.ingredients.map((ingredient) => {
        const item = inventory.items.find((candidate) => candidate.id === ingredient.itemId);
        return `${item?.name ?? ingredient.itemId} × ${ingredient.quantity} ${item?.unit ?? ''}`;
      }).join('، ') ?? '';
      return {
        product: product.ar,
        price,
        cost: cost.totalCost ?? '',
        profit: cost.totalCost === undefined ? '' : price - cost.totalCost,
        margin: cost.totalCost === undefined || price === 0 ? '' : ((price - cost.totalCost) / price) * 100,
        ingredients: ingredientNames,
      };
    }));

    for (const sheet of workbook.worksheets) {
      const header = sheet.getRow(1);
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF435D32' } };
      header.alignment = { vertical: 'middle', horizontal: 'right' };
      sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + sheet.columnCount)}${sheet.rowCount}` };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `matcha-report-${url.searchParams.get('from')}-${url.searchParams.get('to')}.xlsx`;
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Unable to create report:', error);
    return NextResponse.json({ error: 'تعذر إنشاء تقرير Excel' }, { status: 500 });
  }
}
