import { NextResponse } from 'next/server';
import { isMockDataMode } from '@/lib/data-mode';
import { getPricingSettings } from '@/lib/pricing-settings';
import { getCatalog } from '@/lib/catalog-repository';

export async function GET() {
  try {
    const catalog = await getCatalog();
    return NextResponse.json({
      categories: catalog.categories.filter((category) => category.active).sort((a, b) => a.displayOrder - b.displayOrder),
      products: catalog.products
        .filter((product) => product.available)
        .map((product, index) => ({ product, index }))
        .sort((a, b) => a.product.categoryId.localeCompare(b.product.categoryId)
          || (a.product.displayOrder ?? a.index) - (b.product.displayOrder ?? b.index))
        .map(({ product }) => product),
      groups: catalog.groups,
      pricing: await getPricingSettings(),
      demoMode: isMockDataMode(),
    });
  } catch (error) {
    console.error('Unable to load menu settings:', error);
    return NextResponse.json({ error: 'Unable to load menu' }, { status: 500 });
  }
}
