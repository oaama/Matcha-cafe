import { NextResponse } from 'next/server';
import { getCatalog, saveCatalog } from '@/lib/catalog-repository';
import { requireStaffRole } from '@/lib/staff-api';
import { catalogSchema } from '@/lib/validation';

async function isStaff() {
  return Boolean(await requireStaffRole(['ADMIN']));
}

export async function GET() {
  if (!await isStaff()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json({ catalog: await getCatalog() });
  } catch (error) {
    console.error('Unable to load catalog:', error);
    return NextResponse.json({ error: 'Unable to load catalog' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!await isStaff()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const parsed = catalogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid catalog data' }, { status: 400 });
  }

  try {
    const catalog = await saveCatalog(parsed.data);
    return NextResponse.json({ catalog });
  } catch (error) {
    console.error('Unable to save catalog:', error);
    return NextResponse.json({ error: 'Unable to save catalog' }, { status: 500 });
  }
}
