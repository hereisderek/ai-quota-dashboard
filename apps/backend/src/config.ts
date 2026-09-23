import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

// Load environment variables from .env file if present
dotenv.config();

export interface AppConfig {
  port: number;
  host: string;
  dataDir: string;
  dbPath: string;
  accountsFilePath: string;
  publicUrl: string;
  authMode: 'none' | 'token' | 'password' | 'ip_whitelist' | 'reverse_proxy';
  authToken?: string;
  authUsername?: string;
  authPassword?: string;
  allowedIps: string[];
  proxyUserHeader: string;
  pollIntervalSeconds: number;
  enableWebSocket: boolean;
  dataRetentionDays: number;
  googleClientId: string;
  googleClientSecret: string;
}

function resolveDataDir(): string {
  // 1. Explicit env variable
  if (process.env.DATA_DIR) {
    return path.resolve(process.env.DATA_DIR);
  }

  // 2. Standard docker container mount point
  if (fs.existsSync('/data')) {
    return '/data';
  }

  // 3. Fallback to ./data in workspace root
  return path.resolve(process.cwd(), 'data');
}

const dataDir = resolveDataDir();

// Ensure data directory exists automatically
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`[Config] Created data directory: ${dataDir}`);
  } catch (err) {
    console.error(`[Config] Failed to create data directory ${dataDir}:`, err);
  }
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3456', 10),
  host: process.env.HOST || '0.0.0.0',
  dataDir,
  dbPath: path.join(dataDir, 'quota.db'),
  accountsFilePath: path.join(dataDir, 'accounts.json'),
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:3456').replace(/\/$/, ''),
  authMode: (process.env.AUTH_MODE as any) || 'none',
  authToken: process.env.AUTH_TOKEN,
  authUsername: process.env.ADMIN_USER || process.env.AUTH_USERNAME || 'admin',
  authPassword: process.env.ADMIN_PASSWORD || process.env.AUTH_PASSWORD,
  allowedIps: (process.env.ALLOWED_IPS || '127.0.0.1,::1')
    .split(',')
    .map(ip => ip.trim())
    .filter(Boolean),
  proxyUserHeader: (process.env.PROXY_USER_HEADER || 'x-forwarded-user').toLowerCase(),
  pollIntervalSeconds: Math.max(30, parseInt(process.env.POLL_INTERVAL_SECONDS || '120', 10)),
  enableWebSocket: process.env.ENABLE_WEBSOCKET !== 'false',
  dataRetentionDays: parseInt(process.env.DATA_RETENTION_DAYS || '30', 10),
  
  // Antigravity desktop OAuth client credentials
  googleClientId: process.env.GOOGLE_CLIENT_ID || '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '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'
};

console.log(`[Config] Initialized with DATA_DIR=${config.dataDir}`);
