import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { accountRepo, AccountRow } from '../db/index.js';

export interface StoredAccount {
  id: string;
  providerId: string;
  label: string;
  email?: string;
  credentials: Record<string, any>;
  status?: 'active' | 'rate_limited' | 'error' | 'disabled';
  createdAt?: string;
  updatedAt?: string;
}

export interface AccountsFileContent {
  accounts: StoredAccount[];
}

let isWriting = false;
let watcher: fs.FSWatcher | null = null;

export class AccountsStorageService {
  /**
   * Initializes the accounts.json file. Creates it with empty array if missing.
   * Then synchronizes disk accounts with SQLite.
   */
  static init(): void {
    const filePath = config.accountsFilePath;
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(filePath)) {
      console.log(`[AccountsStorage] Initializing fresh empty accounts file at ${filePath}`);
      this.writeDiskFile({ accounts: [] });
    } else {
      console.log(`[AccountsStorage] Loading existing accounts file from ${filePath}`);
      this.syncDiskToDb();
    }

    this.startWatcher();
  }

  /**
   * Reads from disk accounts.json and upserts into SQLite
   */
  static syncDiskToDb(): void {
    try {
      const content = fs.readFileSync(config.accountsFilePath, 'utf8');
      if (!content.trim()) return;

      const parsed: AccountsFileContent = JSON.parse(content);
      if (!Array.isArray(parsed.accounts)) return;

      for (const acc of parsed.accounts) {
        accountRepo.upsert({
          id: acc.id,
          provider_id: acc.providerId,
          label: acc.label,
          email: acc.email,
          credentials: JSON.stringify(acc.credentials),
          status: acc.status || 'active'
        });
      }
      console.log(`[AccountsStorage] Synced ${parsed.accounts.length} account(s) from disk to DB`);
    } catch (err) {
      console.error('[AccountsStorage] Error reading accounts file:', err);
    }
  }

  /**
   * Writes all current DB accounts out to /data/accounts.json
   */
  static syncDbToDisk(): void {
    isWriting = true;
    try {
      const rows = accountRepo.getAll();
      const accounts: StoredAccount[] = rows.map(r => ({
        id: r.id,
        providerId: r.provider_id,
        label: r.label,
        email: r.email || undefined,
        credentials: JSON.parse(r.credentials),
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }));

      this.writeDiskFile({ accounts });
    } catch (err) {
      console.error('[AccountsStorage] Error saving DB to accounts file:', err);
    } finally {
      setTimeout(() => {
        isWriting = false;
      }, 500);
    }
  }

  private static writeDiskFile(data: AccountsFileContent): void {
    const tempFile = `${config.accountsFilePath}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempFile, config.accountsFilePath);
  }

  /**
   * Watch accounts.json for external modifications
   */
  private static startWatcher(): void {
    if (watcher) return;

    try {
      let debounceTimer: NodeJS.Timeout | null = null;

      watcher = fs.watch(config.accountsFilePath, (eventType) => {
        if (isWriting) return; // Skip our own programmatic writes

        if (eventType === 'change') {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            console.log('[AccountsStorage] accounts.json externally modified, reloading...');
            this.syncDiskToDb();
          }, 300);
        }
      });

      // Crucial: unref watcher so it doesn't prevent Node process from exiting
      if (watcher.unref) {
        watcher.unref();
      }

      console.log(`[AccountsStorage] Watching ${config.accountsFilePath} for changes`);
    } catch (err) {
      console.warn('[AccountsStorage] Could not attach file watcher:', err);
    }
  }

  static stopWatcher(): void {
    if (watcher) {
      watcher.close();
      watcher = null;
    }
  }
}
