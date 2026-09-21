import { IProvider, QuotaSnapshot, BucketInfo } from './types.js';
import { AccountRow } from '../db/index.js';

function getNestedValue(obj: any, pathStr: string): any {
  if (!obj || !pathStr) return undefined;
  const parts = pathStr.split('.');
  let curr = obj;
  for (const part of parts) {
    if (curr == null) return undefined;
    curr = curr[part];
  }
  return curr;
}

export class GenericRestProvider implements IProvider {
  id = 'generic-rest';
  name = 'Custom REST API';
  description = 'Configurable REST API quota provider';
  authType: 'custom' = 'custom';

  brand = {
    name: 'Custom REST API',
    icon: 'Globe',
    color: 'emerald',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
  };

  authDoc = {
    title: 'Custom REST API Endpoint',
    description: 'Poll any custom or self-hosted API endpoint that returns JSON quota or balance metrics.'
  };

  fields = [
    {
      key: 'url',
      label: 'API Endpoint URL',
      type: 'text' as const,
      placeholder: 'https://api.my-service.com/v1/quota',
      required: true
    },
    {
      key: 'method',
      label: 'HTTP Method',
      type: 'select' as const,
      defaultValue: 'GET',
      options: [
        { label: 'GET', value: 'GET' },
        { label: 'POST', value: 'POST' }
      ]
    },
    {
      key: 'token',
      label: 'Bearer Token or API Key',
      type: 'password' as const,
      placeholder: 'Secret token or key (Optional)',
      required: false
    },
    {
      key: 'remainingPath',
      label: 'Remaining Fraction JSON Path',
      type: 'text' as const,
      placeholder: 'e.g. remaining_fraction or quota.fraction',
      defaultValue: 'remaining_fraction',
      required: false,
      description: 'Dot-notation path to the 0.0 - 1.0 fraction or remaining value in the JSON response.'
    }
  ];

  async fetchQuota(account: AccountRow): Promise<QuotaSnapshot> {
    const creds = JSON.parse(account.credentials);
    const url = creds.url;
    const method = (creds.method || 'GET').toUpperCase();
    const apiKey = creds.apiKey || creds.token;

    if (!url) {
      throw new Error('Custom REST provider requires a target "url"');
    }

    // Template headers with apiKey
    const rawHeaders: Record<string, string> = creds.headers || {};
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawHeaders)) {
      headers[k] = v.replace('{{apiKey}}', apiKey || '').replace('{{token}}', apiKey || '');
    }

    if (!headers['Authorization'] && apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: method === 'POST' && creds.body ? JSON.stringify(creds.body) : undefined
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Custom REST call failed (${res.status}): ${errText}`);
    }

    const data: any = await res.json();
    const buckets: BucketInfo[] = [];

    // Extract remaining fraction using dot-notation path
    const remainingVal = creds.remainingPath ? getNestedValue(data, creds.remainingPath) : null;
    const totalVal = creds.totalPath ? getNestedValue(data, creds.totalPath) : null;
    const resetVal = creds.resetPath ? getNestedValue(data, creds.resetPath) : null;

    let fraction = 1.0;
    if (typeof remainingVal === 'number') {
      if (typeof totalVal === 'number' && totalVal > 0) {
        fraction = remainingVal / totalVal;
      } else if (remainingVal <= 1.0) {
        fraction = remainingVal;
      } else {
        fraction = Math.min(1.0, remainingVal / 100);
      }
    }

    fraction = Math.max(0, Math.min(1, fraction));

    const remainingAmount = typeof remainingVal === 'number' ? remainingVal : null;
    const limitAmount = typeof totalVal === 'number' ? totalVal : null;

    buckets.push({
      modelId: creds.modelId || account.label || 'api-quota',
      tokenType: creds.tokenType || 'CREDITS',
      remainingFraction: fraction,
      remainingAmount,
      limitAmount,
      resetTime: typeof resetVal === 'string' ? resetVal : null,
      usedPercent: Math.round((1 - fraction) * 100)
    });

    return {
      accountId: account.id,
      providerId: account.provider_id || this.id,
      tier: creds.tier || 'CUSTOM',
      buckets,
      rawJson: JSON.stringify(data)
    };
  }
}
