import { NextResponse } from 'next/server';
import { requireStaffRole } from '@/lib/staff-api';
import { endShift, getActiveShift, listShifts, startShift } from '@/lib/shift-repository';

export async function GET() {
  const staff = await requireStaffRole();
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (staff.role === 'ADMIN') return NextResponse.json({ shifts: await listShifts(), active: null });
  return NextResponse.json({ active: await getActiveShift(staff.id), shifts: [] });
}

export async function POST(request: Request) {
  const staff = await requireStaffRole(['EMPLOYEE']);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { action?: string };
  if (body.action === 'start') {
    const result = await startShift({ employeeId: staff.id, username: staff.username, shiftType: staff.shiftType });
    return NextResponse.json(result, { status: result.created ? 201 : 409 });
  }
  if (body.action === 'end') {
    const shift = await endShift(staff.id);
    if (!shift) return NextResponse.json({ error: 'لا يوجد شيفت نشط' }, { status: 409 });
    return NextResponse.json({ shift });
  }
  return NextResponse.json({ error: 'إجراء غير صالح' }, { status: 400 });
}
