import mongoose, { Schema } from 'mongoose';
import { connectToDatabase } from './database';
import { getDataProvider } from './data-mode';
import { DEFAULT_PRICING_SETTINGS, type PricingSettings } from './pricing';

const SETTINGS_ID = 'cafe-pricing';

type PricingSettingsDocument = PricingSettings & { _id: string };

declare global {
  var matchaPricingSettings: PricingSettings | undefined;
}

const pricingSettingsSchema = new Schema<PricingSettingsDocument>({
  _id: { type: String, required: true },
  serviceEnabled: { type: Boolean, required: true, default: DEFAULT_PRICING_SETTINGS.serviceEnabled },
  serviceRate: { type: Number, required: true, default: DEFAULT_PRICING_SETTINGS.serviceRate },
  taxEnabled: { type: Boolean, required: true, default: DEFAULT_PRICING_SETTINGS.taxEnabled },
  taxRate: { type: Number, required: true, default: DEFAULT_PRICING_SETTINGS.taxRate },
}, { versionKey: false, collection: 'cafe_settings' });

const PricingSettingsModel = (mongoose.models.PricingSettings as mongoose.Model<PricingSettingsDocument> | undefined)
  ?? mongoose.model<PricingSettingsDocument>('PricingSettings', pricingSettingsSchema);

function withoutId(settings: PricingSettingsDocument): PricingSettings {
  return {
    serviceEnabled: settings.serviceEnabled,
    serviceRate: settings.serviceRate,
    taxEnabled: settings.taxEnabled,
    taxRate: settings.taxRate,
  };
}

export async function getPricingSettings(): Promise<PricingSettings> {
  if (getDataProvider() === 'mock') {
    globalThis.matchaPricingSettings ??= { ...DEFAULT_PRICING_SETTINGS };
    return { ...globalThis.matchaPricingSettings };
  }

  await connectToDatabase();
  const settings = await PricingSettingsModel.findOneAndUpdate(
    { _id: SETTINGS_ID },
    { $setOnInsert: { ...DEFAULT_PRICING_SETTINGS } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean() as PricingSettingsDocument;
  return withoutId(settings);
}

export async function updatePricingSettings(settings: PricingSettings): Promise<PricingSettings> {
  if (getDataProvider() === 'mock') {
    globalThis.matchaPricingSettings = { ...settings };
    return { ...settings };
  }

  await connectToDatabase();
  const updated = await PricingSettingsModel.findOneAndUpdate(
    { _id: SETTINGS_ID },
    { $set: settings, $setOnInsert: { _id: SETTINGS_ID } },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
  ).lean() as PricingSettingsDocument;
  return withoutId(updated);
}

export function clearMockPricingSettings() {
  globalThis.matchaPricingSettings = undefined;
}
