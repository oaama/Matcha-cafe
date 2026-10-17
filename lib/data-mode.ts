export function isMockDataMode() {
  return process.env.NODE_ENV !== 'production'
    && (process.env.DATA_PROVIDER === undefined || process.env.DATA_PROVIDER === 'mock');
}

export function getDataProvider() {
  if (isMockDataMode()) return 'mock' as const;
  if (process.env.DATA_PROVIDER === 'mongodb') return 'mongodb' as const;
  if (process.env.NODE_ENV === 'production' && process.env.DATA_PROVIDER === undefined) {
    throw new Error('Set DATA_PROVIDER=mongodb for production; mock data is development-only');
  }
  throw new Error(`Unsupported DATA_PROVIDER: ${process.env.DATA_PROVIDER}`);
}
