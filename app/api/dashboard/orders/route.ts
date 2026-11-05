import { NextResponse } from 'next/server';
import { getOrderRepository } from '@/lib/order-repository';
import { requireStaffRole } from '@/lib/staff-api';
import { isMockDataMode } from '@/lib/data-mode';

export async function GET() {
  if (!await requireStaffRole()) {
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
