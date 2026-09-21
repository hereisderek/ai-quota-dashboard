import { AccountRow } from '../db/index.js';

export interface BucketInfo {
  modelId: string;
  tokenType: string; // 'REQUESTS' | 'TOKENS' | 'INPUT_TOKENS' | 'OUTPUT_TOKENS' | 'CREDITS' | 'SEATS'
  remainingFraction: number; // 0.0 to 1.0 (e.g. 0.85 = 85% remaining)
  remainingAmount?: number | null; // Raw remaining tokens / requests count if supported
  limitAmount?: number | null; // Raw total limit if supported
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

export interface FormFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'password' | 'select' | 'number' | 'textarea' | 'checkbox';
  placeholder?: string;
  required?: boolean;
  defaultValue?: any;
  description?: string;
  options?: Array<{ label: string; value: string }>;
}

export interface ProviderAuthDoc {
  title: string;
  description: string;
  linkText?: string;
  linkUrl?: string;
  steps?: string[];
}

export interface ProviderBrand {
  name: string;
  icon: string; // Icon identifier (e.g. 'Sparkles', 'Bot', 'Github', 'Layers', 'Cpu', 'Zap', 'Globe', 'CircleDot')
  color: string; // Accent color name (e.g. 'sky', 'amber', 'purple', 'emerald', 'violet', 'cyan', 'rose')
  badgeClass?: string;
}

export interface IProvider {
  id: string;
  name: string;
  description: string;
  brand: ProviderBrand;
  authType: 'oauth' | 'api_key' | 'credentials' | 'custom';
  authDoc?: ProviderAuthDoc;
  fields: FormFieldDefinition[];
  
  // Core quota extraction method
  fetchQuota(account: AccountRow): Promise<QuotaSnapshot>;

  // Optional OAuth helpers
  getOAuthUrl?(redirectUri: string, state: string): string;
  exchangeOAuthCode?(code: string, redirectUri: string): Promise<Record<string, any>>;
  refreshToken?(credentials: Record<string, any>): Promise<TokenRefreshResult>;
}
