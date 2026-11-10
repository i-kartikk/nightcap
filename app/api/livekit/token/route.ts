import { NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const room = new URL(req.url).searchParams.get('room')?.toUpperCase() ?? '';
  if (!/^[A-Z0-9]{8}$/.test(room)) return NextResponse.json({ error: 'Invalid room' }, { status: 400 });

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

  const rl = rateLimit(`lk:${user.id}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  // Membership check runs under the user's own RLS context.
  const { data: member } = await supabase
    .from('room_members').select('role').eq('room_id', room).eq('user_id', user.id).maybeSingle();
  if (!member) return NextResponse.json({ error: 'Join the room first' }, { status: 403 });

  const { data: profile } = await supabase
    .from('profiles').select('username, display_name, avatar_url').eq('id', user.id).single();

  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!key || !secret || !url) {
    return NextResponse.json({ error: 'Voice and video calls are not configured on this server' }, { status: 503 });
  }

  const at = new AccessToken(key, secret, {
    identity: user.id,
    name: profile?.display_name || profile?.username || 'Guest',
    metadata: JSON.stringify({ avatar_url: profile?.avatar_url ?? null, username: profile?.username }),
    ttl: '4h',
  });
  at.addGrant({
    room: `nightcap-${room}`,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return NextResponse.json({ token: await at.toJwt(), url }, { headers: { 'cache-control': 'no-store' } });
}
