import { AccountRow } from '../db/index.js';

export interface BucketInfo {
  modelId: string;
  tokenType: string; // 'REQUESTS' | 'TOKENS' | 'INPUT_TOKENS' | 'OUTPUT_TOKENS' | 'CREDITS'
  remainingFraction: number; // 0.0 to 1.0 (e.g. 0.85 = 85% remaining)
  resetTime: string | null; // ISO-8601 UTC timestamp
  usedPercent?: number; // Calculated convenience: (1 - remainingFraction) * 100
}

export interface QuotaSnapshot {
  accountId: string;
  providerId: string;
  tier?: string;
  buckets: BucketInfo[];
  rawJson?: string;
}

export interface TokenRefreshResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface IProvider {
  id: string;
  name: string;
  description: string;
  authType: 'oauth' | 'api_key' | 'custom';
  
  // Core quota extraction method
  fetchQuota(account: AccountRow): Promise<QuotaSnapshot>;

  // Optional OAuth helpers
  getOAuthUrl?(redirectUri: string, state: string): string;
  exchangeOAuthCode?(code: string, redirectUri: string): Promise<Record<string, any>>;
  refreshToken?(credentials: Record<string, any>): Promise<TokenRefreshResult>;
}
