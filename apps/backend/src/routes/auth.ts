import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { providerRegistry, GoogleAntigravityProvider } from '../providers/index.js';
import { accountRepo } from '../db/index.js';
import { AccountsStorageService } from '../services/accountsStorage.js';
import { quotaScheduler } from '../services/scheduler.js';
import { config } from '../config.js';

// In-memory OAuth state storage for CSRF protection
const pendingOAuthStates = new Map<string, { createdAt: number; redirectUrl?: string }>();

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * Start Google OAuth Flow
   * Redirects user browser directly to Google consent screen
   */
  fastify.get('/api/auth/google/start', async (req, reply) => {
    const provider = providerRegistry.get('google-antigravity') as GoogleAntigravityProvider;
    if (!provider) {
      return reply.status(500).send({ error: 'Google Antigravity provider not loaded' });
    }

    const state = crypto.randomBytes(16).toString('hex');
    pendingOAuthStates.set(state, { createdAt: Date.now() });

    // Clean up stale states (> 10 minutes)
    for (const [s, data] of pendingOAuthStates.entries()) {
      if (Date.now() - data.createdAt > 10 * 60 * 1000) {
        pendingOAuthStates.delete(s);
      }
    }

    const redirectUri = `${config.publicUrl}/api/auth/google/callback`;
    const authUrl = provider.getOAuthUrl(redirectUri, state);

    return reply.redirect(authUrl);
  });

  /**
   * Google OAuth Callback
   * Google redirects back here with code and state
   */
  fastify.get('/api/auth/google/callback', async (req, reply) => {
    const query = req.query as { code?: string; state?: string; error?: string };

    if (query.error) {
      return reply.redirect(`/?auth_error=${encodeURIComponent(query.error)}`);
    }

    if (!query.code || !query.state) {
      return reply.redirect('/?auth_error=missing_code_or_state');
    }

    // Verify state
    if (!pendingOAuthStates.has(query.state)) {
      return reply.redirect('/?auth_error=invalid_or_expired_state');
    }
    pendingOAuthStates.delete(query.state);

    const provider = providerRegistry.get('google-antigravity') as GoogleAntigravityProvider;
    if (!provider) {
      return reply.redirect('/?auth_error=provider_unavailable');
    }

    try {
      const redirectUri = `${config.publicUrl}/api/auth/google/callback`;
      const tokens = await provider.exchangeOAuthCode(query.code, redirectUri);

      const accountId = `google_${crypto.createHash('md5').update(tokens.email || Date.now().toString()).digest('hex').substring(0, 8)}`;
      const label = tokens.email ? `Google (${tokens.email})` : 'Google Antigravity Account';

      // Upsert into DB
      accountRepo.upsert({
        id: accountId,
        provider_id: provider.id,
        label,
        email: tokens.email,
        credentials: JSON.stringify(tokens),
        status: 'active'
      });

      // Sync to /data/accounts.json
      AccountsStorageService.syncDbToDisk();

      // Trigger immediate poll in background
      const acc = accountRepo.getById(accountId);
      if (acc) {
        quotaScheduler.pollAccount(acc).catch(err => {
          console.warn('[OAuth Callback] Background initial poll error:', err);
        });
      }

      return reply.redirect(`/?auth_success=1&account=${encodeURIComponent(label)}`);
    } catch (err: any) {
      console.error('[OAuth Callback] Error exchanging Google OAuth code:', err);
      return reply.redirect(`/?auth_error=${encodeURIComponent(err.message || 'token_exchange_failed')}`);
    }
  });
}
