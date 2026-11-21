import { NextResponse } from 'next/server';
import { requireStaffRole } from '@/lib/staff-api';
import {
  DebtOperationError,
  deleteDebtPayment,
  updateDebtPayment,
} from '@/lib/debt-repository';
import { updateDebtPaymentSchema } from '@/lib/debt-validation';

function errorResponse(error: unknown) {
  if (!(error instanceof DebtOperationError)) return null;
  const status = error.code === 'PAYMENT_NOT_FOUND' || error.code === 'DEBT_NOT_FOUND' ? 404 : 409;
  return NextResponse.json({ error: error.message, code: error.code }, { status });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const staff = await requireStaffRole(['ADMIN']);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const parsed = updateDebtPaymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payment payload' }, { status: 400 });
  try {
    const { id, paymentId } = await params;
    const debt = await updateDebtPayment(id, paymentId, parsed.data, staff);
    return debt ? NextResponse.json({ debt }) : NextResponse.json({ error: 'Debt not found' }, { status: 404 });
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    console.error('Unable to update debt payment:', error);
    return NextResponse.json({ error: 'Unable to update debt payment' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const staff = await requireStaffRole(['ADMIN']);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  try {
    const { id, paymentId } = await params;
    const debt = await deleteDebtPayment(id, paymentId, staff);
    return debt ? NextResponse.json({ debt }) : NextResponse.json({ error: 'Debt not found' }, { status: 404 });
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    console.error('Unable to delete debt payment:', error);
    return NextResponse.json({ error: 'Unable to delete debt payment' }, { status: 500 });
  }
}
