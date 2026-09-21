import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';

export async function authMiddleware(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const path = req.url.split('?')[0];

  // Whitelisted public endpoints
  if (
    path.startsWith('/api/auth/google/callback') ||
    path === '/api/status' ||
    path.startsWith('/assets') ||
    path === '/favicon.ico' ||
    path === '/robots.txt'
  ) {
    return;
  }

  const mode = config.authMode;
  if (mode === 'none') {
    return;
  }

  // 1. IP Whitelist Mode
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
    return;
  }

  // 2. Reverse Proxy Auth Mode
  if (mode === 'reverse_proxy') {
    const proxyUser = req.headers[config.proxyUserHeader];
    if (!proxyUser) {
      reply.status(401).send({
        error: 'Unauthorized',
        message: `Missing reverse proxy authentication header (${config.proxyUserHeader})`
      });
      return;
    }
    return;
  }

  // 3. Token Mode
  if (mode === 'token') {
    const authHeader = req.headers['authorization'];
    const queryToken = (req.query as any)?.token;
    const token = authHeader?.replace(/^Bearer\s+/i, '') || queryToken;

    if (!token || token !== config.authToken) {
      reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or missing access token' });
      return;
    }
    return;
  }

  // 4. Password / Basic Auth Mode
  if (mode === 'password') {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      reply
        .header('WWW-Authenticate', 'Basic realm="AI Quota Dashboard"')
        .status(401)
        .send({ error: 'Unauthorized', message: 'Authentication required' });
      return;
    }

    const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString('utf8');
    const [username, password] = credentials.split(':');

    if (username !== config.authUsername || password !== config.authPassword) {
      reply
        .header('WWW-Authenticate', 'Basic realm="AI Quota Dashboard"')
        .status(401)
        .send({ error: 'Unauthorized', message: 'Invalid credentials' });
      return;
    }
    return;
  }
}
