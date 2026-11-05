import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getStaffIdentity, STAFF_SESSION_COOKIE } from '@/lib/staff-auth';

export async function GET() {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  const staff = getStaffIdentity(token);
  return NextResponse.json({ authenticated: Boolean(staff), staff });
}
