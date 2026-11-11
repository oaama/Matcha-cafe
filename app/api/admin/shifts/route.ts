import { NextResponse } from 'next/server';
import { requireStaffRole } from '@/lib/staff-api';
import { listShifts, reactivateShift } from '@/lib/shift-repository';

export async function GET() {
  if (!await requireStaffRole(['ADMIN'])) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  return NextResponse.json({ shifts: await listShifts() });
}

export async function PATCH(request: Request) {
  if (!await requireStaffRole(['ADMIN'])) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { action?: string; shiftId?: string };
  if (body.action !== 'reactivate' || typeof body.shiftId !== 'string' || !body.shiftId.trim()) {
    return NextResponse.json({ error: 'طلب استعادة الشيفت غير صالح.' }, { status: 400 });
  }

  const result = await reactivateShift(body.shiftId);
  if (!result.shift) {
    const status = result.reason === 'not-found' ? 404 : 409;
    const error = result.reason === 'not-found'
      ? 'الشيفت غير موجود.'
      : result.reason === 'not-latest'
        ? 'لا يمكن استعادة الشيفت لوجود شيفت أحدث للموظف.'
        : result.reason === 'employee-has-active-shift'
          ? 'لدى الموظف شيفت نشط بالفعل.'
          : 'الشيفت نشط بالفعل.';
    return NextResponse.json({ error }, { status });
  }

  return NextResponse.json({ shift: result.shift });
}
