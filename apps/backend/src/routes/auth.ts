import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { providerRegistry, GoogleAntigravityProvider } from '../providers/index.js';
import { accountRepo, userRepo, sessionRepo } from '../db/index.js';
import { AccountsStorageService } from '../services/accountsStorage.js';
import { quotaScheduler } from '../services/scheduler.js';
import { config } from '../config.js';
import { parseCookie } from '../middleware/auth.js';

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
   * User Registration (Public self-registration or by Admin)
   */
  fastify.post('/api/auth/register', async (req, reply) => {
    const isFirstUser = userRepo.count() === 0;
    const currentUser = req.user;

    const { username, password, displayName, role } = (req.body as any) || {};
    if (!username || !password) {
      return reply.status(400).send({ error: 'Username and password are required' });
    }

    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 2) {
      return reply.status(400).send({ error: 'Username must be at least 2 characters' });
    }

    if (password.length < 4) {
      return reply.status(400).send({ error: 'Password must be at least 4 characters' });
    }

    if (userRepo.getByUsername(trimmedUsername)) {
      return reply.status(400).send({ error: 'Username is already taken' });
    }

    // Only existing admins can assign admin role; public registration is always standard 'user'
    const assignedRole = isFirstUser ? 'admin' : (currentUser?.role === 'admin' && role ? role : 'user');

    const newUser = userRepo.create({
      username: trimmedUsername,
      password,
      displayName: displayName?.trim() || undefined,
      role: assignedRole
    });

    const token = sessionRepo.create(newUser.id);
    reply.header('Set-Cookie', `ai_quota_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}`);

    return {
      success: true,
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        displayName: newUser.display_name,
        role: newUser.role,
        shareEnabled: newUser.share_enabled === 1,
        shareSlug: newUser.share_slug,
        shareTitle: newUser.share_title
      }
    };
  });

  /**
   * User Logout
   */
  fastify.post('/api/auth/logout', async (req, reply) => {
    const authHeader = req.headers['authorization'];
    const cookieToken = parseCookie(req.headers['cookie'], 'ai_quota_session');
    const token = authHeader?.replace(/^Bearer\s+/i, '') || cookieToken;
    if (token) {
      sessionRepo.delete(token);
    }
    reply.header(
      'Set-Cookie',
      'ai_quota_session=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0'
    );
    return { success: true };
  });

  /**
   * Admin: List All Users
   */
  fastify.get('/api/auth/users', async (req, reply) => {
    if (!req.user || req.user.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Administrator privileges required' });
    }

    const users = userRepo.getAll();
    const usersWithStats = users.map(u => {
      const userAccounts = accountRepo.getAll(u.id);
      return {
        id: u.id,
        username: u.username,
        displayName: u.display_name,
        role: u.role,
        shareEnabled: u.share_enabled === 1,
        shareSlug: u.share_slug,
        shareTitle: u.share_title,
        createdAt: u.created_at,
        accountCount: userAccounts.length
      };
    });

    return { users: usersWithStats };
  });

  /**
   * Admin: Create User
   */
  fastify.post('/api/auth/users', async (req, reply) => {
    if (!req.user || req.user.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Administrator privileges required' });
    }

    const { username, password, displayName, role } = (req.body as any) || {};
    if (!username || !password) {
      return reply.status(400).send({ error: 'Username and password are required' });
    }

    const trimmedUsername = username.trim();
    if (userRepo.getByUsername(trimmedUsername)) {
      return reply.status(400).send({ error: 'Username is already taken' });
    }

    const newUser = userRepo.create({
      username: trimmedUsername,
      password,
      displayName: displayName?.trim() || trimmedUsername,
      role: role === 'admin' ? 'admin' : 'user'
    });

    return {
      success: true,
      user: {
        id: newUser.id,
        username: newUser.username,
        displayName: newUser.display_name,
        role: newUser.role,
        shareSlug: newUser.share_slug,
        createdAt: newUser.created_at,
        accountCount: 0
      }
    };
  });

  /**
   * Admin: Update User (Role, Display Name, Password)
   */
  fastify.put('/api/auth/users/:id', async (req, reply) => {
    if (!req.user || req.user.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Administrator privileges required' });
    }

    const { id } = req.params as { id: string };
    const targetUser = userRepo.getById(id);
    if (!targetUser) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const { role, password, displayName } = (req.body as any) || {};

    // Prevent demoting the sole administrator
    if (req.user.id === id && role && role !== 'admin') {
      const adminCount = userRepo.getAll().filter(u => u.role === 'admin').length;
      if (adminCount <= 1) {
        return reply.status(400).send({ error: 'Cannot demote the sole administrator' });
      }
    }

    if (role && (role === 'admin' || role === 'user')) {
      userRepo.updateRole(id, role);
    }

    if (password && password.length >= 4) {
      userRepo.updatePassword(id, password);
    }

    if (displayName !== undefined) {
      // Update display name via db
      const db = (await import('../db/index.js')).getDb();
      db.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?').run(
        displayName.trim() || targetUser.username,
        new Date().toISOString(),
        id
      );
    }

    const updated = userRepo.getById(id)!;
    return {
      success: true,
      user: {
        id: updated.id,
        username: updated.username,
        displayName: updated.display_name,
        role: updated.role,
        shareSlug: updated.share_slug,
        createdAt: updated.created_at
      }
    };
  });

  /**
   * Admin: Reset User Password (generates a secure random password and returns it)
   */
  fastify.post('/api/auth/users/:id/reset-password', async (req, reply) => {
    if (!req.user || req.user.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Administrator privileges required' });
    }

    const { id } = req.params as { id: string };
    const targetUser = userRepo.getById(id);
    if (!targetUser) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // Generate a secure, readable random password (e.g. 12 chars with upper, lower, numbers)
    const charset = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let tempPassword = '';
    const randomBytes = crypto.randomBytes(12);
    for (let i = 0; i < 12; i++) {
      tempPassword += charset[randomBytes[i] % charset.length];
    }

    // Update password in database and invalidate target user's active sessions
    userRepo.updatePassword(id, tempPassword);

    return {
      success: true,
      message: `Password for '${targetUser.username}' has been reset`,
      username: targetUser.username,
      temporaryPassword: tempPassword
    };
  });

  /**
   * Admin: Delete User
   */
  fastify.delete('/api/auth/users/:id', async (req, reply) => {
    if (!req.user || req.user.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Administrator privileges required' });
    }

    const { id } = req.params as { id: string };

    if (req.user.id === id) {
      return reply.status(400).send({ error: 'Cannot delete your own active administrator account' });
    }

    const targetUser = userRepo.getById(id);
    if (!targetUser) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const deleted = userRepo.delete(id);
    if (!deleted) {
      return reply.status(500).send({ error: 'Failed to delete user' });
    }

    // Sync accounts file to disk since accounts were cascaded
    AccountsStorageService.syncDbToDisk();

    return { success: true, message: `User ${targetUser.username} successfully deleted` };
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
   * Change Own Password (requires current password)
   */
  fastify.post('/api/auth/change-password', async (req, reply) => {
    if (!req.user) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const { currentPassword, newPassword } = (req.body as any) || {};
    if (!currentPassword || !newPassword) {
      return reply.status(400).send({ error: 'Current and new password are required' });
    }

    if (newPassword.length < 4) {
      return reply.status(400).send({ error: 'New password must be at least 4 characters' });
    }

    const user = userRepo.getById(req.user.id);
    if (!user || !userRepo.verifyPassword(currentPassword, user.password_hash)) {
      return reply.status(401).send({ error: 'Current password is incorrect' });
    }

    // Invalidates all existing sessions for this user, including the current one
    userRepo.updatePassword(user.id, newPassword);

    // Issue a fresh session so the user stays logged in
    const token = sessionRepo.create(user.id);
    reply.header('Set-Cookie', `ai_quota_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}`);

    return { success: true, token };
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
