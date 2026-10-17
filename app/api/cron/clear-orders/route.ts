import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/database';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { OrderModel } from '@/lib/order-model';

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized cron request' }, { status: 401 });
  }

  if (process.env.DATA_PROVIDER !== 'mongodb') {
    return NextResponse.json({ error: 'MongoDB data provider is required for cleanup' }, { status: 503 });
  }

  try {
    await connectToDatabase();
    const result = await OrderModel.deleteMany({});
    return NextResponse.json({ ok: true, deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Unable to clear weekly orders:', error);
    return NextResponse.json({ error: 'Unable to clear orders' }, { status: 500 });
  }
}
