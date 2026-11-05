import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { StaffIdentity, ShiftType, StaffRole } from './staff-types';
import { getDataProvider } from './data-mode';

type StoredStaffAccount = StaffIdentity & { passwordHash: string; passwordSalt: string };
type StaffStore = { accounts: StoredStaffAccount[] };

declare global {
  var matchaMockStaffStore: StaffStore | undefined;
}

function hashPassword(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key));
  });
}

async function createStoredPassword(password: string) {
  const passwordSalt = randomBytes(16).toString('hex');
  const passwordHash = (await hashPassword(password, passwordSalt)).toString('hex');
  return { passwordSalt, passwordHash };
}

const store = globalThis.matchaMockStaffStore ?? (globalThis.matchaMockStaffStore = { accounts: [] });
let seedPromise: Promise<void> | null = null;
const seed = async () => {
    const accounts = [
      { id: 'staff-admin', username: 'admin', email: 'demo@local.test', role: 'ADMIN' as const, shiftType: 'DAY' as const, active: true, password: 'demo1234' },
      { id: 'staff-day', username: 'Matcha_Day_AM', email: 'day@local.test', role: 'EMPLOYEE' as const, shiftType: 'DAY' as const, active: true, password: 'day12345' },
      { id: 'staff-night', username: 'Matcha_Night_PM', email: 'night@local.test', role: 'EMPLOYEE' as const, shiftType: 'NIGHT' as const, active: true, password: 'night12345' },
    ];
    for (const account of accounts) {
      store.accounts.push({ ...account, ...(await createStoredPassword(account.password)) });
      delete (store.accounts[store.accounts.length - 1] as StoredStaffAccount & { password?: string }).password;
    }
};

async function ensureSeeded() {
  if (store.accounts.length > 0) return;
  seedPromise ??= seed();
  await seedPromise;
}

export async function verifyMockStaff(emailOrUsername: string, password: string) {
  await ensureSeeded();
  const account = store.accounts.find((item) => item.email === emailOrUsername.trim().toLowerCase() || item.username === emailOrUsername.trim());
  if (!account || !account.active) return null;
  const actual = await hashPassword(password, account.passwordSalt);
  const expected = Buffer.from(account.passwordHash, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return toIdentity(account);
}

export async function listStaffAccounts() {
  if (getDataProvider() === 'mock') return listMockStaff();
  const { listMongoStaffAccounts } = await import('./staff-account-repository');
  return listMongoStaffAccounts();
}

export async function createStaffAccount(input: { username: string; email: string; password: string; role: StaffRole; shiftType: ShiftType }) {
  if (getDataProvider() === 'mock') return createMockStaff(input);
  const { createMongoStaffAccount } = await import('./staff-account-repository');
  return createMongoStaffAccount(input);
}

export async function updateStaffAccount(id: string, input: Partial<Pick<StaffIdentity, 'username' | 'email' | 'role' | 'shiftType' | 'active'>> & { password?: string }) {
  if (getDataProvider() === 'mock') return updateMockStaff(id, input);
  const { updateMongoStaffAccount } = await import('./staff-account-repository');
  return updateMongoStaffAccount(id, input);
}

export async function deleteStaffAccount(id: string) {
  if (getDataProvider() === 'mock') return deleteMockStaff(id);
  const { deleteMongoStaffAccount } = await import('./staff-account-repository');
  return deleteMongoStaffAccount(id);
}

function toIdentity(account: StoredStaffAccount): StaffIdentity {
  return {
    id: account.id,
    username: account.username,
    email: account.email,
    role: account.role,
    shiftType: account.shiftType,
    active: account.active,
  };
}

export async function listMockStaff() {
  await ensureSeeded();
  return store.accounts.map(toIdentity);
}

export async function createMockStaff(input: { username: string; email: string; password: string; role: StaffRole; shiftType: ShiftType }) {
  await ensureSeeded();
  if (store.accounts.some((item) => item.username === input.username || item.email === input.email.toLowerCase())) {
    throw new Error('الحساب موجود بالفعل');
  }
  const account = { id: `staff-${crypto.randomUUID()}`, username: input.username, email: input.email.toLowerCase(), role: input.role, shiftType: input.shiftType, active: true, ...(await createStoredPassword(input.password)) };
  store.accounts.push(account);
  return toIdentity(account);
}

export async function updateMockStaff(id: string, input: Partial<Pick<StaffIdentity, 'username' | 'email' | 'role' | 'shiftType' | 'active'>> & { password?: string }) {
  await ensureSeeded();
  const account = store.accounts.find((item) => item.id === id);
  if (!account) return null;
  Object.assign(account, input);
  if (input.email) account.email = input.email.toLowerCase();
  if (input.password) Object.assign(account, await createStoredPassword(input.password));
  return toIdentity(account);
}

export function deleteMockStaff(id: string) {
  const index = store.accounts.findIndex((item) => item.id === id);
  if (index === -1) return false;
  store.accounts.splice(index, 1);
  return true;
}
