import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getStaffIdentity, STAFF_SESSION_COOKIE } from '@/lib/staff-auth';
import { getActiveShift } from '@/lib/shift-repository';

export async function GET() {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  const staff = getStaffIdentity(token);
  const activeShift = staff?.role === 'EMPLOYEE' ? await getActiveShift(staff.id) : null;
  return NextResponse.json({ authenticated: Boolean(staff), staff, activeShift });
}
