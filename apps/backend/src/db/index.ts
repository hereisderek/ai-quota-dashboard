import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { userRepo } from './auth.js';

let dbInstance: DatabaseSync | null = null;

export * from './auth.js';

export interface AccountRow {
  id: string;
  user_id?: string | null;
  provider_id: string;
  label: string;
  email: string | null;
  credentials: string; // JSON string
  status: 'active' | 'rate_limited' | 'error' | 'disabled';
  last_error: string | null;
  last_polled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuotaSnapshotRow {
  id: number;
  account_id: string;
  provider_id: string;
  model_id: string;
  token_type: string;
  remaining_fraction: number;
  remaining_amount?: number | null;
  limit_amount?: number | null;
  reset_time: string | null;
  raw_json: string | null;
  recorded_at: string;
}

export function getDb(): DatabaseSync {
  if (!dbInstance) {
    const dir = path.dirname(config.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    dbInstance = new DatabaseSync(config.dbPath);
    initSchema(dbInstance);
  }
  return dbInstance;
}

function initSchema(db: DatabaseSync): void {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      share_enabled INTEGER NOT NULL DEFAULT 0,
      share_slug TEXT UNIQUE,
      share_title TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `);

  // Accounts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      provider_id TEXT NOT NULL,
      label TEXT NOT NULL,
      email TEXT,
      credentials TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      last_error TEXT,
      last_polled_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Migration: Ensure user_id column exists if upgrading an older DB
  try {
    const tableInfo = db.prepare('PRAGMA table_info(accounts)').all() as Array<{ name: string }>;
    const hasUserId = tableInfo.some(col => col.name === 'user_id');
    if (!hasUserId) {
      db.exec('ALTER TABLE accounts ADD COLUMN user_id TEXT REFERENCES users(id);');
      console.log('[DB] Migrated accounts table: added user_id column');
    }
  } catch (err) {
    console.warn('[DB] user_id column check error:', err);
  }

  // Quota snapshots table
  db.exec(`
    CREATE TABLE IF NOT EXISTS quota_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      token_type TEXT NOT NULL,
      remaining_fraction REAL NOT NULL,
      remaining_amount REAL,
      limit_amount REAL,
      reset_time TEXT,
      raw_json TEXT,
      recorded_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_account ON quota_snapshots(account_id, recorded_at DESC);
    CREATE INDEX IF NOT EXISTS idx_snapshots_provider ON quota_snapshots(provider_id, recorded_at DESC);
  `);

  // Migration: Ensure remaining_amount & limit_amount columns exist
  try {
    const snapCols = db.prepare('PRAGMA table_info(quota_snapshots)').all() as Array<{ name: string }>;
    if (!snapCols.some(col => col.name === 'remaining_amount')) {
      db.exec('ALTER TABLE quota_snapshots ADD COLUMN remaining_amount REAL;');
      console.log('[DB] Migrated quota_snapshots: added remaining_amount column');
    }
    if (!snapCols.some(col => col.name === 'limit_amount')) {
      db.exec('ALTER TABLE quota_snapshots ADD COLUMN limit_amount REAL;');
      console.log('[DB] Migrated quota_snapshots: added limit_amount column');
    }
  } catch (err) {
    console.warn('[DB] snapshot columns check error:', err);
  }

  // Settings key-value store
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Bootstrap initial user and migrate orphaned accounts if needed
  bootstrapInitialUser(db);

  console.log('[DB] Schema initialized successfully at', config.dbPath);
}

export function getPrimaryAdminId(): string {
  const db = getDb();
  const firstAdmin = db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined;
  if (firstAdmin) return firstAdmin.id;
  const anyUser = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: string } | undefined;
  return anyUser?.id || '';
}

export function assignOrphanedAccounts(targetUserId?: string): number {
  const db = getDb();
  const userId = targetUserId || getPrimaryAdminId();
  if (!userId) return 0;
  const unassigned = db.prepare('SELECT COUNT(*) as count FROM accounts WHERE user_id IS NULL').get() as { count: number };
  if (unassigned.count > 0) {
    console.log(`[DB] Assigning ${unassigned.count} existing account(s) to user ${userId}`);
    db.prepare('UPDATE accounts SET user_id = ? WHERE user_id IS NULL').run(userId);
    return unassigned.count;
  }
  return 0;
}

function bootstrapInitialUser(db: DatabaseSync): void {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  let primaryUserId: string;

  if (userCount.count === 0) {
    const defaultUsername = (config.authUsername || 'admin').trim();
    const defaultPassword = config.authPassword || 'admin123';
    console.log(`[DB] Creating default admin user '${defaultUsername}'...`);
    const initialUser = userRepo.create({
      username: defaultUsername,
      password: defaultPassword,
      displayName: 'Administrator',
      role: 'admin'
    });
    primaryUserId = initialUser.id;
  } else {
    const firstAdmin = db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get() as { id: string };
    primaryUserId = firstAdmin.id;
  }

  assignOrphanedAccounts(primaryUserId);
}

// Account Repository with user scoping
export const accountRepo = {
  getAll(userId?: string): AccountRow[] {
    const db = getDb();
    if (userId) {
      const stmt = db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at ASC');
      return stmt.all(userId) as unknown as AccountRow[];
    }
    const stmt = db.prepare('SELECT * FROM accounts ORDER BY created_at ASC');
    return stmt.all() as unknown as AccountRow[];
  },

  getById(id: string, userId?: string): AccountRow | undefined {
    const db = getDb();
    if (userId) {
      const stmt = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?');
      return stmt.get(id, userId) as unknown as AccountRow | undefined;
    }
    const stmt = db.prepare('SELECT * FROM accounts WHERE id = ?');
    return stmt.get(id) as unknown as AccountRow | undefined;
  },

  upsert(account: {
    id: string;
    user_id?: string | null;
    provider_id: string;
    label: string;
    email?: string | null;
    credentials: string;
    status?: string;
  }): void {
    const db = getDb();
    const now = new Date().toISOString();
    const existing = this.getById(account.id);

    if (existing) {
      const stmt = db.prepare(`
        UPDATE accounts 
        SET user_id = ?, provider_id = ?, label = ?, email = ?, credentials = ?, status = ?, updated_at = ?
        WHERE id = ?
      `);
      stmt.run(
        (account.user_id !== undefined ? account.user_id : existing.user_id) ?? null,
        account.provider_id,
        account.label,
        account.email ?? existing.email,
        account.credentials,
        account.status ?? existing.status,
        now,
        account.id
      );
    } else {
      const stmt = db.prepare(`
        INSERT INTO accounts (id, user_id, provider_id, label, email, credentials, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        account.id,
        account.user_id || null,
        account.provider_id,
        account.label,
        account.email ?? null,
        account.credentials,
        account.status ?? 'active',
        now,
        now
      );
    }
  },

  updateCredentials(id: string, credentials: string): void {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare('UPDATE accounts SET credentials = ?, updated_at = ? WHERE id = ?').run(credentials, now, id);
  },

  updateEmail(id: string, email: string): void {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare('UPDATE accounts SET email = ?, updated_at = ? WHERE id = ?').run(email, now, id);
  },

  updateStatus(id: string, status: 'active' | 'rate_limited' | 'error' | 'disabled', lastError?: string | null): void {
    const db = getDb();
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE accounts 
      SET status = ?, last_error = ?, last_polled_at = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(status, lastError ?? null, now, now, id);
  },

  delete(id: string, userId?: string): boolean {
    const db = getDb();
    const target = this.getById(id, userId);
    if (!target) return false;

    db.prepare('DELETE FROM quota_snapshots WHERE account_id = ?').run(id);
    db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
    return true;
  }
};

// Quota Snapshot Repository
export const snapshotRepo = {
  record(snapshot: {
    account_id: string;
    provider_id: string;
    model_id: string;
    token_type: string;
    remaining_fraction: number;
    remaining_amount?: number | null;
    limit_amount?: number | null;
    reset_time?: string | null;
    raw_json?: string | null;
  }): void {
    const db = getDb();
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO quota_snapshots (account_id, provider_id, model_id, token_type, remaining_fraction, remaining_amount, limit_amount, reset_time, raw_json, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      snapshot.account_id,
      snapshot.provider_id,
      snapshot.model_id,
      snapshot.token_type,
      snapshot.remaining_fraction,
      snapshot.remaining_amount ?? null,
      snapshot.limit_amount ?? null,
      snapshot.reset_time ?? null,
      snapshot.raw_json ?? null,
      now
    );
  },

  getLatestForAccount(accountId: string): QuotaSnapshotRow[] {
    const db = getDb();
    // Find the latest recorded_at timestamp for this account
    const latestRow = db.prepare('SELECT MAX(recorded_at) as max_time FROM quota_snapshots WHERE account_id = ?').get(accountId) as { max_time: string | null } | undefined;
    if (!latestRow || !latestRow.max_time) return [];

    // Return snapshots recorded in the latest polling batch (within 10 seconds of max_time)
    // so obsolete/migrated model identifiers from past batches do not linger as zombie items
    const latestTime = new Date(latestRow.max_time).getTime();
    const batchStartTime = new Date(latestTime - 10000).toISOString();

    const stmt = db.prepare(`
      SELECT * FROM quota_snapshots
      WHERE account_id = ? AND recorded_at >= ?
      ORDER BY model_id ASC
    `);
    return stmt.all(accountId, batchStartTime) as unknown as QuotaSnapshotRow[];
  },

  getHistory(accountId: string, hours = 24): QuotaSnapshotRow[] {
    const db = getDb();
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const stmt = db.prepare(`
      SELECT * FROM quota_snapshots 
      WHERE account_id = ? AND recorded_at >= ?
      ORDER BY recorded_at ASC
    `);
    return stmt.all(accountId, since) as unknown as QuotaSnapshotRow[];
  },

  cleanupOldSnapshots(retentionDays: number): number {
    const db = getDb();
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const stmt = db.prepare('DELETE FROM quota_snapshots WHERE recorded_at < ?');
    const result = stmt.run(cutoff);
    return Number(result.changes);
  }
};

// Settings Repository
export const settingsRepo = {
  get(key: string, defaultValue = ''): string {
    const db = getDb();
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    const row = stmt.get(key) as { value: string } | undefined;
    return row ? row.value : defaultValue;
  },

  set(key: string, value: string): void {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(key, value);
  }
};
