import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { IProvider, QuotaSnapshot, BucketInfo } from './types.js';
import { AccountRow, accountRepo } from '../db/index.js';
import { config } from '../config.js';

export class AnthropicProvider implements IProvider {
  id = 'anthropic';
  name = 'Anthropic Claude';
  description = 'Claude API Rate Limits & Organization Quotas';
  authType: 'api_key' = 'api_key';

  brand = {
    name: 'Anthropic Claude',
    icon: 'Bot',
    color: 'amber',
    badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20'
  };

  authDoc = {
    title: 'Claude Subscription or API Key',
    description: 'Monitor Claude Pro/Team 5-hour sessions and weekly token usage, or Anthropic Console rate limits.',
    linkText: 'Anthropic Console',
    linkUrl: 'https://console.anthropic.com/settings/keys'
  };

  fields = [
    {
      key: 'authMode',
      label: 'Connection Mode',
      type: 'select' as const,
      defaultValue: 'subscription',
      options: [
        { label: 'Claude Pro/Team (Auto-detect via claude.json)', value: 'subscription' },
        { label: 'Anthropic API Key (sk-ant-api03-...)', value: 'api_key' }
      ]
    },
    {
      key: 'apiKey',
      label: 'Anthropic API Key',
      type: 'password' as const,
      placeholder: 'sk-ant-api03-...',
      required: false,
      description: 'Leave empty if using Claude Pro/Team subscription mode.'
    }
  ];

  private findClaudeSubscriptionConfig(): any | null {
    const candidatePaths = [
      path.join(config.dataDir || '/data', 'claude.json'),
      path.join(config.dataDir || '/data', '.claude.json'),
      path.join(process.cwd(), 'data', 'claude.json'),
      path.join(os.homedir(), '.claude.json')
    ];

    // If ~/.claude.json exists and /data/claude.json doesn't, or is newer, sync it
    try {
      const hostHomeConfig = path.join(os.homedir(), '.claude.json');
      const dataConfig = path.join(config.dataDir || '/data', 'claude.json');
      if (fs.existsSync(hostHomeConfig)) {
        const hostStat = fs.statSync(hostHomeConfig);
        let shouldSync = true;
        if (fs.existsSync(dataConfig)) {
          const dataStat = fs.statSync(dataConfig);
          shouldSync = hostStat.mtimeMs > dataStat.mtimeMs;
        }
        if (shouldSync) {
          try {
            fs.copyFileSync(hostHomeConfig, dataConfig);
          } catch {}
        }
      }
    } catch {}

    for (const p of candidatePaths) {
      try {
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, 'utf8');
          const parsed = JSON.parse(raw);
          if (parsed.cachedUsageUtilization || parsed.oauthAccount) {
            return parsed;
          }
        }
      } catch {}
    }
    return null;
  }

  /**
   * Roll a stale resets_at timestamp forward by periodMs until it's in the future.
   * Returns an ISO string of the next future reset, or null if input is null/invalid.
   */
  private computeNextReset(resetsAt: string | null | undefined, periodMs: number): string | null {
    if (!resetsAt) return null;
    const resetTime = new Date(resetsAt).getTime();
    if (isNaN(resetTime)) return null;

    const now = Date.now();
    if (resetTime > now) return resetsAt; // already in the future

    // Roll forward by the period until we get a future time
    const elapsed = now - resetTime;
    const periodsNeeded = Math.ceil(elapsed / periodMs);
    const nextReset = new Date(resetTime + periodsNeeded * periodMs);
    return nextReset.toISOString();
  }

  private static readonly FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
  private static readonly SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  private buildClaudeSubscriptionSnapshot(account: AccountRow, claudeData: any): QuotaSnapshot {
    const oauth = claudeData.oauthAccount || {};
    const usageWrapper = claudeData.cachedUsageUtilization || {};
    const util = usageWrapper.utilization || {};
    const fiveHour = util.five_hour || {};
    const sevenDay = util.seven_day || {};
    const limits = util.limits || [];
    const tokenStats = claudeData.tokenStats;

    // Also extract from the limits array for better data when available
    const sessionLimit = limits.find((l: any) => l.kind === 'session' || l.group === 'session');
    const weeklyLimit = limits.find((l: any) => l.kind === 'weekly_all' || l.group === 'weekly');

    const buckets: BucketInfo[] = [];

    // 1. 5-Hour Session Window
    const fiveHourUsed = typeof fiveHour.utilization === 'number' ? fiveHour.utilization : 0;
    const fiveHourRemaining = Math.max(0, 1 - (fiveHourUsed / 100));
    const fiveHourResetRaw = fiveHour.resets_at || sessionLimit?.resets_at || null;
    buckets.push({
      modelId: 'claude-5h-session',
      tokenType: 'MESSAGES',
      remainingFraction: fiveHourRemaining,
      remainingAmount: Math.round(100 - fiveHourUsed),
      limitAmount: 100,
      resetTime: this.computeNextReset(fiveHourResetRaw, AnthropicProvider.FIVE_HOURS_MS),
      usedPercent: Math.round(fiveHourUsed)
    });

    // 2. 7-Day Weekly Allowance
    const sevenDayUsed = typeof sevenDay.utilization === 'number' ? sevenDay.utilization : 0;
    const sevenDayRemaining = Math.max(0, 1 - (sevenDayUsed / 100));
    const sevenDayResetRaw = sevenDay.resets_at || weeklyLimit?.resets_at || null;
    const sevenDayResetTime = this.computeNextReset(sevenDayResetRaw, AnthropicProvider.SEVEN_DAYS_MS);
    buckets.push({
      modelId: 'claude-7d-weekly',
      tokenType: 'TOKENS',
      remainingFraction: sevenDayRemaining,
      remainingAmount: Math.round(100 - sevenDayUsed),
      limitAmount: 100,
      resetTime: sevenDayResetTime,
      usedPercent: Math.round(sevenDayUsed)
    });

    // 3. Raw Token metrics (from Claude Code activity if available)
    if (tokenStats && tokenStats.totalProcessedTokens) {
      buckets.push({
        modelId: 'claude-output-tokens',
        tokenType: 'TOKENS',
        remainingFraction: sevenDayRemaining,
        remainingAmount: tokenStats.totalOutputTokens,
        limitAmount: null,
        resetTime: sevenDayResetTime,
        usedPercent: Math.round(sevenDayUsed)
      });
      buckets.push({
        modelId: 'claude-total-tokens',
        tokenType: 'TOKENS',
        remainingFraction: sevenDayRemaining,
        remainingAmount: tokenStats.totalProcessedTokens,
        limitAmount: null,
        resetTime: sevenDayResetTime,
        usedPercent: Math.round(sevenDayUsed)
      });
    }

    // Determine friendly tier
    let tier = 'Claude Team';
    if (oauth.organizationType === 'claude_team' || oauth.seatTier?.includes('team')) {
      tier = 'Claude Team';
    } else if (oauth.organizationType === 'claude_pro' || oauth.billingType?.includes('pro')) {
      tier = 'Claude Pro';
    } else if (oauth.organizationType === 'claude_max') {
      tier = 'Claude Max';
    } else if (oauth.seatTier) {
      tier = oauth.seatTier;
    }

    // If account has no email, update it with oauth email
    if (oauth.emailAddress && !account.email) {
      try {
        accountRepo.updateEmail(account.id, oauth.emailAddress);
      } catch {}
    }

    const rawJson = JSON.stringify({
      source: 'claude_subscription',
      organization: {
        name: oauth.organizationName || 'Claude Organization',
        type: oauth.organizationType,
        billingType: oauth.billingType,
        seatTier: oauth.seatTier,
        rateLimitTier: oauth.organizationRateLimitTier
      },
      user: {
        email: oauth.emailAddress,
        displayName: oauth.displayName || oauth.fullName
      },
      utilization: util,
      tokenStats: tokenStats || {
        status: 'active',
        note: 'Calculated from 5-hour rolling session and 7-day weekly limits'
      }
    });

    return {
      accountId: account.id,
      providerId: this.id,
      tier,
      buckets,
      rawJson
    };
  }

  async fetchQuota(account: AccountRow): Promise<QuotaSnapshot> {
    let creds: any = {};
    try {
      creds = JSON.parse(account.credentials);
    } catch {
      creds = {};
    }

    // Check if account is explicitly configured as Claude subscription or passed claudeConfig
    if (creds.isSubscription || creds.authType === 'claude_sub' || creds.claudeConfig) {
      const claudeData = creds.claudeConfig || this.findClaudeSubscriptionConfig();
      if (claudeData) {
        return this.buildClaudeSubscriptionSnapshot(account, claudeData);
      }
    }

    const apiKey = creds.apiKey || creds.token;

    // Check if subscription config is available locally
    const localClaudeSub = this.findClaudeSubscriptionConfig();

    if (!apiKey) {
      if (localClaudeSub) {
        return this.buildClaudeSubscriptionSnapshot(account, localClaudeSub);
      }
      throw new Error('Anthropic API Key or Claude Subscription config is missing in account credentials');
    }

    const isAdminKey = typeof apiKey === 'string' && apiKey.startsWith('sk-ant-admin');
    const buckets: BucketInfo[] = [];

    if (isAdminKey) {
      // 1. Try Admin API rate limits
      try {
        const res = await fetch('https://api.anthropic.com/v1/organizations/rate_limits', {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          }
        });

        if (res.ok) {
          const data: any = await res.json();
          const limits = data.data || data.rate_limits || [];
          for (const item of limits) {
            const limit = item.limit || 1;
            const remaining = typeof item.remaining === 'number' ? item.remaining : limit;
            const fraction = Math.max(0, Math.min(1, remaining / limit));
            buckets.push({
              modelId: item.model || 'claude-overall',
              tokenType: item.type || 'REQUESTS',
              remainingFraction: fraction,
              remainingAmount: remaining,
              limitAmount: limit,
              resetTime: item.resets_at || null,
              usedPercent: Math.round((1 - fraction) * 100)
            });
          }

          if (buckets.length > 0) {
            return {
              accountId: account.id,
              providerId: this.id,
              tier: 'ORGANIZATION',
              buckets,
              rawJson: JSON.stringify(data)
            };
          }
        }
      } catch (err) {
        console.warn('[Anthropic] Admin API call failed, falling back to header check:', err);
      }
    }

    // 2. Standard API Header extraction
    // Make a lightweight ping or model list request to read real-time ratelimit headers
    let apiStatus = 200;
    try {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        }
      });
      apiStatus = res.status;

      const headers = res.headers;
      const reqLimit = parseInt(headers.get('anthropic-ratelimit-requests-limit') || '0', 10);
      const reqRemaining = parseInt(headers.get('anthropic-ratelimit-requests-remaining') || '0', 10);
      const reqReset = headers.get('anthropic-ratelimit-requests-reset');

      const tokenLimit = parseInt(headers.get('anthropic-ratelimit-tokens-limit') || '0', 10);
      const tokenRemaining = parseInt(headers.get('anthropic-ratelimit-tokens-remaining') || '0', 10);
      const tokenReset = headers.get('anthropic-ratelimit-tokens-reset');

      if (reqLimit > 0) {
        const frac = Math.max(0, Math.min(1, reqRemaining / reqLimit));
        buckets.push({
          modelId: 'claude-requests',
          tokenType: 'REQUESTS',
          remainingFraction: frac,
          remainingAmount: reqRemaining,
          limitAmount: reqLimit,
          resetTime: reqReset || null,
          usedPercent: Math.round((1 - frac) * 100)
        });
      }

      if (tokenLimit > 0) {
        const frac = Math.max(0, Math.min(1, tokenRemaining / tokenLimit));
        buckets.push({
          modelId: 'claude-tokens',
          tokenType: 'TOKENS',
          remainingFraction: frac,
          remainingAmount: tokenRemaining,
          limitAmount: tokenLimit,
          resetTime: tokenReset || null,
          usedPercent: Math.round((1 - frac) * 100)
        });
      }
    } catch (err) {
      console.warn('[Anthropic] Models request failed:', err);
    }

    // 3. If Developer API returned no rate headers, but Claude Subscription is detected, use subscription!
    if (buckets.length === 0 && localClaudeSub) {
      return this.buildClaudeSubscriptionSnapshot(account, localClaudeSub);
    }

    // 4. Fallback if no rate headers and no subscription config
    if (buckets.length === 0) {
      buckets.push({
        modelId: 'claude-tier-active',
        tokenType: 'REQUESTS',
        remainingFraction: apiStatus === 200 ? 1.0 : 0.0,
        resetTime: null,
        usedPercent: apiStatus === 200 ? 0 : 100
      });
    }

    return {
      accountId: account.id,
      providerId: this.id,
      tier: 'API_KEY',
      buckets,
      rawJson: JSON.stringify({ status: apiStatus })
    };
  }
}
