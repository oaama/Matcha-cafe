import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getOrderRepository } from '@/lib/order-repository';
import { isValidStaffSessionToken, STAFF_SESSION_COOKIE } from '@/lib/staff-auth';
import { isMockDataMode } from '@/lib/data-mode';

export async function GET() {
  if (!isValidStaffSessionToken((await cookies()).get(STAFF_SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const orders = await getOrderRepository().list();
    return NextResponse.json({ orders, demoMode: isMockDataMode() });
  } catch (error) {
    console.error('Unable to load orders:', error);
    return NextResponse.json({ error: 'Unable to load orders' }, { status: 500 });
  }
}
