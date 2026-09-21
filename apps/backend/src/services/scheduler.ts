import { accountRepo, snapshotRepo, AccountRow } from '../db/index.js';
import { providerRegistry, QuotaSnapshot } from '../providers/index.js';
import { wsHub } from './websocket.js';
import { config } from '../config.js';

class QuotaScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isPolling = false;

  start(intervalSeconds = config.pollIntervalSeconds): void {
    this.stop();
    console.log(`[Scheduler] Starting background quota polling (every ${intervalSeconds}s)`);

    // Run initial poll shortly after startup
    setTimeout(() => {
      this.pollAll();
    }, 2000);

    this.timer = setInterval(() => {
      this.pollAll();
    }, intervalSeconds * 1000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async pollAccount(account: AccountRow): Promise<QuotaSnapshot | null> {
    const provider = providerRegistry.get(account.provider_id);
    if (!provider) {
      accountRepo.updateStatus(account.id, 'error', `Unknown provider: ${account.provider_id}`);
      return null;
    }

    try {
      const snapshot = await provider.fetchQuota(account);

      // Save snapshots to database
      for (const bucket of snapshot.buckets) {
        snapshotRepo.record({
          account_id: account.id,
          provider_id: account.provider_id,
          model_id: bucket.modelId,
          token_type: bucket.tokenType,
          remaining_fraction: bucket.remainingFraction,
          remaining_amount: bucket.remainingAmount,
          limit_amount: bucket.limitAmount,
          reset_time: bucket.resetTime,
          raw_json: snapshot.rawJson
        });
      }

      // Check if any bucket is completely exhausted
      const isExhausted = snapshot.buckets.some(b => b.remainingFraction <= 0.01);
      const status = isExhausted ? 'rate_limited' : 'active';
      accountRepo.updateStatus(account.id, status, null);

      // Persist learned tier into account credentials
      if (snapshot.tier) {
        try {
          const creds = JSON.parse(account.credentials);
          if (creds.tier !== snapshot.tier) {
            creds.tier = snapshot.tier;
            accountRepo.updateCredentials(account.id, JSON.stringify(creds));
          }
        } catch {}
      }

      // Parse & scrub raw response for client delivery
      let parsedRaw: any = null;
      if (snapshot.rawJson) {
        try {
          parsedRaw = JSON.parse(snapshot.rawJson);
          // Scrub sensitive credentials or tokens
          const scrub = (obj: any): any => {
            if (!obj || typeof obj !== 'object') return obj;
            if (Array.isArray(obj)) return obj.map(scrub);
            const clean: Record<string, any> = {};
            for (const [k, v] of Object.entries(obj)) {
              if (/token|secret|password|key/i.test(k) && typeof v === 'string') {
                clean[k] = v.length > 10 ? `${v.slice(0, 4)}...${v.slice(-4)}` : '******';
              } else {
                clean[k] = scrub(v);
              }
            }
            return clean;
          };
          parsedRaw = scrub(parsedRaw);
        } catch {
          parsedRaw = snapshot.rawJson;
        }
      }

      // Broadcast update to WebSocket clients
      wsHub.broadcast('QUOTA_UPDATED', {
        accountId: account.id,
        providerId: account.provider_id,
        tier: snapshot.tier,
        status,
        buckets: snapshot.buckets,
        rawResponse: parsedRaw,
        lastPolledAt: new Date().toISOString()
      });

      return snapshot;
    } catch (err: any) {
      const errMsg = err.message || 'Unknown polling failure';
      console.warn(`[Scheduler] Error polling account ${account.label} (${account.id}):`, errMsg);
      accountRepo.updateStatus(account.id, 'error', errMsg);

      wsHub.broadcast('ACCOUNT_ERROR', {
        accountId: account.id,
        error: errMsg
      });

      return null;
    }
  }

  async pollAll(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const accounts = accountRepo.getAll().filter(a => a.status !== 'disabled');
      if (accounts.length > 0) {
        console.log(`[Scheduler] Polling ${accounts.length} active account(s)...`);
      }

      for (const account of accounts) {
        await this.pollAccount(account);
      }

      // Cleanup old history beyond retention period
      snapshotRepo.cleanupOldSnapshots(config.dataRetentionDays);
    } catch (err) {
      console.error('[Scheduler] Unexpected error during polling cycle:', err);
    } finally {
      this.isPolling = false;
    }
  }
}

export const quotaScheduler = new QuotaScheduler();
