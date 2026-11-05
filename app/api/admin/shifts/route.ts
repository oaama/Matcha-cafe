import { NextResponse } from 'next/server';
import { requireStaffRole } from '@/lib/staff-api';
import { listShifts } from '@/lib/shift-repository';

export async function GET() {
  if (!await requireStaffRole(['ADMIN'])) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  return NextResponse.json({ shifts: await listShifts() });
}
