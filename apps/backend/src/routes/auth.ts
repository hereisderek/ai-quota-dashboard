import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { providerRegistry, GoogleAntigravityProvider } from '../providers/index.js';
import { accountRepo, userRepo, sessionRepo } from '../db/index.js';
import { AccountsStorageService } from '../services/accountsStorage.js';
import { quotaScheduler } from '../services/scheduler.js';
import { config } from '../config.js';

// In-memory OAuth state storage for CSRF protection & associating user
const pendingOAuthStates = new Map<string, { createdAt: number; userId?: string }>();

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * Check Setup Status
   */
  fastify.get('/api/auth/setup-status', async () => {
    return {
      setupRequired: userRepo.count() === 0,
      totalUsers: userRepo.count(),
      authMode: config.authMode
    };
  });

  /**
   * Initial Setup / Admin Creation
   */
  fastify.post('/api/auth/setup', async (req, reply) => {
    if (userRepo.count() > 0) {
      return reply.status(400).send({ error: 'Setup already completed' });
    }

    const { username, password, displayName } = req.body as any;
    if (!username || !password) {
      return reply.status(400).send({ error: 'Username and password are required' });
    }

    const admin = userRepo.create({
      username,
      password,
      displayName: displayName || username,
      role: 'admin'
    });

    const token = sessionRepo.create(admin.id);
    reply.header('Set-Cookie', `ai_quota_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}`);

    return {
      success: true,
      token,
      user: {
        id: admin.id,
        username: admin.username,
        displayName: admin.display_name,
        role: admin.role,
        shareEnabled: admin.share_enabled === 1,
        shareSlug: admin.share_slug,
        shareTitle: admin.share_title
      }
    };
  });

  /**
   * User Login
   */
  fastify.post('/api/auth/login', async (req, reply) => {
    const { username, password } = (req.body as any) || {};

    if (!username || !password) {
      return reply.status(400).send({ error: 'Username and password are required' });
    }

    const user = userRepo.getByUsername(username);
    if (!user || !userRepo.verifyPassword(password, user.password_hash)) {
      return reply.status(401).send({ error: 'Invalid username or password' });
    }

    const token = sessionRepo.create(user.id);
    reply.header('Set-Cookie', `ai_quota_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}`);

    return {
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        shareEnabled: user.share_enabled === 1,
        shareSlug: user.share_slug,
        shareTitle: user.share_title
      }
    };
  });

  /**
   * User Registration (by Admin or if 0 users)
   */
  fastify.post('/api/auth/register', async (req, reply) => {
    const isFirstUser = userRepo.count() === 0;
    const currentUser = req.user;

    // Only allow self-registration for the first user or by an admin
    if (!isFirstUser && (!currentUser || currentUser.role !== 'admin')) {
      return reply.status(403).send({ error: 'Only administrators can create new users' });
    }

    const { username, password, displayName, role } = (req.body as any) || {};
    if (!username || !password) {
      return reply.status(400).send({ error: 'Username and password are required' });
    }

    if (userRepo.getByUsername(username)) {
      return reply.status(400).send({ error: 'Username is already taken' });
    }

    const newUser = userRepo.create({
      username,
      password,
      displayName,
      role: isFirstUser ? 'admin' : (role || 'user')
    });

    return {
      success: true,
      user: {
        id: newUser.id,
        username: newUser.username,
        displayName: newUser.display_name,
        role: newUser.role,
        shareSlug: newUser.share_slug
      }
    };
  });

  /**
   * User Logout
   */
  fastify.post('/api/auth/logout', async (req, reply) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.replace(/^Bearer\s+/i, '');
    if (token) {
      sessionRepo.delete(token);
    }
    reply.header('Set-Cookie', 'ai_quota_session=; Path=/; HttpOnly; Max-Age=0');
    return { success: true };
  });

  /**
   * Current User Profile & Share Settings
   */
  fastify.get('/api/auth/me', async (req, reply) => {
    if (!req.user) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const user = userRepo.getById(req.user.id);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        shareEnabled: user.share_enabled === 1,
        shareSlug: user.share_slug,
        shareTitle: user.share_title,
        createdAt: user.created_at
      }
    };
  });

  /**
   * Update Share Settings (Turn ON/OFF, set slug/title)
   */
  fastify.post('/api/auth/share-settings', async (req, reply) => {
    if (!req.user) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const { shareEnabled, shareSlug, shareTitle } = (req.body as any) || {};

    // Validate slug uniqueness if changed
    if (shareSlug) {
      const existing = userRepo.getByShareSlug(shareSlug);
      if (existing && existing.id !== req.user.id) {
        return reply.status(400).send({ error: 'This share URL slug is already taken by another user' });
      }
    }

    userRepo.updateShareSettings(req.user.id, {
      shareEnabled: Boolean(shareEnabled),
      shareSlug,
      shareTitle
    });

    const updated = userRepo.getById(req.user.id)!;
    return {
      success: true,
      shareEnabled: updated.share_enabled === 1,
      shareSlug: updated.share_slug,
      shareTitle: updated.share_title
    };
  });

  /**
   * Start Google OAuth Flow
   */
  fastify.get('/api/auth/google/start', async (req, reply) => {
    const provider = providerRegistry.get('google-antigravity') as GoogleAntigravityProvider;
    if (!provider) {
      return reply.status(500).send({ error: 'Google Antigravity provider not loaded' });
    }

    const state = crypto.randomBytes(16).toString('hex');
    pendingOAuthStates.set(state, {
      createdAt: Date.now(),
      userId: req.user?.id
    });

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
   */
  fastify.get('/api/auth/google/callback', async (req, reply) => {
    const query = req.query as { code?: string; state?: string; error?: string };

    if (query.error) {
      return reply.redirect(`/?auth_error=${encodeURIComponent(query.error)}`);
    }

    if (!query.code || !query.state) {
      return reply.redirect('/?auth_error=missing_code_or_state');
    }

    const stateData = pendingOAuthStates.get(query.state);
    if (!stateData) {
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

      // Associate with initiating user, or primary admin
      const userId = stateData.userId || userRepo.getAll()[0]?.id;

      // Upsert into DB
      accountRepo.upsert({
        id: accountId,
        user_id: userId,
        provider_id: provider.id,
        label,
        email: tokens.email,
        credentials: JSON.stringify(tokens),
        status: 'active'
      });

      // Sync to /data/accounts.json
      AccountsStorageService.syncDbToDisk();

      // Trigger immediate poll
      const acc = accountRepo.getById(accountId);
      if (acc) {
        quotaScheduler.pollAccount(acc).catch(err => {
          console.warn('[OAuth Callback] Initial poll error:', err);
        });
      }

      return reply.redirect(`/?auth_success=1&account=${encodeURIComponent(label)}`);
    } catch (err: any) {
      console.error('[OAuth Callback] Error exchanging Google OAuth code:', err);
      return reply.redirect(`/?auth_error=${encodeURIComponent(err.message || 'token_exchange_failed')}`);
    }
  });
}
