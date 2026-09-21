import { IProvider, QuotaSnapshot, BucketInfo } from './types.js';
import { AccountRow } from '../db/index.js';

export class OpenAIProvider implements IProvider {
  id = 'openai';
  name = 'OpenAI';
  description = 'OpenAI API rate limits, remaining tokens, and organization allowances';
  authType: 'api_key' = 'api_key';

  brand = {
    name: 'OpenAI',
    icon: 'Zap',
    color: 'emerald',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
  };

  authDoc = {
    title: 'OpenAI API Key',
    description: 'Track request rate limits, token quotas, and active windows for GPT-4o, o1, and o3-mini models.',
    linkText: 'OpenAI API Keys',
    linkUrl: 'https://platform.openai.com/api-keys'
  };

  fields = [
    {
      key: 'apiKey',
      label: 'OpenAI API Key',
      type: 'password' as const,
      placeholder: 'sk-proj-... or sk-...',
      required: true,
      description: 'Your secret API key from the OpenAI Platform.'
    },
    {
      key: 'organization',
      label: 'Organization ID (Optional)',
      type: 'text' as const,
      placeholder: 'org-...',
      required: false,
      description: 'Optional organization identifier for multi-tenant accounts.'
    },
    {
      key: 'project',
      label: 'Project ID (Optional)',
      type: 'text' as const,
      placeholder: 'proj-...',
      required: false,
      description: 'Optional project identifier for project-scoped service keys.'
    }
  ];

  async fetchQuota(account: AccountRow): Promise<QuotaSnapshot> {
    const creds = JSON.parse(account.credentials);
    const apiKey = creds.apiKey || creds.token;

    if (!apiKey) {
      throw new Error('OpenAI API Key is required');
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };

    if (creds.organization) {
      headers['OpenAI-Organization'] = creds.organization;
    }
    if (creds.project) {
      headers['OpenAI-Project'] = creds.project;
    }

    // 1. Verify key by listing models
    let modelsData: any = null;
    try {
      const modelsRes = await fetch('https://api.openai.com/v1/models', { headers });
      if (!modelsRes.ok) {
        const errText = await modelsRes.text();
        throw new Error(`OpenAI authentication failed (${modelsRes.status}): ${errText}`);
      }
      modelsData = await modelsRes.json();
    } catch (err: any) {
      throw new Error(`Failed to query OpenAI models: ${err.message}`);
    }

    // 2. Perform a probe request to read rate-limit response headers
    const buckets: BucketInfo[] = [];
    let rateLimitHeaders: Record<string, string> = {};

    try {
      const probeRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1
        })
      });

      probeRes.headers.forEach((value, key) => {
        if (key.startsWith('x-ratelimit-')) {
          rateLimitHeaders[key] = value;
        }
      });

      // Parse remaining requests
      const remReq = probeRes.headers.get('x-ratelimit-remaining-requests');
      const limitReq = probeRes.headers.get('x-ratelimit-limit-requests');
      const resetReq = probeRes.headers.get('x-ratelimit-reset-requests');

      if (remReq && limitReq) {
        const remaining = parseInt(remReq, 10);
        const limit = parseInt(limitReq, 10);
        const fraction = limit > 0 ? Math.max(0, Math.min(1, remaining / limit)) : 1.0;
        
        let resetIso: string | null = null;
        if (resetReq) {
          resetIso = this.parseResetHeader(resetReq);
        }

        buckets.push({
          modelId: 'openai-requests-quota',
          tokenType: 'REQUESTS',
          remainingFraction: fraction,
          remainingAmount: remaining,
          limitAmount: limit,
          resetTime: resetIso,
          usedPercent: Math.round((1 - fraction) * 100)
        });
      }

      // Parse remaining tokens
      const remTokens = probeRes.headers.get('x-ratelimit-remaining-tokens');
      const limitTokens = probeRes.headers.get('x-ratelimit-limit-tokens');
      const resetTokens = probeRes.headers.get('x-ratelimit-reset-tokens');

      if (remTokens && limitTokens) {
        const remaining = parseInt(remTokens, 10);
        const limit = parseInt(limitTokens, 10);
        const fraction = limit > 0 ? Math.max(0, Math.min(1, remaining / limit)) : 1.0;

        let resetIso: string | null = null;
        if (resetTokens) {
          resetIso = this.parseResetHeader(resetTokens);
        }

        buckets.push({
          modelId: 'openai-tokens-quota',
          tokenType: 'TOKENS',
          remainingFraction: fraction,
          remainingAmount: remaining,
          limitAmount: limit,
          resetTime: resetIso,
          usedPercent: Math.round((1 - fraction) * 100)
        });
      }
    } catch {
      // Non-fatal if completion probe is restricted
    }

    // Default status bucket if no rate limit headers could be extracted
    if (buckets.length === 0) {
      buckets.push({
        modelId: 'openai-api-active',
        tokenType: 'STATUS',
        remainingFraction: 1.0,
        remainingAmount: modelsData?.data?.length || 1,
        limitAmount: modelsData?.data?.length || 1,
        resetTime: null,
        usedPercent: 0
      });
    }

    return {
      accountId: account.id,
      providerId: this.id,
      tier: 'API_KEY',
      buckets,
      rawJson: JSON.stringify({
        rateLimits: rateLimitHeaders,
        modelsCount: modelsData?.data?.length || 0
      }, null, 2)
    };
  }

  private parseResetHeader(resetStr: string): string | null {
    // Examples: "6ms", "1s", "1m30s", "2h"
    try {
      let totalMs = 0;
      const msMatch = resetStr.match(/(\d+)ms/);
      const sMatch = resetStr.match(/(\d+)s/);
      const mMatch = resetStr.match(/(\d+)m(?!s)/);
      const hMatch = resetStr.match(/(\d+)h/);

      if (msMatch) totalMs += parseInt(msMatch[1], 10);
      if (sMatch) totalMs += parseInt(sMatch[1], 10) * 1000;
      if (mMatch) totalMs += parseInt(mMatch[1], 10) * 60 * 1000;
      if (hMatch) totalMs += parseInt(hMatch[1], 10) * 60 * 60 * 1000;

      if (totalMs > 0) {
        return new Date(Date.now() + totalMs).toISOString();
      }
    } catch {}
    return null;
  }
}
