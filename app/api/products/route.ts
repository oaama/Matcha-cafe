import { NextResponse } from 'next/server';
import { getCatalog } from '@/lib/catalog-repository';

export async function GET() {
  try {
    const catalog = await getCatalog();
    return NextResponse.json(catalog.products.filter((product) => product.available));
  } catch (error) {
    console.error('Unable to load products:', error);
    return NextResponse.json({ error: 'Unable to load products' }, { status: 500 });
  }
}
