import mongoose, { Schema } from 'mongoose';
import { connectToDatabase } from './database';
import { getDataProvider } from './data-mode';
import { DEFAULT_OVERHEAD_CONFIG, type OverheadConfig } from './overhead-costing';

const SETTINGS_ID = 'cafe-overhead';

export type { OverheadConfig };

type OverheadConfigDocument = OverheadConfig & { _id: string };

declare global {
  var matchaOverheadConfig: OverheadConfig | undefined;
}

const overheadConfigSchema = new Schema<OverheadConfigDocument>({
  _id: { type: String, required: true },
  rent: { type: Number, required: true, default: DEFAULT_OVERHEAD_CONFIG.rent },
  labor: { type: Number, required: true, default: DEFAULT_OVERHEAD_CONFIG.labor },
  electricity: { type: Number, required: true, default: DEFAULT_OVERHEAD_CONFIG.electricity },
  water: { type: Number, required: true, default: DEFAULT_OVERHEAD_CONFIG.water },
  internet: { type: Number, required: true, default: DEFAULT_OVERHEAD_CONFIG.internet },
  other: { type: Number, required: true, default: DEFAULT_OVERHEAD_CONFIG.other },
  expectedMonthlyUnits: { type: Number, required: true, default: DEFAULT_OVERHEAD_CONFIG.expectedMonthlyUnits },
  targetFoodCostPercent: { type: Number, required: true, default: DEFAULT_OVERHEAD_CONFIG.targetFoodCostPercent },
}, { versionKey: false, collection: 'cafe_settings' });

const OverheadConfigModel = (mongoose.models.OverheadConfig as mongoose.Model<OverheadConfigDocument> | undefined)
  ?? mongoose.model<OverheadConfigDocument>('OverheadConfig', overheadConfigSchema);

function withoutId(config: OverheadConfigDocument): OverheadConfig {
  return {
    rent: config.rent,
    labor: config.labor,
    electricity: config.electricity,
    water: config.water,
    internet: config.internet,
    other: config.other,
    expectedMonthlyUnits: config.expectedMonthlyUnits,
    targetFoodCostPercent: config.targetFoodCostPercent,
  };
}

export async function getOverheadConfig(): Promise<OverheadConfig> {
  if (getDataProvider() === 'mock') {
    globalThis.matchaOverheadConfig ??= { ...DEFAULT_OVERHEAD_CONFIG };
    return { ...globalThis.matchaOverheadConfig };
  }

  await connectToDatabase();
  const config = await OverheadConfigModel.findOneAndUpdate(
    { _id: SETTINGS_ID },
    { $setOnInsert: { ...DEFAULT_OVERHEAD_CONFIG } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean() as OverheadConfigDocument;
  return withoutId(config);
}

export async function updateOverheadConfig(config: OverheadConfig): Promise<OverheadConfig> {
  if (getDataProvider() === 'mock') {
    globalThis.matchaOverheadConfig = { ...config };
    return { ...config };
  }

  await connectToDatabase();
  const updated = await OverheadConfigModel.findOneAndUpdate(
    { _id: SETTINGS_ID },
    { $set: config, $setOnInsert: { _id: SETTINGS_ID } },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
  ).lean() as OverheadConfigDocument;
  return withoutId(updated);
}

export function clearMockOverheadConfig() {
  globalThis.matchaOverheadConfig = undefined;
}
