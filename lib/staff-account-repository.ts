import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import mongoose, { Schema } from 'mongoose';
import { connectToDatabase } from './database';

type StaffAccount = {
  email: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: Date;
};

const staffAccountSchema = new Schema<StaffAccount>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
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

async function bootstrapFirstStaffAccount(email: string, password: string) {
  const configuredEmail = process.env.STAFF_EMAIL?.trim().toLowerCase();
  const configuredPassword = process.env.STAFF_PASSWORD;
  if (!configuredEmail || !configuredPassword || configuredPassword.length < 12
    || configuredPassword.startsWith('replace-')
    || email !== configuredEmail || password !== configuredPassword) {
    return false;
  }

  const existingAccount = await StaffAccountModel.findOne().select('_id').lean();
  if (existingAccount) return false;

  const { salt, hash } = await createStaffPasswordHash(password);
  try {
    await StaffAccountModel.create({
      email: configuredEmail,
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: new Date(),
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }
  return true;
}

export async function verifyMongoStaffCredentials(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || normalizedEmail.length > 254 || !password || password.length > 1024) {
    return false;
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

  if (!account) return false;
  return verifyStaffPassword(password, account.passwordSalt, account.passwordHash);
}
