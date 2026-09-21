import { IProvider, QuotaSnapshot, BucketInfo } from './types.js';
import { AccountRow } from '../db/index.js';

export class OpenRouterProvider implements IProvider {
  id = 'openrouter';
  name = 'OpenRouter';
  description = 'OpenRouter AI credits balance, usage, and rate-limit tracking';
  authType: 'api_key' = 'api_key';

  brand = {
    name: 'OpenRouter',
    icon: 'Layers',
    color: 'indigo',
    badgeClass: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20'
  };

  authDoc = {
    title: 'OpenRouter API Key',
    description: 'Monitor your OpenRouter credit balance, total spent, and model request allowances.',
    linkText: 'OpenRouter Keys',
    linkUrl: 'https://openrouter.ai/keys'
  };

  fields = [
    {
      key: 'apiKey',
      label: 'OpenRouter API Key',
      type: 'password' as const,
      placeholder: 'sk-or-v1-...',
      required: true,
      description: 'Your OpenRouter personal or team API key.'
    }
  ];

  async fetchQuota(account: AccountRow): Promise<QuotaSnapshot> {
    const creds = JSON.parse(account.credentials);
    const apiKey = creds.apiKey || creds.token;

    if (!apiKey) {
      throw new Error('OpenRouter API Key is required');
    }

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ai-quota-dashboard.local',
      'X-Title': 'AI Quota Dashboard'
    };

    // 1. Fetch Key Details & Limit
    let keyData: any = null;
    try {
      const keyRes = await fetch('https://openrouter.ai/api/v1/auth/key', { headers });
      if (keyRes.ok) {
        const json: any = await keyRes.json();
        keyData = json.data;
      } else {
        const errText = await keyRes.text();
        throw new Error(`OpenRouter key verification failed (${keyRes.status}): ${errText}`);
      }
    } catch (err: any) {
      throw new Error(`Failed to query OpenRouter auth/key: ${err.message}`);
    }

    // 2. Fetch Account Credits Balance
    let creditsData: any = null;
    try {
      const credsRes = await fetch('https://openrouter.ai/api/v1/credits', { headers });
      if (credsRes.ok) {
        const json: any = await credsRes.json();
        creditsData = json.data;
      }
    } catch {
      // Non-critical if credits endpoint is restricted
    }

    const buckets: BucketInfo[] = [];

    // Bucket A: Key Credit Limit / Balance
    if (keyData) {
      const usage = typeof keyData.usage === 'number' ? keyData.usage : 0;
      const limit = typeof keyData.limit === 'number' ? keyData.limit : null;

      if (limit != null && limit > 0) {
        const remaining = Math.max(0, limit - usage);
        const fraction = Math.max(0, Math.min(1, remaining / limit));
        buckets.push({
          modelId: 'openrouter-key-credit',
          tokenType: 'USD',
          remainingFraction: fraction,
          remainingAmount: Number(remaining.toFixed(2)),
          limitAmount: Number(limit.toFixed(2)),
          resetTime: null,
          usedPercent: Math.round((1 - fraction) * 100)
        });
      }

      // Rate limit info
      if (keyData.rate_limit) {
        const reqs = keyData.rate_limit.requests;
        const interval = keyData.rate_limit.interval;
        buckets.push({
          modelId: 'openrouter-rate-limit',
          tokenType: 'REQUESTS',
          remainingFraction: 1.0,
          remainingAmount: reqs,
          limitAmount: reqs,
          resetTime: null,
          usedPercent: 0
        });
      }
    }

    // Bucket B: Total Account Credits (USD)
    if (creditsData) {
      const totalCredits = typeof creditsData.total_credits === 'number' ? creditsData.total_credits : 0;
      const totalUsage = typeof creditsData.total_usage === 'number' ? creditsData.total_usage : 0;
      const remainingCredits = Math.max(0, totalCredits - totalUsage);

      // If key credit bucket wasn't added, or to show global credit pool
      if (buckets.length === 0 || totalCredits > 0) {
        const fraction = totalCredits > 0 ? Math.max(0, Math.min(1, remainingCredits / totalCredits)) : (remainingCredits > 0 ? 1.0 : 0.0);
        buckets.push({
          modelId: 'openrouter-account-balance',
          tokenType: 'USD',
          remainingFraction: fraction,
          remainingAmount: Number(remainingCredits.toFixed(2)),
          limitAmount: totalCredits > 0 ? Number(totalCredits.toFixed(2)) : null,
          resetTime: null,
          usedPercent: Math.round((1 - fraction) * 100)
        });
      }
    }

    // Fallback if no specific balance returned
    if (buckets.length === 0) {
      buckets.push({
        modelId: 'openrouter-api-active',
        tokenType: 'STATUS',
        remainingFraction: 1.0,
        remainingAmount: 1,
        limitAmount: 1,
        resetTime: null,
        usedPercent: 0
      });
    }

    const tier = keyData?.is_free_tier ? 'FREE' : 'PREPAID';

    return {
      accountId: account.id,
      providerId: this.id,
      tier,
      buckets,
      rawJson: JSON.stringify({
        key: keyData,
        credits: creditsData
      }, null, 2)
    };
  }
}
