import { NextResponse } from 'next/server';
import { getOrderRepository } from '@/lib/order-repository';
import { applyOrderStatusTransition, getOrderStatusLabel } from '@/lib/store';
import { requireStaffRole } from '@/lib/staff-api';
import { dashboardStatusSchema } from '@/lib/validation';
import { getActiveShift, listShifts } from '@/lib/shift-repository';
import { getShiftsCoveringTimestamp } from '@/lib/shift-time';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffRole();
  if (!staff) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = dashboardStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid status payload' }, { status: 400 });
  }

  try {
    const { id } = await params;
    const repository = getOrderRepository();
    const order = await repository.getById(id);
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const currentStatus = order.status;
    const nextStatus = parsed.data.status;
    if (!applyOrderStatusTransition(currentStatus, nextStatus)) {
      return NextResponse.json({ error: `Invalid status transition from ${getOrderStatusLabel(currentStatus)} to ${getOrderStatusLabel(nextStatus)}` }, { status: 400 });
    }

    let attribution: { shiftId: string; employeeId: string; employeeName: string } | undefined;
    let shiftAttributionWarning: string | undefined;
    const updatedAt = new Date().toISOString();
    if (staff.role === 'EMPLOYEE') {
      const activeShift = await getActiveShift(staff.id);
      if (!activeShift) {
        return NextResponse.json({ error: 'ابدأ الشيفت قبل متابعة الطلبات.' }, { status: 409 });
      }
      if (nextStatus === 'COMPLETED' && !order.shiftId) {
        attribution = { shiftId: activeShift.id, employeeId: staff.id, employeeName: staff.username };
      }
    } else if (nextStatus === 'COMPLETED' && !order.shiftId) {
      const coveringShifts = getShiftsCoveringTimestamp(await listShifts(), updatedAt);
      if (coveringShifts.length === 1) {
        const [shift] = coveringShifts;
        attribution = { shiftId: shift.id, employeeId: shift.employeeId, employeeName: shift.username };
      } else {
        shiftAttributionWarning = coveringShifts.length
          ? 'تم إكمال الطلب، لكن لم يُربط بشيفت لأن أكثر من موظف كان يعمل في الوقت نفسه.'
          : 'تم إكمال الطلب، لكن لم يكن هناك شيفت موظف نشط لربطه بالتقرير.';
      }
    }

    const updatedOrder = await repository.updateStatus(id, currentStatus, nextStatus, updatedAt, attribution);

    if (!updatedOrder) {
      return NextResponse.json({ error: 'Order status changed; reload and try again' }, { status: 409 });
    }

    return NextResponse.json({ ok: true, order: updatedOrder, shiftAttributionWarning });
  } catch (error) {
    console.error('Unable to update order:', error);
    return NextResponse.json({ error: 'Unable to update order' }, { status: 500 });
  }
}
