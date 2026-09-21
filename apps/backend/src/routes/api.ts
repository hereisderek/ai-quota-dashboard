import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { accountRepo, snapshotRepo, settingsRepo } from '../db/index.js';
import { providerRegistry } from '../providers/index.js';
import { AccountsStorageService } from '../services/accountsStorage.js';
import { quotaScheduler } from '../services/scheduler.js';
import { wsHub } from '../services/websocket.js';
import { config } from '../config.js';

export async function apiRoutes(fastify: FastifyInstance): Promise<void> {
  // System Status
  fastify.get('/api/status', async () => {
    const accounts = accountRepo.getAll();
    return {
      status: 'ok',
      version: '1.0.0',
      uptimeSeconds: Math.round(process.uptime()),
      dataDir: config.dataDir,
      authMode: config.authMode,
      totalAccounts: accounts.length,
      activeClients: wsHub.getClientCount(),
      providers: providerRegistry.getMetadataList()
    };
  });

  // Providers Metadata
  fastify.get('/api/providers', async () => {
    return {
      providers: providerRegistry.getMetadataList()
    };
  });

  // Accounts with latest Quota Buckets
  fastify.get('/api/accounts', async () => {
    const accounts = accountRepo.getAll();
    const result = accounts.map(acc => {
      const latestBuckets = snapshotRepo.getLatestForAccount(acc.id);
      let creds: any = {};
      try {
        creds = JSON.parse(acc.credentials);
      } catch {}

      // Sanitize credentials so secret keys aren't exposed in full
      const sanitizedCreds: Record<string, any> = {};
      if (creds.email) sanitizedCreds.email = creds.email;
      if (creds.org) sanitizedCreds.org = creds.org;
      if (creds.enterprise) sanitizedCreds.enterprise = creds.enterprise;
      if (creds.url) sanitizedCreds.url = creds.url;
      if (creds.accountType) sanitizedCreds.accountType = creds.accountType;
      if (creds.tier) sanitizedCreds.tier = creds.tier;
      if (creds.plan) sanitizedCreds.plan = creds.plan;
      if (creds.apiKey) sanitizedCreds.apiKey = creds.apiKey.substring(0, 7) + '...' + creds.apiKey.slice(-4);
      if (creds.token) sanitizedCreds.token = creds.token.substring(0, 6) + '...' + creds.token.slice(-4);
      if (creds.expiresAt) sanitizedCreds.expiresAt = creds.expiresAt;

      return {
        id: acc.id,
        providerId: acc.provider_id,
        label: acc.label,
        email: acc.email,
        status: acc.status,
        lastError: acc.last_error,
        lastPolledAt: acc.last_polled_at,
        tier: creds.tier,
        accountType: creds.accountType,
        plan: creds.plan,
        credentials: sanitizedCreds,
        createdAt: acc.created_at,
        updatedAt: acc.updated_at,
        buckets: latestBuckets.map(b => ({
          modelId: b.model_id,
          tokenType: b.token_type,
          remainingFraction: b.remaining_fraction,
          resetTime: b.reset_time,
          usedPercent: Math.round((1 - b.remaining_fraction) * 100),
          recordedAt: b.recorded_at
        }))
      };
    });

    return { accounts: result };
  });

  // Add Account (API Key / Token / Custom)
  fastify.post('/api/accounts', async (req, reply) => {
    const body = req.body as {
      providerId: string;
      label: string;
      email?: string;
      credentials: Record<string, any>;
    };

    if (!body.providerId || !body.label || !body.credentials) {
      return reply.status(400).send({ error: 'Missing required fields (providerId, label, credentials)' });
    }

    const provider = providerRegistry.get(body.providerId);
    if (!provider) {
      return reply.status(400).send({ error: `Provider '${body.providerId}' is not registered` });
    }

    const accountId = `${body.providerId}_${crypto.randomBytes(6).toString('hex')}`;

    accountRepo.upsert({
      id: accountId,
      provider_id: body.providerId,
      label: body.label,
      email: body.email || null,
      credentials: JSON.stringify(body.credentials),
      status: 'active'
    });

    AccountsStorageService.syncDbToDisk();

    // Trigger initial poll
    const acc = accountRepo.getById(accountId);
    if (acc) {
      quotaScheduler.pollAccount(acc).catch(err => {
        console.warn('[Add Account] Initial poll failure:', err);
      });
    }

    return { success: true, accountId };
  });

  // Update Account
  fastify.put('/api/accounts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      label?: string;
      email?: string;
      credentials?: Record<string, any>;
      status?: 'active' | 'disabled';
    };

    const existing = accountRepo.getById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'Account not found' });
    }

    const updatedCreds = body.credentials
      ? JSON.stringify({ ...JSON.parse(existing.credentials), ...body.credentials })
      : existing.credentials;

    accountRepo.upsert({
      id,
      provider_id: existing.provider_id,
      label: body.label || existing.label,
      email: body.email ?? existing.email,
      credentials: updatedCreds,
      status: body.status || existing.status
    });

    AccountsStorageService.syncDbToDisk();
    return { success: true };
  });

  // Delete Account
  fastify.delete('/api/accounts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = accountRepo.getById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'Account not found' });
    }

    accountRepo.delete(id);
    AccountsStorageService.syncDbToDisk();

    wsHub.broadcast('ACCOUNT_DELETED', { accountId: id });
    return { success: true };
  });

  // Force Refresh Single Account
  fastify.post('/api/accounts/:id/refresh', async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = accountRepo.getById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'Account not found' });
    }

    const snapshot = await quotaScheduler.pollAccount(existing);
    return { success: true, snapshot };
  });

  // Force Refresh All Accounts
  fastify.post('/api/accounts/refresh-all', async () => {
    quotaScheduler.pollAll().catch(err => {
      console.warn('[Refresh All] Polling error:', err);
    });
    return { success: true, message: 'Refresh cycle triggered' };
  });

  // Historical Data for Charts
  fastify.get('/api/accounts/:id/history', async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { hours?: string };
    const hours = Math.min(720, Math.max(1, parseInt(query.hours || '24', 10)));

    const snapshots = snapshotRepo.getHistory(id, hours);
    return { history: snapshots };
  });

  // Application Settings
  fastify.get('/api/settings', async () => {
    return {
      pollIntervalSeconds: parseInt(settingsRepo.get('pollIntervalSeconds', String(config.pollIntervalSeconds)), 10),
      enableWebSocket: settingsRepo.get('enableWebSocket', String(config.enableWebSocket)) === 'true',
      dataRetentionDays: parseInt(settingsRepo.get('dataRetentionDays', String(config.dataRetentionDays)), 10),
      authMode: config.authMode
    };
  });

  fastify.post('/api/settings', async (req) => {
    const body = req.body as Record<string, any>;
    if (body.pollIntervalSeconds) {
      const interval = Math.max(30, parseInt(body.pollIntervalSeconds, 10));
      settingsRepo.set('pollIntervalSeconds', String(interval));
      quotaScheduler.start(interval);
    }
    if (body.enableWebSocket !== undefined) {
      settingsRepo.set('enableWebSocket', String(body.enableWebSocket));
    }
    if (body.dataRetentionDays) {
      settingsRepo.set('dataRetentionDays', String(body.dataRetentionDays));
    }
    return { success: true };
  });
}
