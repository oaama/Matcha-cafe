import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import { getCatalog } from '@/lib/catalog-repository';
import { requireStaffRole } from '@/lib/staff-api';
import { getInventoryData, getInventoryMovements } from '@/lib/inventory-repository';
import { getOrderRepository } from '@/lib/order-repository';

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
    const [orders, catalog] = await Promise.all([
      getOrderRepository().list(),
      getCatalog(),
    ]);
    const [inventory, movements] = await Promise.all([
      getInventoryData(catalog.products),
      getInventoryMovements(from, to),
    ]);
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
    ];
    movementSheet.addRows(movements.map((movement) => ({
      date: movement.createdAt,
      name: movement.itemName,
      type: movement.itemType === 'product' ? 'صنف بيع' : 'خامة',
      quantity: movement.quantity,
      reason: movement.reason === 'sale' ? 'بيع' : movement.reason === 'cancellation' ? 'استرجاع إلغاء' : 'تعديل يدوي',
      reference: movement.referenceId ?? '',
      note: movement.note ?? '',
    })));

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
