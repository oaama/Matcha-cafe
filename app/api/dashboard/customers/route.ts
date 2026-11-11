import { NextResponse } from 'next/server';
import { getOrderRepository } from '@/lib/order-repository';
import { buildCustomerDirectory, listCustomerFollowUps, normalizeCustomerPhone, updateCustomerFollowUp } from '@/lib/customer-repository';
import { requireStaffRole } from '@/lib/staff-api';
import { customerFollowUpSchema } from '@/lib/validation';

export async function GET() {
  if (!await requireStaffRole()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const [orders, followUps] = await Promise.all([
      getOrderRepository().list(),
      listCustomerFollowUps(),
    ]);
    return NextResponse.json({ customers: buildCustomerDirectory(orders, followUps) });
  } catch (error) {
    console.error('Unable to load customer directory:', error);
    return NextResponse.json({ error: 'تعذر تحميل سجل العملاء' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!await requireStaffRole()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const parsed = customerFollowUpSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'بيانات المتابعة غير صالحة' }, { status: 400 });
  try {
    const { phoneKey, ...update } = parsed.data;
    if (!normalizeCustomerPhone(phoneKey)) return NextResponse.json({ error: 'رقم هاتف العميل غير صالح' }, { status: 400 });
    const followUp = await updateCustomerFollowUp(phoneKey, update);
    return NextResponse.json({ followUp });
  } catch (error) {
    console.error('Unable to update customer follow-up:', error);
    return NextResponse.json({ error: 'تعذر حفظ متابعة العميل' }, { status: 500 });
  }
}
