import { NextResponse } from 'next/server';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isPrivateIp(ip: string) {
  if (isIP(ip) === 6) {
    const l = ip.toLowerCase();
    return l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l === '::' || l.startsWith('::ffff:127.') || l.startsWith('::ffff:10.') || l.startsWith('::ffff:192.168.');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/**
 * Checks whether a third-party page allows being framed, by reading its
 * X-Frame-Options and CSP frame-ancestors headers. Never bypasses them.
 */
export async function GET(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const rl = rateLimit(`embed:${user.id}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'Too many checks' }, { status: 429 });

  let target: URL;
  try { target = new URL(new URL(req.url).searchParams.get('url') ?? ''); }
  catch { return NextResponse.json({ error: 'Invalid link' }, { status: 400 }); }
  if (target.protocol !== 'https:') return NextResponse.json({ error: 'Only https links are supported' }, { status: 400 });

  try {
    const host = target.hostname;
    const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    if (addrs.some((a) => isPrivateIp(a.address))) {
      return NextResponse.json({ error: 'That address is not allowed' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ embeddable: false, reason: 'We couldn’t reach that website.' });
  }

  try {
    const res = await fetch(target, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(6000),
      headers: { 'user-agent': 'NightcapEmbedCheck/1.0', accept: 'text/html,video/*;q=0.9,*/*;q=0.5' },
    });
    const type = res.headers.get('content-type') ?? '';
    res.body?.cancel().catch(() => {});
    if (type.startsWith('video/')) return NextResponse.json({ embeddable: true, kind: 'html5' });
    if (type.includes('mpegurl')) return NextResponse.json({ embeddable: true, kind: 'hls' });

    const xfo = (res.headers.get('x-frame-options') ?? '').toLowerCase();
    const csp = (res.headers.get('content-security-policy') ?? '').toLowerCase();
    const fa = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('frame-ancestors'));
    const blockedByXfo = xfo.includes('deny') || xfo.includes('sameorigin');
    const blockedByCsp = !!fa && !fa.includes('*') && !fa.includes('https:');
    if (blockedByXfo || blockedByCsp) {
      return NextResponse.json({ embeddable: false, reason: 'This website doesn’t allow other sites to show it in a frame.' });
    }
    return NextResponse.json({ embeddable: true, kind: 'iframe' });
  } catch {
    return NextResponse.json({ embeddable: false, reason: 'The website took too long to respond.' });
  }
}
