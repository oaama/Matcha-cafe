import { NextResponse } from 'next/server';
import { requireStaffRole } from '@/lib/staff-api';
import {
  addDebtPayment,
  DebtOperationError,
} from '@/lib/debt-repository';
import { createDebtPaymentSchema } from '@/lib/debt-validation';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffRole(['ADMIN']);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const parsed = createDebtPaymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payment payload' }, { status: 400 });
  try {
    const { id } = await params;
    const debt = await addDebtPayment(id, parsed.data, staff);
    return debt ? NextResponse.json({ debt }, { status: 201 }) : NextResponse.json({ error: 'Debt not found' }, { status: 404 });
  } catch (error) {
    if (error instanceof DebtOperationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error('Unable to record debt payment:', error);
    return NextResponse.json({ error: 'Unable to record debt payment' }, { status: 500 });
  }
}
