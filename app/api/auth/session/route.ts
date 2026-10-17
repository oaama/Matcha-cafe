import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isValidStaffSessionToken, STAFF_SESSION_COOKIE } from '@/lib/staff-auth';

export async function GET() {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  return NextResponse.json({ authenticated: isValidStaffSessionToken(token) });
}
