import { NextResponse } from 'next/server';
import { getRequestStaff, requireStaffRole } from '@/lib/staff-api';
import { endShift, getActiveShift, listShifts, startShift } from '@/lib/shift-repository';

export async function GET() {
  const staff = await requireStaffRole();
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (staff.role === 'ADMIN') return NextResponse.json({ shifts: await listShifts(), active: null });
  const [active, shifts] = await Promise.all([getActiveShift(staff.id), listShifts(staff.id)]);
  return NextResponse.json({ active, shifts });
}

export async function POST(request: Request) {
  const staff = await getRequestStaff();
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (staff.role !== 'EMPLOYEE') return NextResponse.json({ error: 'غير مسموح بهذا الإجراء' }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { action?: string };
  if (body.action === 'start') {
    const result = await startShift({ employeeId: staff.id, username: staff.username, shiftType: staff.shiftType });
    if (result.completedToday) {
      return NextResponse.json({ error: 'انتهى شيفتك اليوم، تقدر تبدأ شيفت جديد بكرة.', completedToday: true }, { status: 409 });
    }
    return NextResponse.json(result, { status: result.created ? 201 : 409 });
  }
  if (body.action === 'end') {
    const shift = await endShift(staff.id);
    if (!shift) return NextResponse.json({ error: 'لا يوجد شيفت نشط' }, { status: 409 });
    return NextResponse.json({ shift });
  }
  return NextResponse.json({ error: 'إجراء غير صالح' }, { status: 400 });
}
