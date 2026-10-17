import mongoose, { Schema } from 'mongoose';
import { menuSeed } from './menu-data';
import { getDataProvider } from './data-mode';
import type { CatalogData } from './catalog';

const CATALOG_ID = 'main-menu';
type StoredCatalog = CatalogData & { _id: string };
const seedCatalog: CatalogData = {
  categories: menuSeed.categories,
  products: menuSeed.products,
  groups: menuSeed.optionGroups,
};

declare global {
  var matchaCatalog: CatalogData | undefined;
}

const catalogSchema = new Schema<StoredCatalog>({
  _id: { type: String, required: true },
  categories: { type: Schema.Types.Mixed, required: true },
  products: { type: Schema.Types.Mixed, required: true },
  groups: { type: Schema.Types.Mixed, required: true },
}, { versionKey: false, collection: 'cafe_settings' });

const CatalogModel = (mongoose.models.Catalog as mongoose.Model<StoredCatalog> | undefined)
  ?? mongoose.model<StoredCatalog>('Catalog', catalogSchema);

function cloneCatalog(catalog: CatalogData): CatalogData {
  return structuredClone(catalog);
}

export async function getCatalog(): Promise<CatalogData> {
  if (getDataProvider() === 'mock') {
    globalThis.matchaCatalog ??= cloneCatalog(seedCatalog);
    return cloneCatalog(globalThis.matchaCatalog);
  }

  const { connectToDatabase } = await import('./database');
  await connectToDatabase();
  const stored = await CatalogModel.findOneAndUpdate(
    { _id: CATALOG_ID },
    { $setOnInsert: seedCatalog },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean() as StoredCatalog;
  return { categories: stored.categories, products: stored.products, groups: stored.groups };
}

export async function saveCatalog(catalog: CatalogData): Promise<CatalogData> {
  if (getDataProvider() === 'mock') {
    globalThis.matchaCatalog = cloneCatalog(catalog);
    return cloneCatalog(catalog);
  }

  const { connectToDatabase } = await import('./database');
  await connectToDatabase();
  const stored = await CatalogModel.findOneAndUpdate(
    { _id: CATALOG_ID },
    { $set: { categories: catalog.categories, products: catalog.products, groups: catalog.groups } },
    { upsert: true, new: true, runValidators: true },
  ).lean() as StoredCatalog;
  return { categories: stored.categories, products: stored.products, groups: stored.groups };
}

export function clearMockCatalog() {
  globalThis.matchaCatalog = undefined;
}
