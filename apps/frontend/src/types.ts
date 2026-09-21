export interface BucketInfo {
  modelId: string;
  tokenType: string;
  remainingFraction: number; // 0.0 to 1.0
  resetTime: string | null;
  usedPercent: number;
  recordedAt?: string;
}

export interface Account {
  id: string;
  providerId: string;
  label: string;
  email?: string;
  status: 'active' | 'rate_limited' | 'error' | 'disabled';
  lastError?: string;
  lastPolledAt?: string;
  credentials: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  buckets: BucketInfo[];
  tier?: string;
  accountType?: string;
  plan?: string;
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
  providers: ProviderMeta[];
}
