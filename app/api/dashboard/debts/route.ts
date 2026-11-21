import { NextResponse } from 'next/server';
import { requireStaffRole } from '@/lib/staff-api';
import {
  createDebt,
  deleteDebt,
  DebtOperationError,
  listDebts,
  updateDebt,
} from '@/lib/debt-repository';
import { createDebtSchema, updateDebtSchema } from '@/lib/debt-validation';

function debtErrorResponse(error: unknown) {
  if (error instanceof DebtOperationError) {
    const status = error.code === 'DEBT_NOT_FOUND' || error.code === 'PAYMENT_NOT_FOUND' ? 404 : 409;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  return null;
}

export async function GET() {
  if (!await requireStaffRole(['ADMIN'])) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  try {
    return NextResponse.json(await listDebts());
  } catch (error) {
    console.error('Unable to load debts:', error);
    return NextResponse.json({ error: 'Unable to load debts' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const staff = await requireStaffRole(['ADMIN']);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const parsed = createDebtSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid debt payload' }, { status: 400 });
  try {
    return NextResponse.json({ debt: await createDebt(parsed.data, staff) }, { status: 201 });
  } catch (error) {
    const response = debtErrorResponse(error);
    if (response) return response;
    console.error('Unable to create debt:', error);
    return NextResponse.json({ error: 'Unable to create debt' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const staff = await requireStaffRole(['ADMIN']);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const body = await request.json().catch(() => null) as { id?: unknown } | null;
  if (!body || typeof body.id !== 'string' || !body.id.trim()) {
    return NextResponse.json({ error: 'Debt ID is required' }, { status: 400 });
  }
  const parsed = updateDebtSchema.safeParse(Object.fromEntries(
    Object.entries(body).filter(([key]) => key !== 'id'),
  ));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid debt payload' }, { status: 400 });
  try {
    const debt = await updateDebt(body.id, parsed.data, staff);
    return debt ? NextResponse.json({ debt }) : NextResponse.json({ error: 'Debt not found' }, { status: 404 });
  } catch (error) {
    const response = debtErrorResponse(error);
    if (response) return response;
    console.error('Unable to update debt:', error);
    return NextResponse.json({ error: 'Unable to update debt' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const staff = await requireStaffRole(['ADMIN']);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Debt ID is required' }, { status: 400 });
  try {
    if (!await deleteDebt(id, staff)) return NextResponse.json({ error: 'Debt not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Unable to delete debt:', error);
    return NextResponse.json({ error: 'Unable to delete debt' }, { status: 500 });
  }
}
