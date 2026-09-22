import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { sessionRepo, userRepo, UserRow } from '../db/index.js';

// Extend FastifyRequest interface with user property
declare module 'fastify' {
  interface FastifyRequest {
    user?: UserRow | null;
  }
}

export function parseCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function authMiddleware(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const path = req.url.split('?')[0];

  // 1. Try to extract session token from header, cookie, or query
  const authHeader = req.headers['authorization'];
  const cookieToken = parseCookie(req.headers['cookie'], 'ai_quota_session');
  const queryToken = (req.query as any)?.token;
  const token = authHeader?.replace(/^Bearer\s+/i, '') || cookieToken || queryToken;

  if (token) {
    const user = sessionRepo.getUserByToken(token);
    if (user) {
      req.user = user;
    }
  }

  // 2. Frontend web UI & static assets (always accessible)
  if (!path.startsWith('/api') && path !== '/ws') {
    return;
  }

  // 3. Whitelisted public API endpoints (always accessible)
  if (
    path.startsWith('/api/auth/google/callback') ||
    path.startsWith('/api/auth/google/start') ||
    path === '/api/auth/login' ||
    path === '/api/auth/logout' ||
    path === '/api/auth/register' ||
    path === '/api/auth/setup-status' ||
    path === '/api/auth/setup' ||
    path.startsWith('/api/share/') ||
    path === '/api/status' ||
    path === '/api/providers'
  ) {
    return;
  }

  // If user is authenticated via session, allow request
  if (req.user) {
    return;
  }

  const mode = config.authMode;

  // 3. IP Whitelist Mode
  if (mode === 'ip_whitelist') {
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    const isAllowed = config.allowedIps.some(allowed => {
      if (allowed === clientIp) return true;
      if (allowed === '127.0.0.1' && (clientIp === '::1' || clientIp === '::ffff:127.0.0.1')) return true;
      return false;
    });

    if (!isAllowed) {
      reply.status(403).send({ error: 'Forbidden', message: `IP ${clientIp} is not authorized` });
      return;
    }
    const allUsers = userRepo.getAll();
    if (allUsers.length > 0) req.user = allUsers[0];
    return;
  }

  // 4. Reverse Proxy Auth Mode
  if (mode === 'reverse_proxy') {
    const proxyUserHeaderVal = req.headers[config.proxyUserHeader] as string | undefined;
    if (!proxyUserHeaderVal) {
      reply.status(401).send({
        error: 'Unauthorized',
        message: `Missing reverse proxy authentication header (${config.proxyUserHeader})`
      });
      return;
    }

    // Auto-link or auto-create user for the reverse proxy username
    let user = userRepo.getByUsername(proxyUserHeaderVal);
    if (!user) {
      user = userRepo.create({
        username: proxyUserHeaderVal,
        password: config.authToken || 'proxy_auth_managed',
        displayName: proxyUserHeaderVal,
        role: 'user'
      });
    }
    req.user = user;
    return;
  }

  // 5. Token Mode
  if (mode === 'token') {
    if (token && token === config.authToken) {
      const allUsers = userRepo.getAll();
      if (allUsers.length > 0) req.user = allUsers[0];
      return;
    }
    reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or missing access token' });
    return;
  }

  // 6. Default (None / Password):
  // When users exist in the system, protected endpoints require authentication.
  if (userRepo.count() > 0) {
    reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required. Please log in.' });
    return;
  }
}

