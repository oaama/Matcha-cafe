import type { Metadata } from 'next';
import fs from 'node:fs';
import path from 'node:path';
import BaristaBook, { type BookPage } from '@/components/barista-book';
import { baristaCategories, baristaProducts, foundationPages, recipeById } from '@/lib/barista-catalog';
import { categoryGuides } from '@/lib/barista-guides';

export const metadata: Metadata = {
  title: 'كتالوج الباريستا',
  description: 'مرجع تحضير منتجات Matcha Café خطوة بخطوة.',
  robots: { index: false, follow: false },
};

export default function BaristaPage() {
  const pages: BookPage[] = [];
  for (const category of baristaCategories) {
    for (const product of baristaProducts().filter((item) => item.categoryId === category.id)) {
      const recipe = recipeById.get(product.id)!;
      const cut = path.join(process.cwd(), 'public', 'barista', `${product.id}.webp`);
      const file = path.join(process.cwd(), 'public', 'menu', `${product.id}.webp`);
      pages.push({
        kind: 'product',
        id: product.id,
        category: category.ar,
        categoryId: category.id,
        ar: product.ar,
        en: product.en,
        image: fs.existsSync(cut) ? `/barista/${product.id}.webp` : fs.existsSync(file) ? `/menu/${product.id}.webp` : undefined,
        recipe,
        guide: categoryGuides[category.id],
      });
    }
  }
  return <BaristaBook pages={pages} foundations={foundationPages} categories={baristaCategories.map((c) => ({ id: c.id, ar: c.ar }))} />;
}
