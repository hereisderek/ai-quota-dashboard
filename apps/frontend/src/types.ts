export interface BucketInfo {
  modelId: string;
  tokenType: string;
  remainingFraction: number; // 0.0 to 1.0
  remainingAmount?: number | null; // Raw remaining tokens/requests count
  limitAmount?: number | null; // Raw total capacity/limit
  resetTime: string | null;
  usedPercent: number;
  recordedAt?: string;
}

export interface Account {
  id: string;
  userId?: string;
  providerId: string;
  label: string;
  email?: string;
  status: 'active' | 'rate_limited' | 'error' | 'disabled';
  lastError?: string;
  lastPolledAt?: string;
  tier?: string;
  plan?: string;
  credentials: Record<string, any>;
  rawResponse?: any;
  createdAt: string;
  updatedAt: string;
  buckets: BucketInfo[];
}

export interface User {
  id: string;
  username: string;
  displayName?: string;
  role: 'admin' | 'user';
  shareEnabled: boolean;
  shareSlug?: string;
  shareTitle?: string;
}

export interface ProviderMeta {
  id: string;
  name: string;
  description: string;
  authType: 'oauth' | 'api_key' | 'custom';
}

export interface AppSettings {
  pollIntervalSeconds: number;
  enableWebSocket: boolean;
  dataRetentionDays: number;
  authMode: string;
}

export interface SystemStatus {
  status: string;
  version: string;
  uptimeSeconds: number;
  dataDir: string;
  authMode: string;
  totalAccounts: number;
  activeClients: number;
  currentUser?: User | null;
  providers: ProviderMeta[];
}

export interface ShareData {
  title: string;
  user: {
    displayName: string;
  };
  accounts: Array<{
    id: string;
    label: string;
    providerId: string;
    tier?: string;
    status: string;
    lastPolledAt?: string;
    buckets: BucketInfo[];
  }>;
  generatedAt: string;
}
