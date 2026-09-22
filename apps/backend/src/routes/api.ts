import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { accountRepo, snapshotRepo, settingsRepo, userRepo } from '../db/index.js';
import { providerRegistry } from '../providers/index.js';
import { AccountsStorageService } from '../services/accountsStorage.js';
import { quotaScheduler } from '../services/scheduler.js';
import { wsHub } from '../services/websocket.js';
import { config } from '../config.js';

export async function apiRoutes(fastify: FastifyInstance): Promise<void> {
  // Public Read-Only Share Endpoint
  fastify.get('/api/share/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const user = userRepo.getByShareSlug(slug);

    if (!user || user.share_enabled !== 1) {
      return reply.status(404).send({
        error: 'Share page not found or private',
        message: 'This quota share page is either disabled or does not exist.'
      });
    }

    const accounts = accountRepo.getAll(user.id);
    const sanitizedAccounts = accounts.map(acc => {
      const latestBuckets = snapshotRepo.getLatestForAccount(acc.id);

      // Extract plan/tier safely
      let tier = 'STANDARD';
      try {
        const creds = JSON.parse(acc.credentials);
        if (creds.tier) tier = creds.tier;
        if (creds.plan) tier = creds.plan;
        if ((!creds.tier || creds.tier === 'STANDARD') && acc.provider_id === 'anthropic') {
          tier = 'Claude Team';
        }
      } catch {}

      // Mask any email address in the label to prevent public PII exposure
      const sanitizedLabel = acc.label.replace(
        /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
        (_, user, domain) => `${user.slice(0, 2)}***@${domain}`
      );

      return {
        id: acc.id,
        label: sanitizedLabel,
        providerId: acc.provider_id,
        tier,
        status: acc.status,
        lastPolledAt: acc.last_polled_at,
        buckets: latestBuckets.map(b => ({
          modelId: b.model_id,
          tokenType: b.token_type,
          remainingFraction: b.remaining_fraction,
          remainingAmount: b.remaining_amount,
          limitAmount: b.limit_amount,
          resetTime: b.reset_time,
          usedPercent: Math.round((1 - b.remaining_fraction) * 100)
        }))
      };
    });

    return {
      title: user.share_title || `${user.display_name || user.username}'s AI Quota`,
      user: {
        displayName: user.display_name || user.username
      },
      accounts: sanitizedAccounts,
      generatedAt: new Date().toISOString()
    };
  });

  // System Status
  fastify.get('/api/status', async (req) => {
    const userId = req.user?.id;
    const totalAccounts = userId ? accountRepo.getAll(userId).length : 0;
    return {
      status: 'ok',
      version: '1.1.0',
      uptimeSeconds: Math.round(process.uptime()),
      dataDir: config.dataDir,
      authMode: config.authMode,
      totalAccounts,
      activeClients: wsHub.getClientCount(),
      currentUser: req.user ? {
        id: req.user.id,
        username: req.user.username,
        displayName: req.user.display_name,
        role: req.user.role,
        shareEnabled: req.user.share_enabled === 1,
        shareSlug: req.user.share_slug
      } : null,
      providers: providerRegistry.getMetadataList()
    };
  });

  // Providers Metadata
  fastify.get('/api/providers', async () => {
    return {
      providers: providerRegistry.getMetadataList()
    };
  });

  // Accounts with latest Quota Buckets (scoped to authenticated user)
  fastify.get('/api/accounts', async (req, reply) => {
    const userId = req.user?.id;
    const accounts = userId ? accountRepo.getAll(userId) : accountRepo.getAll();

    const result = accounts.map(acc => {
      const latestBuckets = snapshotRepo.getLatestForAccount(acc.id);
      let creds: any = {};
      try {
        creds = JSON.parse(acc.credentials);
      } catch {}

      const sanitizedCreds: Record<string, any> = {};
      if (creds.email) sanitizedCreds.email = creds.email;
      if (creds.org) sanitizedCreds.org = creds.org;
      if (creds.enterprise) sanitizedCreds.enterprise = creds.enterprise;
      if (creds.url) sanitizedCreds.url = creds.url;
      if (creds.tier) sanitizedCreds.tier = creds.tier;
      if (creds.plan) sanitizedCreds.plan = creds.plan;
      if (creds.apiKey) sanitizedCreds.apiKey = creds.apiKey.substring(0, 7) + '...' + creds.apiKey.slice(-4);
      if (creds.token) sanitizedCreds.token = creds.token.substring(0, 6) + '...' + creds.token.slice(-4);
      if (creds.expiresAt) sanitizedCreds.expiresAt = creds.expiresAt;

        // Extract and scrub latest rawResponse
        let rawResponse: any = null;
        for (const b of latestBuckets) {
          if (b.raw_json) {
            try {
              rawResponse = JSON.parse(b.raw_json);
              const scrub = (obj: any): any => {
                if (!obj || typeof obj !== 'object') return obj;
                if (Array.isArray(obj)) return obj.map(scrub);
                const clean: Record<string, any> = {};
                for (const [k, v] of Object.entries(obj)) {
                  if (/token|secret|password|key/i.test(k) && typeof v === 'string') {
                    clean[k] = v.length > 10 ? `${v.slice(0, 4)}...${v.slice(-4)}` : '******';
                  } else {
                    clean[k] = scrub(v);
                  }
                }
                return clean;
              };
              rawResponse = scrub(rawResponse);
              break;
            } catch {
              rawResponse = b.raw_json;
              break;
            }
          }
        }

        return {
          id: acc.id,
          userId: acc.user_id,
          providerId: acc.provider_id,
          label: acc.label,
          email: acc.email,
          status: acc.status,
          lastError: acc.last_error,
          lastPolledAt: acc.last_polled_at,
          tier: creds.tier || (rawResponse?.source === 'claude_subscription' || acc.provider_id === 'anthropic' ? 'Claude Team' : 'STANDARD'),
          plan: creds.plan,
          credentials: sanitizedCreds,
          rawResponse,
          createdAt: acc.created_at,
          updatedAt: acc.updated_at,
          buckets: latestBuckets.map(b => ({
            modelId: b.model_id,
            tokenType: b.token_type,
            remainingFraction: b.remaining_fraction,
            remainingAmount: b.remaining_amount,
            limitAmount: b.limit_amount,
            resetTime: b.reset_time,
            usedPercent: Math.round((1 - b.remaining_fraction) * 100),
            recordedAt: b.recorded_at
          }))
        };
      });

    return { accounts: result };
  });

  // Add Account (scoped to authenticated user)
  fastify.post('/api/accounts', async (req, reply) => {
    const userId = req.user?.id;
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
      user_id: userId || null,
      provider_id: body.providerId,
      label: body.label,
      email: body.email || null,
      credentials: JSON.stringify(body.credentials),
      status: 'active'
    });

    AccountsStorageService.syncDbToDisk();

    const acc = accountRepo.getById(accountId);
    if (acc) {
      quotaScheduler.pollAccount(acc).catch(err => {
        console.warn('[Add Account] Initial poll failure:', err);
      });
    }

    return { success: true, accountId };
  });

  // Update Account (scoped)
  fastify.put('/api/accounts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = req.user?.id;
    const body = req.body as {
      label?: string;
      email?: string;
      credentials?: Record<string, any>;
      status?: 'active' | 'disabled';
    };

    const existing = accountRepo.getById(id, userId);
    if (!existing) {
      return reply.status(404).send({ error: 'Account not found' });
    }

    const updatedCreds = body.credentials
      ? JSON.stringify({ ...JSON.parse(existing.credentials), ...body.credentials })
      : existing.credentials;

    accountRepo.upsert({
      id,
      user_id: existing.user_id,
      provider_id: existing.provider_id,
      label: body.label || existing.label,
      email: body.email ?? existing.email,
      credentials: updatedCreds,
      status: body.status || existing.status
    });

    AccountsStorageService.syncDbToDisk();
    return { success: true };
  });

  // Delete Account (scoped)
  fastify.delete('/api/accounts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = req.user?.id;

    const deleted = accountRepo.delete(id, userId);
    if (!deleted) {
      return reply.status(404).send({ error: 'Account not found' });
    }

    AccountsStorageService.syncDbToDisk();
    wsHub.broadcast('ACCOUNT_DELETED', { accountId: id });
    return { success: true };
  });

  // Force Refresh Single Account (scoped)
  fastify.post('/api/accounts/:id/refresh', async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = req.user?.id;
    const existing = accountRepo.getById(id, userId);
    if (!existing) {
      return reply.status(404).send({ error: 'Account not found' });
    }

    const snapshot = await quotaScheduler.pollAccount(existing);
    return { success: true, snapshot };
  });

  // Force Refresh All Accounts (for current user)
  fastify.post('/api/accounts/refresh-all', async (req) => {
    const userId = req.user?.id;
    const accounts = userId ? accountRepo.getAll(userId) : accountRepo.getAll();
    for (const acc of accounts) {
      quotaScheduler.pollAccount(acc).catch(() => {});
    }
    return { success: true, message: 'Refresh cycle triggered' };
  });

  // Historical Data for Charts (scoped)
  fastify.get('/api/accounts/:id/history', async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = req.user?.id;
    const existing = accountRepo.getById(id, userId);
    if (!existing) {
      return reply.status(404).send({ error: 'Account not found' });
    }

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

  fastify.post('/api/settings', async (req, reply) => {
    // Only admins can change system-wide settings
    if (req.user && req.user.role !== 'admin') {
      return reply.status(403).send({ error: 'Only administrators can modify system settings' });
    }

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
