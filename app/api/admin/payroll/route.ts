import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { requireStaffRole } from '@/lib/staff-api';
import { listStaffAccounts } from '@/lib/staff-user-repository';
import {
  createPayrollAdvance,
  createPayrollOvertime,
  deletePayrollAdvance,
  deletePayrollOvertime,
  getPayrollRecord,
  getPayrollStatement,
  listPayrollRecords,
  updatePayrollProfile,
} from '@/lib/payroll-repository';
import { isValidPayrollDate } from '@/lib/payroll-statement';
import type { PayrollProfile } from '@/lib/payroll-types';

const dateSchema = z.string().refine(isValidPayrollDate);
const employeeIdSchema = z.string().trim().min(1).max(200);
const profileSchema = z.object({
  employeeId: employeeIdSchema,
  jobTitle: z.string().trim().max(120),
  hourlyRate: z.number().finite().min(0).max(1_000_000),
  hireDate: z.union([z.literal(''), dateSchema]),
  additionalInfo: z.string().max(2000),
});
const advanceSchema = z.object({
  type: z.literal('advance'),
  employeeId: employeeIdSchema,
  amount: z.number().finite().positive().max(10_000_000),
  date: dateSchema,
  description: z.string().trim().min(2).max(500),
});
const overtimeSchema = z.object({
  type: z.literal('overtime'),
  employeeId: employeeIdSchema,
  date: dateSchema,
  hours: z.number().finite().positive().max(1000),
  hourlyRate: z.number().finite().positive().max(1_000_000),
  description: z.string().trim().min(2).max(500),
});
const deleteSchema = z.object({
  type: z.enum(['advance', 'overtime']),
  employeeId: employeeIdSchema,
  id: z.string().trim().min(1).max(200),
});

async function getEmployee(employeeId: string) {
  const accounts = await listStaffAccounts();
  return accounts.find((account) => account.id === employeeId && account.role === 'EMPLOYEE') ?? null;
}

export async function GET(request: Request) {
  if (!await requireStaffRole(['ADMIN'])) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const employeeId = params.get('employeeId');
  try {
    const accounts = (await listStaffAccounts()).filter((account) => account.role === 'EMPLOYEE');
    if (!employeeId) {
      const records = await listPayrollRecords(accounts.map((account) => account.id));
      const recordsById = new Map(records.map((record) => [record.employeeId, record]));
      return NextResponse.json({
        employees: await Promise.all(accounts.map(async (account) => ({
          id: account.id,
          username: account.username,
          email: account.email,
          active: account.active,
          profile: recordsById.get(account.id)?.profile ?? (await getPayrollRecord(account.id)).profile,
        }))),
      });
    }

    const range = z.object({ startDate: dateSchema, endDate: dateSchema }).safeParse({
      startDate: params.get('startDate'),
      endDate: params.get('endDate'),
    });
    if (!range.success || range.data.startDate > range.data.endDate) {
      return NextResponse.json({ error: 'نطاق تاريخ كشف الراتب غير صالح' }, { status: 400 });
    }
    const employee = accounts.find((account) => account.id === employeeId);
    if (!employee) return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 });
    const [record, statement] = await Promise.all([
      getPayrollRecord(employee.id),
      getPayrollStatement(employee.id, range.data.startDate, range.data.endDate),
    ]);
    return NextResponse.json({
      employee: {
        id: employee.id,
        username: employee.username,
        active: employee.active,
        profile: record.profile,
      },
      statement,
    });
  } catch (error) {
    console.error('Unable to load payroll:', error);
    return NextResponse.json({ error: 'تعذر تحميل بيانات الرواتب' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const staff = await requireStaffRole(['ADMIN']);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'بيانات ملف الراتب غير صحيحة' }, { status: 400 });
  try {
    const employee = await getEmployee(parsed.data.employeeId);
    if (!employee) return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 });
    const { employeeId, ...profile } = parsed.data;
    const record = await updatePayrollProfile(employeeId, profile as PayrollProfile, staff);
    return NextResponse.json({ profile: record.profile, active: employee.active });
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      const fields = Object.keys(error.errors).join(', ');
      return NextResponse.json({ error: `بيانات ملف الراتب غير صحيحة: ${fields}` }, { status: 400 });
    }
    console.error('Unable to update payroll profile:', error);
    return NextResponse.json({ error: 'تعذر تحديث ملف الراتب' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const staff = await requireStaffRole(['ADMIN']);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = z.discriminatedUnion('type', [advanceSchema, overtimeSchema]).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'بيانات حركة الراتب غير صحيحة' }, { status: 400 });
  try {
    if (!await getEmployee(parsed.data.employeeId)) {
      return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 });
    }
    if (parsed.data.type === 'advance') {
      const { employeeId, amount, date, description } = parsed.data;
      const advance = await createPayrollAdvance(employeeId, { amount, date, description }, staff);
      return NextResponse.json({ advance }, { status: 201 });
    }
    const { employeeId, date, hours, hourlyRate, description } = parsed.data;
    const overtime = await createPayrollOvertime(employeeId, { date, hours, hourlyRate, description }, staff);
    return NextResponse.json({ overtime }, { status: 201 });
  } catch (error) {
    console.error('Unable to create payroll entry:', error);
    return NextResponse.json({ error: 'تعذر حفظ حركة الراتب' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const staff = await requireStaffRole(['ADMIN']);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'بيانات الحذف غير صحيحة' }, { status: 400 });
  try {
    const deleted = parsed.data.type === 'advance'
      ? await deletePayrollAdvance(parsed.data.employeeId, parsed.data.id, staff)
      : await deletePayrollOvertime(parsed.data.employeeId, parsed.data.id, staff);
    return deleted
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'الحركة غير موجودة' }, { status: 404 });
  } catch (error) {
    console.error('Unable to delete payroll entry:', error);
    return NextResponse.json({ error: 'تعذر حذف حركة الراتب' }, { status: 500 });
  }
}
