import { createHmac, timingSafeEqual } from 'node:crypto';
import { isMockDataMode } from './data-mode';

const SESSION_DURATION_SECONDS = 60 * 60 * 8;
export const MOCK_STAFF_EMAIL = 'demo@local.test';
export const MOCK_STAFF_PASSWORD = 'demo1234';
const MOCK_SESSION_TOKEN = 'local-mock-session';

function getSecret() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32 || secret.startsWith('replace-')) {
    return null;
  }
  return secret;
}

export function hasStaffCredentials() {
  if (isMockDataMode()) return true;
  return getSecret() !== null;
}

export function verifyStaffCredentials(email: string, password: string) {
  if (isMockDataMode()) {
    return email === MOCK_STAFF_EMAIL && password === MOCK_STAFF_PASSWORD;
  }
  return false;
}

export async function authenticateStaffCredentials(email: string, password: string) {
  if (!hasStaffCredentials()) return false;
  if (isMockDataMode()) return verifyStaffCredentials(email, password);

  const { verifyMongoStaffCredentials } = await import('./staff-account-repository');
  return verifyMongoStaffCredentials(email, password);
}

export function createStaffSessionToken() {
  if (isMockDataMode()) return MOCK_SESSION_TOKEN;
  const secret = getSecret();
  if (!secret) throw new Error('NEXTAUTH_SECRET must contain at least 32 non-placeholder characters');

  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  const signature = createHmac('sha256', secret).update(String(expiresAt)).digest('base64url');
  return `${expiresAt}.${signature}`;
}

export function isValidStaffSessionToken(token: string | undefined) {
  if (isMockDataMode()) return token === MOCK_SESSION_TOKEN;
  const secret = getSecret();
  if (!secret || !token) return false;

  const [expiresAtText, signature] = token.split('.');
  const expiresAt = Number(expiresAtText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000) || !signature) {
    return false;
  }

  const expected = createHmac('sha256', secret).update(String(expiresAt)).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, 'base64url');
  } catch {
    return false;
  }
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export const STAFF_SESSION_COOKIE = 'matcha_staff';
export const STAFF_SESSION_DURATION_SECONDS = SESSION_DURATION_SECONDS;