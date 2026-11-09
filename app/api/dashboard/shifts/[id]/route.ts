import { NextResponse } from 'next/server';
import { getRequestStaff } from '@/lib/staff-api';
import { listExpenses } from '@/lib/expense-repository';
import { getOrderRepository } from '@/lib/order-repository';
import { getShiftById, listShifts } from '@/lib/shift-repository';
import { getShiftReportOrders } from '@/lib/shift-attribution';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getRequestStaff();
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (staff.role !== 'ADMIN') return NextResponse.json({ error: 'غير مسموح بعرض تقارير الشيفتات' }, { status: 403 });

  try {
    const { id } = await params;
    const shift = await getShiftById(id);
    if (!shift) return NextResponse.json({ error: 'الشيفت غير موجود' }, { status: 404 });
    if (!shift.endedAt) return NextResponse.json({ error: 'يتاح تقرير الشيفت بعد انتهائه' }, { status: 409 });

    const [orders, expenses, shifts] = await Promise.all([
      getOrderRepository().list(),
      listExpenses({ shiftId: shift.id }),
      listShifts(),
    ]);
    const report = getShiftReportOrders(orders, shift, shifts);
    return NextResponse.json({
      shift,
      orders: report.orders,
      expenses,
      unattributedOrderCount: report.unattributedOrderCount,
    });
  } catch (error) {
    console.error('Unable to load shift receipt:', error);
    return NextResponse.json({ error: 'تعذر تحميل بيانات الشيفت' }, { status: 500 });
  }
}
