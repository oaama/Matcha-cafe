import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getStaffIdentity, STAFF_SESSION_COOKIE } from '@/lib/staff-auth';
import { startShift } from '@/lib/shift-repository';

export async function GET() {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  const staff = getStaffIdentity(token);
  if (!staff || staff.role !== 'EMPLOYEE') {
    return NextResponse.json({ authenticated: Boolean(staff), staff });
  }
  try {
    const activeShift = (await startShift({
      employeeId: staff.id,
      username: staff.username,
      shiftType: staff.shiftType,
    })).shift;
    return NextResponse.json({ authenticated: true, staff, activeShift });
  } catch (error) {
    console.error('Unable to start staff shift while restoring session:', error);
    return NextResponse.json({ authenticated: true, staff, error: 'تعذر بدء الشيفت تلقائيًا.' }, { status: 503 });
  }
}
