import { IProvider, QuotaSnapshot, BucketInfo } from './types.js';
import { AccountRow } from '../db/index.js';

export class AnthropicProvider implements IProvider {
  id = 'anthropic';
  name = 'Anthropic Claude';
  description = 'Claude API Rate Limits & Organization Quotas';
  authType: 'api_key' = 'api_key';

  async fetchQuota(account: AccountRow): Promise<QuotaSnapshot> {
    const creds = JSON.parse(account.credentials);
    const apiKey = creds.apiKey || creds.token;

    if (!apiKey) {
      throw new Error('Anthropic API Key is missing in account credentials');
    }

    const isAdminKey = apiKey.startsWith('sk-ant-admin');
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
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    });

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

    // If no rate headers returned (e.g. models endpoint didn't expose them), provide standard status
    if (buckets.length === 0) {
      buckets.push({
        modelId: 'claude-tier-active',
        tokenType: 'REQUESTS',
        remainingFraction: res.ok ? 1.0 : 0.0,
        resetTime: null,
        usedPercent: res.ok ? 0 : 100
      });
    }

    return {
      accountId: account.id,
      providerId: this.id,
      tier: 'API_KEY',
      buckets,
      rawJson: JSON.stringify({ status: res.status })
    };
  }
}
