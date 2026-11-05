import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import mongoose, { Schema } from 'mongoose';
import { connectToDatabase } from './database';

import type { StaffIdentity, ShiftType, StaffRole } from './staff-types';

type StaffAccount = StaffIdentity & {
  email: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: Date;
};

const staffAccountSchema = new Schema<StaffAccount>({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  role: { type: String, enum: ['ADMIN', 'EMPLOYEE'], required: true, default: 'EMPLOYEE' },
  shiftType: { type: String, enum: ['DAY', 'NIGHT'], required: true, default: 'DAY' },
  active: { type: Boolean, required: true, default: true },
  passwordHash: { type: String, required: true, select: false },
  passwordSalt: { type: String, required: true, select: false },
  createdAt: { type: Date, required: true, immutable: true },
}, { versionKey: false, collection: 'staff_accounts' });

const StaffAccountModel = (mongoose.models.StaffAccount as mongoose.Model<StaffAccount> | undefined)
  ?? mongoose.model<StaffAccount>('StaffAccount', staffAccountSchema);

const PASSWORD_HASH_BYTES = 64;

function derivePasswordHash(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, PASSWORD_HASH_BYTES, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function createStaffPasswordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = (await derivePasswordHash(password, salt)).toString('hex');
  return { salt, hash };
}

export async function verifyStaffPassword(password: string, salt: string, hash: string) {
  if (!/^[a-f\d]{32}$/i.test(salt) || !/^[a-f\d]{128}$/i.test(hash)) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = await derivePasswordHash(password, salt);
  return timingSafeEqual(actual, expected);
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

function toIdentity(account: StaffAccount): StaffIdentity {
  return {
    id: account.id,
    username: account.username,
    email: account.email,
    role: account.role,
    shiftType: account.shiftType,
    active: account.active,
  };
}

async function bootstrapFirstStaffAccount(email: string, password: string) {
  const configuredEmail = process.env.STAFF_EMAIL?.trim().toLowerCase();
  const configuredPassword = process.env.STAFF_PASSWORD;
  if (!configuredEmail || !configuredPassword || configuredPassword.length < 12
    || configuredPassword.startsWith('replace-')
    || email !== configuredEmail || password !== configuredPassword) {
    return null;
  }

  const existingAccount = await StaffAccountModel.findOne().select('_id').lean();
  if (existingAccount) return false;

  const { salt, hash } = await createStaffPasswordHash(password);
  try {
    await StaffAccountModel.create({
      id: `staff-${Date.now()}`,
      username: 'admin',
      email: configuredEmail,
      role: 'ADMIN',
      shiftType: 'DAY',
      active: true,
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: new Date(),
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }
  return true;
}

export async function verifyMongoStaffCredentials(email: string, password: string): Promise<StaffIdentity | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || normalizedEmail.length > 254 || !password || password.length > 1024) {
    return null;
  }

  await connectToDatabase();

  let account = await StaffAccountModel.findOne({ email: normalizedEmail })
    .select('+passwordHash +passwordSalt')
    .lean();

  if (!account) {
    await bootstrapFirstStaffAccount(normalizedEmail, password);
    account = await StaffAccountModel.findOne({ email: normalizedEmail })
      .select('+passwordHash +passwordSalt')
      .lean();
  }

  if (!account || !account.active) return null;
  const valid = await verifyStaffPassword(password, account.passwordSalt, account.passwordHash);
  if (!valid) return null;
  return {
    ...toIdentity(account),
  };
}

export async function listMongoStaffAccounts() {
  await connectToDatabase();
  const accounts = await StaffAccountModel.find().sort({ username: 1 }).lean();
  return accounts.map(toIdentity);
}

export async function createMongoStaffAccount(input: {
  username: string;
  email: string;
  password: string;
  role: StaffRole;
  shiftType: ShiftType;
}) {
  await connectToDatabase();
  const { salt, hash } = await createStaffPasswordHash(input.password);
  try {
    const account = await StaffAccountModel.create({
      id: `staff-${randomBytes(12).toString('hex')}`,
      username: input.username,
      email: input.email.trim().toLowerCase(),
      role: input.role,
      shiftType: input.shiftType,
      active: true,
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: new Date(),
    });
    return toIdentity(account.toObject());
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new Error('الحساب موجود بالفعل');
    throw error;
  }
}

export async function updateMongoStaffAccount(
  id: string,
  input: Partial<Pick<StaffIdentity, 'username' | 'email' | 'role' | 'shiftType' | 'active'>> & { password?: string },
) {
  await connectToDatabase();
  const update: Record<string, unknown> = {};
  for (const key of ['username', 'email', 'role', 'shiftType', 'active'] as const) {
    if (input[key] !== undefined) update[key] = key === 'email' ? input[key]!.toLowerCase() : input[key];
  }
  if (input.password) {
    const { salt, hash } = await createStaffPasswordHash(input.password);
    update.passwordSalt = salt;
    update.passwordHash = hash;
  }
  const account = await StaffAccountModel.findOneAndUpdate({ id }, { $set: update }, { new: true }).lean();
  return account ? toIdentity(account) : null;
}

export async function deleteMongoStaffAccount(id: string) {
  await connectToDatabase();
  const result = await StaffAccountModel.deleteOne({ id });
  return result.deletedCount === 1;
}
