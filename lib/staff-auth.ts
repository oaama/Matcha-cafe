import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { isMockDataMode } from './data-mode';
import type { StaffIdentity } from './staff-types';
import { verifyMockStaff } from './staff-user-repository';

const SESSION_DURATION_SECONDS = 60 * 60 * 8;
export const MOCK_STAFF_EMAIL = 'demo@local.test';
export const MOCK_STAFF_PASSWORD = 'demo1234';
export const STAFF_SESSION_COOKIE = 'matcha_staff';
export const STAFF_SESSION_DURATION_SECONDS = SESSION_DURATION_SECONDS;

type MockSessionStore = Map<string, StaffIdentity>;
declare global {
  var matchaMockStaffSessions: MockSessionStore | undefined;
}
const mockSessions = globalThis.matchaMockStaffSessions
  ?? (globalThis.matchaMockStaffSessions = new Map());

function getSecret() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32 || secret.startsWith('replace-')) return null;
  return secret;
}

export function hasStaffCredentials() {
  if (isMockDataMode()) return true;
  return getSecret() !== null;
}

export function verifyStaffCredentials(email: string, password: string): boolean {
  return isMockDataMode() && email === MOCK_STAFF_EMAIL && password === MOCK_STAFF_PASSWORD;
}

export async function authenticateStaffCredentials(email: string, password: string): Promise<StaffIdentity | null> {
  if (!hasStaffCredentials()) return null;
  if (isMockDataMode()) return verifyMockStaff(email, password);
  const { verifyMongoStaffCredentials } = await import('./staff-account-repository');
  return verifyMongoStaffCredentials(email, password);
}

function sign(payload: string, expiresAt: number) {
  const secret = getSecret();
  if (!secret) throw new Error('NEXTAUTH_SECRET must contain at least 32 non-placeholder characters');
  return createHmac('sha256', secret).update(`${payload}.${expiresAt}`).digest('base64url');
}

const DEFAULT_IDENTITY: StaffIdentity = {
  id: 'staff-admin',
  username: 'admin',
  email: MOCK_STAFF_EMAIL,
  role: 'ADMIN',
  shiftType: 'DAY',
  active: true,
};

export function createStaffSessionToken(identity: StaffIdentity = DEFAULT_IDENTITY) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  const payload = Buffer.from(JSON.stringify(identity)).toString('base64url');
  if (isMockDataMode()) {
    const token = `mock.${randomUUID()}`;
    mockSessions.set(token, identity);
    return token;
  }
  return `${expiresAt}.${payload}.${sign(payload, expiresAt)}`;
}

export function getStaffIdentity(token: string | undefined): StaffIdentity | null {
  if (!token) return null;
  if (isMockDataMode()) return mockSessions.get(token) ?? null;
  const [expiresAtText, payload, signature] = token.split('.');
  const expiresAt = Number(expiresAtText);
  if (!payload || !signature || !Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return null;
  const expected = Buffer.from(sign(payload, expiresAt));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  try {
    const identity = JSON.parse(Buffer.from(payload, 'base64url').toString()) as StaffIdentity;
    return identity.active ? identity : null;
  } catch {
    return null;
  }
}

export function isValidStaffSessionToken(token: string | undefined) {
  return getStaffIdentity(token) !== null;
}
