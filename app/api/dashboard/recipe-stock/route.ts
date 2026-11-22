import { NextResponse } from 'next/server';
import { getCatalog } from '@/lib/catalog-repository';
import { getRecipeMonitoringData } from '@/lib/inventory-repository';
import { requireStaffRole } from '@/lib/staff-api';

export async function GET() {
  if (!await requireStaffRole(['ADMIN'])) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [catalog, inventory] = await Promise.all([
      getCatalog(),
      getRecipeMonitoringData(),
    ]);
    return NextResponse.json(
      { ...inventory, products: catalog.products },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Unable to load recipe stock monitoring data:', error);
    return NextResponse.json({ error: 'تعذر تحميل بيانات الوصفات والمخزون' }, { status: 500 });
  }
}
