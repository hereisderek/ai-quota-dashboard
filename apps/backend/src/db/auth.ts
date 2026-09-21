import crypto from 'node:crypto';
import { getDb } from './index.js';

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  display_name: string | null;
  role: 'admin' | 'user';
  share_enabled: number; // 0 or 1
  share_slug: string | null;
  share_title: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
}

export const userRepo = {
  hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  },

  verifyPassword(password: string, storedHash: string): boolean {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  },

  count(): number {
    const db = getDb();
    const row = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    return row.count;
  },

  getAll(): UserRow[] {
    const db = getDb();
    return db.prepare('SELECT * FROM users ORDER BY created_at ASC').all() as unknown as UserRow[];
  },

  getById(id: string): UserRow | undefined {
    const db = getDb();
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow | undefined;
  },

  getByUsername(username: string): UserRow | undefined {
    const db = getDb();
    return db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(username) as unknown as UserRow | undefined;
  },

  getByShareSlug(slug: string): UserRow | undefined {
    const db = getDb();
    return db.prepare('SELECT * FROM users WHERE LOWER(share_slug) = LOWER(?)').get(slug) as unknown as UserRow | undefined;
  },

  create(user: {
    username: string;
    password: string;
    displayName?: string;
    role?: 'admin' | 'user';
  }): UserRow {
    const db = getDb();
    const id = `user_${crypto.randomBytes(8).toString('hex')}`;
    const hash = this.hashPassword(user.password);
    const now = new Date().toISOString();
    const role = user.role || 'user';
    const defaultSlug = user.username.toLowerCase().replace(/[^a-z0-9_-]/g, '') || `user-${id.slice(-4)}`;

    db.prepare(`
      INSERT INTO users (id, username, password_hash, display_name, role, share_enabled, share_slug, share_title, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
    `).run(
      id,
      user.username,
      hash,
      user.displayName || user.username,
      role,
      defaultSlug,
      `${user.displayName || user.username}'s AI Quotas`,
      now,
      now
    );

    return this.getById(id)!;
  },

  updateShareSettings(userId: string, settings: {
    shareEnabled: boolean;
    shareSlug?: string;
    shareTitle?: string;
  }): void {
    const db = getDb();
    const now = new Date().toISOString();
    const current = this.getById(userId);
    if (!current) return;

    let slug = (settings.shareSlug || current.share_slug || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!slug) slug = `user-${userId.slice(-6)}`;

    db.prepare(`
      UPDATE users 
      SET share_enabled = ?, share_slug = ?, share_title = ?, updated_at = ?
      WHERE id = ?
    `).run(
      settings.shareEnabled ? 1 : 0,
      slug,
      settings.shareTitle !== undefined ? settings.shareTitle : current.share_title,
      now,
      userId
    );
  }
};

export const sessionRepo = {
  create(userId: string, durationDays = 30): string {
    const db = getDb();
    const id = `sess_${crypto.randomBytes(16).toString('hex')}`;
    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO sessions (id, user_id, token, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, userId, token, expiresAt, now.toISOString());

    return token;
  },

  getUserByToken(token: string): UserRow | null {
    if (!token) return null;
    const db = getDb();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      SELECT u.* 
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ? AND s.expires_at > ?
    `);
    const user = stmt.get(token, now) as unknown as UserRow | undefined;
    return user || null;
  },

  delete(token: string): void {
    const db = getDb();
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  },

  cleanupExpired(): void {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  }
};
