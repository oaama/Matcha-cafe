import { NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteManualRevenue, createManualRevenue, listManualRevenue, updateManualRevenue } from '@/lib/revenue-repository';
import { getRequestStaff } from '@/lib/staff-api';
import { getActiveShift, getShiftById } from '@/lib/shift-repository';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const createSchema = z.object({
  shiftId: z.string().trim().min(1).max(200).optional(),
  amount: z.number().finite().positive().max(10_000_000)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8),
  date: dateSchema,
  description: z.string().trim().min(2).max(500),
});
const updateSchema = z.object({
  id: z.string().trim().min(1).max(200),
  amount: createSchema.shape.amount.optional(),
  date: dateSchema.optional(),
  description: createSchema.shape.description.optional(),
}).refine((value) => value.amount !== undefined || value.date !== undefined || value.description !== undefined);

export async function GET(request: Request) {
  const staff = await getRequestStaff();
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const from = params.get('from') || undefined;
  const to = params.get('to') || undefined;
  const shiftId = params.get('shiftId') || undefined;
  if ((from && !dateSchema.safeParse(from).success)
    || (to && !dateSchema.safeParse(to).success)
    || (from && to && from > to)
    || (shiftId && shiftId.length > 200)) {
    return NextResponse.json({ error: 'نطاق التاريخ غير صالح' }, { status: 400 });
  }
  try {
    const records = await listManualRevenue({
      from,
      to,
      shiftId,
      ...(staff.role === 'EMPLOYEE' ? { employeeId: staff.id } : {}),
    });
    const total = records.reduce((sum, record) => sum + record.amount, 0);
    const byShift = Object.values(records.reduce<Record<string, { shiftId: string; username: string; shiftType: string; total: number }>>((result, record) => {
      const current = result[record.shiftId] ?? {
        shiftId: record.shiftId,
        username: record.username,
        shiftType: record.shiftType,
        total: 0,
      };
      current.total = Math.round((current.total + record.amount) * 100) / 100;
      result[record.shiftId] = current;
      return result;
    }, {}));
    const daily = records.reduce<Record<string, number>>((result, record) => {
      result[record.date] = Math.round(((result[record.date] ?? 0) + record.amount) * 100) / 100;
      return result;
    }, {});
    return NextResponse.json({ revenues: records, total, byShift, daily });
  } catch (error) {
    console.error('Unable to load manual revenue:', error);
    return NextResponse.json({ error: 'تعذر تحميل الإيرادات اليدوية' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const staff = await getRequestStaff();
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'بيانات الإيراد غير صالحة' }, { status: 400 });

  try {
    const shift = staff.role === 'EMPLOYEE'
      ? await getActiveShift(staff.id)
      : parsed.data.shiftId ? await getShiftById(parsed.data.shiftId) : null;
    if (!shift) {
      return NextResponse.json({ error: staff.role === 'EMPLOYEE' ? 'ابدأ شيفتك قبل تسجيل الإيراد اليدوي' : 'اختر شيفتًا مسجلًا للإيراد' }, { status: 409 });
    }
    if (staff.role === 'EMPLOYEE' && parsed.data.shiftId && parsed.data.shiftId !== shift.id) {
      return NextResponse.json({ error: 'يمكنك تسجيل إيراد شيفتك النشط فقط' }, { status: 403 });
    }
    const revenue = await createManualRevenue({
      amount: parsed.data.amount,
      date: parsed.data.date,
      description: parsed.data.description,
      shiftId: shift.id,
      shiftType: shift.shiftType,
      employeeId: shift.employeeId,
      username: shift.username,
    }, staff);
    return NextResponse.json({ revenue }, { status: 201 });
  } catch (error) {
    console.error('Unable to create manual revenue:', error);
    return NextResponse.json({ error: 'تعذر تسجيل الإيراد اليدوي' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const staff = await getRequestStaff();
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (staff.role !== 'ADMIN') return NextResponse.json({ error: 'لا تملك صلاحية تعديل الإيرادات' }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'بيانات التعديل غير صالحة' }, { status: 400 });
  try {
    const { id, ...input } = parsed.data;
    const revenue = await updateManualRevenue(id, input, staff);
    return revenue ? NextResponse.json({ revenue }) : NextResponse.json({ error: 'الإيراد غير موجود' }, { status: 404 });
  } catch (error) {
    console.error('Unable to update manual revenue:', error);
    return NextResponse.json({ error: 'تعذر تعديل الإيراد' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const staff = await getRequestStaff();
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (staff.role !== 'ADMIN') return NextResponse.json({ error: 'لا تملك صلاحية حذف الإيرادات' }, { status: 403 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id || id.length > 200) return NextResponse.json({ error: 'معرف الإيراد غير صالح' }, { status: 400 });
  try {
    if (!await deleteManualRevenue(id, staff)) return NextResponse.json({ error: 'الإيراد غير موجود' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Unable to delete manual revenue:', error);
    return NextResponse.json({ error: 'تعذر حذف الإيراد' }, { status: 500 });
  }
}
