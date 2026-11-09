import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaffRole } from '@/lib/staff-api';
import { createExpense, deleteExpense, listExpenses, updateExpense } from '@/lib/expense-repository';
import { getActiveShift } from '@/lib/shift-repository';

const categories = ['ELECTRICITY', 'WATER', 'FOOD', 'SUPPLIES', 'MAINTENANCE', 'RENT', 'OTHER'] as const;
const expenseSchema = z.object({
  amount: z.number().finite().positive().max(10_000_000),
  category: z.enum(categories),
  description: z.string().trim().min(2).max(500),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shiftType: z.enum(['DAY', 'NIGHT']).optional(),
});

export async function GET(request: Request) {
  const staff = await requireStaffRole();
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const date = new URL(request.url).searchParams.get('date') ?? undefined;
  try {
    const expenses = await listExpenses(staff.role === 'ADMIN' ? { expenseDate: date } : { expenseDate: date, employeeId: staff.id });
    return NextResponse.json({ expenses });
  } catch (error) {
    console.error('Unable to load expenses:', error);
    return NextResponse.json({ error: 'تعذر تحميل المصروفات' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const staff = await requireStaffRole();
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = expenseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'بيانات المصروف غير صحيحة' }, { status: 400 });
  try {
    const activeShift = staff.role === 'EMPLOYEE' ? await getActiveShift(staff.id) : null;
    if (staff.role === 'EMPLOYEE' && !activeShift) {
      return NextResponse.json({ error: 'ابدأ الشيفت قبل تسجيل المصروف.' }, { status: 409 });
    }
    const expense = await createExpense({
      ...parsed.data,
      shiftType: staff.role === 'EMPLOYEE' ? staff.shiftType : parsed.data.shiftType ?? staff.shiftType,
      shiftId: activeShift?.id,
      employeeId: staff.id,
      username: staff.username,
    });
    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    console.error('Unable to create expense:', error);
    return NextResponse.json({ error: 'تعذر حفظ المصروف' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!await requireStaffRole(['ADMIN'])) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const body = await request.json().catch(() => null) as { id?: string } & Partial<z.infer<typeof expenseSchema>> | null;
  if (!body?.id) return NextResponse.json({ error: 'معرف المصروف مطلوب' }, { status: 400 });
  const parsed = expenseSchema.partial().safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'بيانات المصروف غير صحيحة' }, { status: 400 });
  const expense = await updateExpense(body.id, parsed.data);
  return expense ? NextResponse.json({ expense }) : NextResponse.json({ error: 'المصروف غير موجود' }, { status: 404 });
}

export async function DELETE(request: Request) {
  if (!await requireStaffRole(['ADMIN'])) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !await deleteExpense(id)) return NextResponse.json({ error: 'المصروف غير موجود' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
