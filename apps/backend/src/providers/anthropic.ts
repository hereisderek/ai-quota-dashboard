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

  private buildClaudeSubscriptionSnapshot(account: AccountRow, claudeData: any): QuotaSnapshot {
    const oauth = claudeData.oauthAccount || {};
    const usageWrapper = claudeData.cachedUsageUtilization || {};
    const util = usageWrapper.utilization || {};
    const fiveHour = util.five_hour || {};
    const sevenDay = util.seven_day || {};
    const limits = util.limits || [];
    const tokenStats = claudeData.tokenStats;

    const buckets: BucketInfo[] = [];

    // 1. 5-Hour Session Window
    const fiveHourUsed = typeof fiveHour.utilization === 'number' ? fiveHour.utilization : 0;
    const fiveHourRemaining = Math.max(0, 1 - (fiveHourUsed / 100));
    buckets.push({
      modelId: 'claude-5h-session',
      tokenType: 'MESSAGES',
      remainingFraction: fiveHourRemaining,
      remainingAmount: Math.round(100 - fiveHourUsed),
      limitAmount: 100,
      resetTime: fiveHour.resets_at || null,
      usedPercent: Math.round(fiveHourUsed)
    });

    // 2. 7-Day Weekly Allowance
    const sevenDayUsed = typeof sevenDay.utilization === 'number' ? sevenDay.utilization : 0;
    const sevenDayRemaining = Math.max(0, 1 - (sevenDayUsed / 100));
    buckets.push({
      modelId: 'claude-7d-weekly',
      tokenType: 'TOKENS',
      remainingFraction: sevenDayRemaining,
      remainingAmount: Math.round(100 - sevenDayUsed),
      limitAmount: 100,
      resetTime: sevenDay.resets_at || null,
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
        resetTime: sevenDay.resets_at || null,
        usedPercent: Math.round(sevenDayUsed)
      });
      buckets.push({
        modelId: 'claude-total-tokens',
        tokenType: 'TOKENS',
        remainingFraction: sevenDayRemaining,
        remainingAmount: tokenStats.totalProcessedTokens,
        limitAmount: null,
        resetTime: sevenDay.resets_at || null,
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
