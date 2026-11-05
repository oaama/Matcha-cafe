import { NextResponse } from 'next/server';
import { requireStaffRole } from '@/lib/staff-api';
import { getPricingSettings, updatePricingSettings } from '@/lib/pricing-settings';
import { pricingSettingsSchema } from '@/lib/validation';

async function isStaff() {
  return Boolean(await requireStaffRole(['ADMIN']));
}

export async function GET() {
  if (!await isStaff()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json({ settings: await getPricingSettings() });
  } catch (error) {
    console.error('Unable to load pricing settings:', error);
    return NextResponse.json({ error: 'Unable to load pricing settings' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!await isStaff()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const parsed = pricingSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid pricing settings. Rates must be between 0 and 100.' }, { status: 400 });
  }

  try {
    const settings = await updatePricingSettings(parsed.data);
    return NextResponse.json({ settings });
  } catch (error) {
    console.error('Unable to save pricing settings:', error);
    return NextResponse.json({ error: 'Unable to save pricing settings' }, { status: 500 });
  }
}
