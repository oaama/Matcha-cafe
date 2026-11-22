import { NextResponse } from 'next/server';
import { requireStaffRole } from '@/lib/staff-api';
import { getOverheadConfig, updateOverheadConfig } from '@/lib/overhead-settings';
import { overheadConfigSchema } from '@/lib/validation';

export async function GET() {
  if (!await requireStaffRole(['ADMIN'])) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json({ config: await getOverheadConfig() });
  } catch (error) {
    console.error('Unable to load overhead settings:', error);
    return NextResponse.json({ error: 'تعذر تحميل إعدادات التشغيل' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!await requireStaffRole(['ADMIN'])) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const parsed = overheadConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'قيم إعدادات التشغيل غير صالحة' }, { status: 400 });
  }

  try {
    const config = await updateOverheadConfig(parsed.data);
    return NextResponse.json({ config });
  } catch (error) {
    console.error('Unable to save overhead settings:', error);
    return NextResponse.json({ error: 'تعذر حفظ إعدادات التشغيل' }, { status: 500 });
  }
}
