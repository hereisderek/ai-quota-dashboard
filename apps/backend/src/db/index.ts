import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

let dbInstance: DatabaseSync | null = null;

export interface AccountRow {
  id: string;
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
  reset_time: string | null;
  raw_json: string | null;
  recorded_at: string;
}

export function getDb(): DatabaseSync {
  if (!dbInstance) {
    // Ensure parent directory exists
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
  // Use WAL mode for maximum performance and concurrency
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');

  // Accounts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
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

  // Quota snapshots table (time series)
  db.exec(`
    CREATE TABLE IF NOT EXISTS quota_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      token_type TEXT NOT NULL,
      remaining_fraction REAL NOT NULL,
      reset_time TEXT,
      raw_json TEXT,
      recorded_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_account ON quota_snapshots(account_id, recorded_at DESC);
    CREATE INDEX IF NOT EXISTS idx_snapshots_provider ON quota_snapshots(provider_id, recorded_at DESC);
  `);

  // Settings key-value store
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  console.log('[DB] Schema initialized successfully at', config.dbPath);
}

// Account Repository
export const accountRepo = {
  getAll(): AccountRow[] {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM accounts ORDER BY created_at ASC');
    return stmt.all() as unknown as AccountRow[];
  },

  getById(id: string): AccountRow | undefined {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM accounts WHERE id = ?');
    return stmt.get(id) as unknown as AccountRow | undefined;
  },

  upsert(account: {
    id: string;
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
        SET provider_id = ?, label = ?, email = ?, credentials = ?, status = ?, updated_at = ?
        WHERE id = ?
      `);
      stmt.run(
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
        INSERT INTO accounts (id, provider_id, label, email, credentials, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        account.id,
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

  updateCredentials(id: string, credentials: string): void {
    const db = getDb();
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE accounts 
      SET credentials = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(credentials, now, id);
  },

  delete(id: string): void {
    const db = getDb();
    const stmt1 = db.prepare('DELETE FROM quota_snapshots WHERE account_id = ?');
    stmt1.run(id);
    const stmt2 = db.prepare('DELETE FROM accounts WHERE id = ?');
    stmt2.run(id);
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
    reset_time?: string | null;
    raw_json?: string | null;
  }): void {
    const db = getDb();
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO quota_snapshots (account_id, provider_id, model_id, token_type, remaining_fraction, reset_time, raw_json, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      snapshot.account_id,
      snapshot.provider_id,
      snapshot.model_id,
      snapshot.token_type,
      snapshot.remaining_fraction,
      snapshot.reset_time ?? null,
      snapshot.raw_json ?? null,
      now
    );
  },

  getLatestForAccount(accountId: string): QuotaSnapshotRow[] {
    const db = getDb();
    // Get latest snapshot per model for this account
    const stmt = db.prepare(`
      SELECT s.*
      FROM quota_snapshots s
      INNER JOIN (
        SELECT account_id, model_id, MAX(recorded_at) as max_time
        FROM quota_snapshots
        WHERE account_id = ?
        GROUP BY account_id, model_id
      ) latest ON s.account_id = latest.account_id 
             AND s.model_id = latest.model_id 
             AND s.recorded_at = latest.max_time
      ORDER BY s.model_id ASC
    `);
    return stmt.all(accountId) as unknown as QuotaSnapshotRow[];
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
