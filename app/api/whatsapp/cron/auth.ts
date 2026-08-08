import { NextRequest } from 'next/server';

/** Auth compartilhada das rotas de cron: Bearer CRON_SECRET (Vercel Cron) ou ?secret= (disparo manual). */
export function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization');
  if (auth === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get('secret') === secret;
}
