import { IProvider, QuotaSnapshot, BucketInfo, TokenRefreshResult } from './types.js';
import { AccountRow, accountRepo } from '../db/index.js';
import { AccountsStorageService } from '../services/accountsStorage.js';
import { config } from '../config.js';

export class GoogleAntigravityProvider implements IProvider {
  id = 'google-antigravity';
  name = 'Google Antigravity';
  description = 'Google Cloud Code Assist & Gemini/Claude Quotas for Antigravity';
  authType: 'oauth' = 'oauth';

  private static OAUTH_SCOPES = [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/cclog'
  ].join(' ');

  getOAuthUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: config.googleClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GoogleAntigravityProvider.OAUTH_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeOAuthCode(code: string, redirectUri: string): Promise<Record<string, any>> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      redirect_uri: redirectUri
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google token exchange failed (${res.status}): ${errText}`);
    }

    const data: any = await res.json();
    const accessToken = data.access_token;
    const refreshToken = data.refresh_token;
    const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;

    // Fetch user info for display label
    let email = 'Google Account';
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (userRes.ok) {
        const userInfo: any = await userRes.json();
        email = userInfo.email || email;
      }
    } catch {
      // Ignore userinfo failure
    }

    return {
      accessToken,
      refreshToken,
      expiresAt,
      email
    };
  }

  async refreshToken(credentials: Record<string, any>): Promise<TokenRefreshResult> {
    if (!credentials.refreshToken) {
      throw new Error('No refresh token available to renew credentials');
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google refresh token failed (${res.status}): ${errText}`);
    }

    const data: any = await res.json();
    return {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000
    };
  }

  async fetchQuota(account: AccountRow): Promise<QuotaSnapshot> {
    let creds = JSON.parse(account.credentials);

    // Refresh token if expired or about to expire in next 5 minutes
    if (!creds.accessToken || !creds.expiresAt || Date.now() > creds.expiresAt - 5 * 60 * 1000) {
      const refreshed = await this.refreshToken(creds);
      creds.accessToken = refreshed.accessToken;
      creds.expiresAt = refreshed.expiresAt;
    }

    // Step 1: Session initialization and project discovery via loadCodeAssist
    let companionProject = creds.projectId || creds.companionProject;
    let currentTier = creds.tier || 'free-tier';
    let paidTier = creds.paidTier || null;
    let gcpManaged = creds.gcpManaged ?? false;
    let loadData: any = null;

    const loadEndpoints = [
      'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist',
      'https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist'
    ];

    for (const endpoint of loadEndpoints) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${creds.accessToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'antigravity / Gemini CLI'
          },
          body: JSON.stringify({
            metadata: {
              ideType: 'GEMINI_CLI',
              pluginType: 'GEMINI'
            }
          })
        });

        if (res.ok) {
          loadData = await res.json();
          if (loadData.cloudaicompanionProject) {
            companionProject = loadData.cloudaicompanionProject;
          }
          if (loadData.currentTier) {
            currentTier = loadData.currentTier;
          }
          if (loadData.paidTier) {
            paidTier = loadData.paidTier;
          }
          if (typeof loadData.gcpManaged === 'boolean') {
            gcpManaged = loadData.gcpManaged;
          }
          break;
        }
      } catch {
        // Try fallback endpoint
      }
    }

    // Detect tier classification
    let tier = 'FREE';
    const paidTierId = paidTier?.id || '';
    const currentTierId = typeof currentTier === 'string' ? currentTier : currentTier?.id || '';

    if (paidTierId.includes('ultra') || currentTierId.includes('ultra')) {
      tier = 'ULTRA';
    } else if (paidTierId.includes('pro') || currentTierId.includes('pro') || paidTierId.includes('standard') || currentTierId.includes('standard')) {
      tier = 'PRO';
    }

    // Determine if this is a personal (consumer / Google One) or enterprise (GCP managed) account
    const isPersonalAccount =
      gcpManaged === false ||
      companionProject === 'aicode-consumers' ||
      !companionProject ||
      !!paidTier ||
      (currentTier && typeof currentTier === 'object' && currentTier.upgradeSubscriptionType === 'GOOGLE_ONE');

    const planName =
      paidTier?.name ||
      (currentTier && typeof currentTier === 'object' ? currentTier.name : null) ||
      (tier === 'ULTRA' ? 'Google AI Ultra' : tier === 'PRO' ? 'Google AI Pro' : 'Free Tier');

    let buckets: BucketInfo[] = [];
    let rawQuotaJson = '';

    // Step 2: Quota extraction
    // Only call enterprise retrieveUserQuota endpoint if this is an enterprise GCP-managed account
    if (!isPersonalAccount && companionProject && companionProject !== 'aicode-consumers') {
      try {
        const quotaRes = await fetch('https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${creds.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            project: companionProject
          })
        });

        if (quotaRes.ok) {
          const quotaData: any = await quotaRes.json();
          rawQuotaJson = JSON.stringify(quotaData);
          const rawBuckets = quotaData.buckets || [];
          buckets = rawBuckets.map((b: any) => {
            const remainingFraction = typeof b.remainingFraction === 'number' ? b.remainingFraction : 1.0;
            return {
              modelId: b.modelId || 'general',
              tokenType: b.tokenType || 'REQUESTS',
              remainingFraction: Math.max(0, Math.min(1, remainingFraction)),
              resetTime: b.resetTime || null,
              usedPercent: Math.round((1 - remainingFraction) * 100)
            };
          });
        } else {
          const errText = await quotaRes.text();
          console.warn(`[GoogleAntigravity] Enterprise quota query returned ${quotaRes.status}:`, errText);
          if (quotaRes.status === 403) {
            throw new Error(`Enterprise license required for GCP project '${companionProject}'. Contact your administrator or ensure Gemini Code Assist is enabled.`);
          }
        }
      } catch (err: any) {
        if (err.message.includes('Enterprise license required')) {
          throw err;
        }
        console.warn('[GoogleAntigravity] Failed to fetch enterprise quota:', err.message);
      }
    }

    // For Personal / Consumer accounts (or fallback if enterprise quota API yields no buckets)
    if (buckets.length === 0) {
      // Check if paidTier has available credits directly in loadCodeAssist
      if (paidTier?.availableCredits && Array.isArray(paidTier.availableCredits) && paidTier.availableCredits.length > 0) {
        buckets = paidTier.availableCredits.map((c: any) => ({
          modelId: c.creditType || 'gemini-pro',
          tokenType: 'CREDITS',
          remainingFraction: typeof c.remainingFraction === 'number' ? c.remainingFraction : 1.0,
          resetTime: c.resetTime || null,
          usedPercent: typeof c.remainingFraction === 'number' ? Math.round((1 - c.remainingFraction) * 100) : 0
        }));
      } else {
        // Next midnight UTC for daily quota resets
        const nextMidnight = new Date();
        nextMidnight.setUTCHours(24, 0, 0, 0);
        const resetTime = nextMidnight.toISOString();

        if (tier === 'ULTRA') {
          buckets = [
            { modelId: 'gemini-ultra', tokenType: 'REQUESTS', remainingFraction: 1.0, resetTime, usedPercent: 0 },
            { modelId: 'gemini-2.5-pro', tokenType: 'REQUESTS', remainingFraction: 1.0, resetTime, usedPercent: 0 },
            { modelId: 'claude-3-5-sonnet', tokenType: 'REQUESTS', remainingFraction: 1.0, resetTime, usedPercent: 0 },
            { modelId: 'daily-requests', tokenType: 'REQUESTS', remainingFraction: 1.0, resetTime, usedPercent: 0 }
          ];
        } else if (tier === 'PRO') {
          buckets = [
            { modelId: 'gemini-2.5-pro', tokenType: 'REQUESTS', remainingFraction: 1.0, resetTime, usedPercent: 0 },
            { modelId: 'gemini-3.8-flash', tokenType: 'REQUESTS', remainingFraction: 1.0, resetTime, usedPercent: 0 },
            { modelId: 'claude-3-5-sonnet', tokenType: 'REQUESTS', remainingFraction: 1.0, resetTime, usedPercent: 0 },
            { modelId: 'daily-requests', tokenType: 'REQUESTS', remainingFraction: 1.0, resetTime, usedPercent: 0 }
          ];
        } else {
          // FREE Tier
          buckets = [
            { modelId: 'gemini-3.5-flash', tokenType: 'REQUESTS', remainingFraction: 1.0, resetTime, usedPercent: 0 },
            { modelId: 'daily-requests', tokenType: 'REQUESTS', remainingFraction: 1.0, resetTime, usedPercent: 0 }
          ];
        }
      }
    }

    if (!rawQuotaJson) {
      rawQuotaJson = JSON.stringify({
        accountType: isPersonalAccount ? 'personal' : 'enterprise',
        tier,
        planName,
        companionProject,
        gcpManaged,
        loadData
      });
    }

    // Persist enriched account details
    creds.tier = tier;
    creds.plan = planName;
    creds.accountType = isPersonalAccount ? 'personal' : 'enterprise';
    creds.gcpManaged = gcpManaged;
    creds.companionProject = companionProject;

    try {
      accountRepo.updateCredentials(account.id, JSON.stringify(creds));
      AccountsStorageService.syncDbToDisk();
    } catch {
      // Non-critical persistence
    }

    return {
      accountId: account.id,
      providerId: this.id,
      tier,
      buckets,
      rawJson: rawQuotaJson
    };
  }
}

