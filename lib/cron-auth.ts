import { timingSafeEqual } from 'node:crypto';

export function isAuthorizedCronRequest(request: Request, secret = process.env.CRON_SECRET) {
  if (!secret || secret.length < 32) return false;

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return false;

  const provided = Buffer.from(authorization.slice('Bearer '.length));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
