import { NextResponse } from 'next/server';
import { getRequestStaff } from '@/lib/staff-api';
import { listExpenses } from '@/lib/expense-repository';
import { getOrderRepository } from '@/lib/order-repository';
import { getShiftById } from '@/lib/shift-repository';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getRequestStaff();
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const shift = await getShiftById(id);
    if (!shift) return NextResponse.json({ error: 'الشيفت غير موجود' }, { status: 404 });
    if (staff.role !== 'ADMIN' && shift.employeeId !== staff.id) {
      return NextResponse.json({ error: 'غير مسموح بعرض هذا الشيفت' }, { status: 403 });
    }

    const [orders, expenses] = await Promise.all([
      getOrderRepository().list(),
      listExpenses({ shiftId: shift.id }),
    ]);
    return NextResponse.json({
      shift,
      orders: orders.filter((order) => order.shiftId === shift.id && order.status === 'COMPLETED'),
      expenses,
    });
  } catch (error) {
    console.error('Unable to load shift receipt:', error);
    return NextResponse.json({ error: 'تعذر تحميل بيانات الشيفت' }, { status: 500 });
  }
}
