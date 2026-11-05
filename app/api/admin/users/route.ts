import { NextResponse } from 'next/server';
import { requireStaffRole } from '@/lib/staff-api';
import { createStaffAccount, deleteStaffAccount, listStaffAccounts, updateStaffAccount } from '@/lib/staff-user-repository';
import { z } from 'zod';

const userSchema = z.object({
  username: z.string().trim().min(3).max(80),
  email: z.string().email().max(254),
  password: z.string().min(8).max(1024),
  role: z.enum(['ADMIN', 'EMPLOYEE']).default('EMPLOYEE'),
  shiftType: z.enum(['DAY', 'NIGHT']).default('DAY'),
});
const updateUserSchema = z.object({
  id: z.string().min(1),
  username: z.string().trim().min(3).max(80).optional(),
  email: z.string().email().max(254).optional(),
  password: z.string().min(8).max(1024).optional(),
  role: z.enum(['ADMIN', 'EMPLOYEE']).optional(),
  shiftType: z.enum(['DAY', 'NIGHT']).optional(),
  active: z.boolean().optional(),
});

export async function GET() {
  if (!await requireStaffRole(['ADMIN'])) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  try {
    return NextResponse.json({ users: await listStaffAccounts() });
  } catch (error) {
    console.error('Unable to list staff accounts:', error);
    return NextResponse.json({ error: 'تعذر تحميل المستخدمين' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!await requireStaffRole(['ADMIN'])) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const parsed = userSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'بيانات الحساب غير صحيحة' }, { status: 400 });
  try {
    return NextResponse.json({ user: await createStaffAccount(parsed.data) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذر إنشاء الحساب' }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  const staff = await requireStaffRole(['ADMIN']);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const parsed = updateUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'بيانات الحساب غير صحيحة' }, { status: 400 });
  if (parsed.data.active === false && parsed.data.id === staff.id) return NextResponse.json({ error: 'لا يمكن إيقاف حسابك أثناء تسجيل الدخول' }, { status: 400 });
  const user = await updateStaffAccount(parsed.data.id, parsed.data);
  return user ? NextResponse.json({ user }) : NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 });
}

export async function DELETE(request: Request) {
  const staff = await requireStaffRole(['ADMIN']);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const id = new URL(request.url).searchParams.get('id');
  if (id === staff.id) return NextResponse.json({ error: 'لا يمكن حذف حسابك أثناء تسجيل الدخول' }, { status: 400 });
  if (!id || !await deleteStaffAccount(id)) return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
