import { IProvider, QuotaSnapshot, BucketInfo } from './types.js';
import { AccountRow } from '../db/index.js';

export class GitHubCopilotProvider implements IProvider {
  id = 'github-copilot';
  name = 'GitHub Copilot';
  description = 'GitHub Copilot Organization & Enterprise Usage Metrics';
  authType: 'api_key' = 'api_key';

  async fetchQuota(account: AccountRow): Promise<QuotaSnapshot> {
    const creds = JSON.parse(account.credentials);
    const token = creds.token || creds.pat || creds.apiKey;
    const org = creds.org;
    const enterprise = creds.enterprise;

    if (!token) {
      throw new Error('GitHub Personal Access Token is required');
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ai-quota-dashboard'
    };

    const buckets: BucketInfo[] = [];
    let tier = 'COPILOT_BUSINESS';
    let rawData: any = null;

    if (org) {
      // 1. Organization Copilot Billing / Usage API
      try {
        const res = await fetch(`https://api.github.com/orgs/${encodeURIComponent(org)}/copilot/billing`, {
          headers
        });

        if (res.ok) {
          rawData = await res.json();
          const seatBreakdown = rawData.seat_breakdown || {};
          const totalSeats = seatBreakdown.total || 1;
          const activeSeats = seatBreakdown.active_this_cycle || 0;
          const remainingFraction = Math.max(0, 1 - (activeSeats / totalSeats));

          buckets.push({
            modelId: 'copilot-seats',
            tokenType: 'SEATS',
            remainingFraction,
            resetTime: null,
            usedPercent: Math.round((activeSeats / totalSeats) * 100)
          });
          tier = rawData.plan_type || 'ORGANIZATION';
        }
      } catch (err) {
        console.warn('[GitHubCopilot] Org billing call failed:', err);
      }
    } else if (enterprise) {
      // 2. Enterprise Billing API
      try {
        const res = await fetch(`https://api.github.com/enterprises/${encodeURIComponent(enterprise)}/copilot/billing`, {
          headers
        });
        if (res.ok) {
          rawData = await res.json();
          tier = 'ENTERPRISE';
        }
      } catch (err) {
        console.warn('[GitHubCopilot] Enterprise billing call failed:', err);
      }
    }

    // Fallback: Check general GitHub rate limits if Copilot specific endpoint isn't available for user
    if (buckets.length === 0) {
      const rateRes = await fetch('https://api.github.com/rate_limit', { headers });
      if (rateRes.ok) {
        rawData = await rateRes.json();
        const core = rawData.resources?.core;
        if (core) {
          const frac = Math.max(0, Math.min(1, core.remaining / (core.limit || 1)));
          const resetDate = new Date(core.reset * 1000).toISOString();
          buckets.push({
            modelId: 'github-api-quota',
            tokenType: 'REQUESTS',
            remainingFraction: frac,
            resetTime: resetDate,
            usedPercent: Math.round((1 - frac) * 100)
          });
          tier = 'GITHUB_TOKEN';
        }
      }
    }

    if (buckets.length === 0) {
      buckets.push({
        modelId: 'copilot-status',
        tokenType: 'REQUESTS',
        remainingFraction: 1.0,
        resetTime: null,
        usedPercent: 0
      });
    }

    return {
      accountId: account.id,
      providerId: this.id,
      tier,
      buckets,
      rawJson: JSON.stringify(rawData || {})
    };
  }
}
