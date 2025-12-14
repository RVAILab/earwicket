import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db/client';
import { AdminUser } from '@/types';

const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'default-secret-change-me';
const SALT_ROUNDS = parseInt(process.env.ADMIN_PASSWORD_SALT_ROUNDS || '10');

export interface JWTPayload {
  userId: string;
  username: string;
}

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export async function createAdminUser(
  username: string,
  password: string
): Promise<AdminUser> {
  const passwordHash = await hashPassword(password);

  const result = await db.queryOne<AdminUser>(
    `INSERT INTO admin_users (username, password_hash)
     VALUES ($1, $2)
     RETURNING *`,
    [username, passwordHash]
  );

  if (!result) {
    throw new Error('Failed to create admin user');
  }

  return result;
}

export async function authenticateAdmin(
  username: string,
  password: string
): Promise<{ user: AdminUser; token: string } | null> {
  const user = await db.queryOne<AdminUser>(
    'SELECT * FROM admin_users WHERE username = $1',
    [username]
  );

  if (!user) {
    return null;
  }

  const isValid = await verifyPassword(password, user.password_hash);

  if (!isValid) {
    return null;
  }

  const token = generateToken({
    userId: user.id,
    username: user.username,
  });

  return { user, token };
}

export async function getAdminFromToken(token: string): Promise<AdminUser | null> {
  const payload = verifyToken(token);

  if (!payload) {
    return null;
  }

  const user = await db.queryOne<AdminUser>(
    'SELECT * FROM admin_users WHERE id = $1',
    [payload.userId]
  );

  return user;
}
