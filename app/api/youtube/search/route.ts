import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

interface YtItem {
  id: { videoId?: string };
  snippet: { title: string; channelTitle: string; thumbnails: { medium?: { url: string }; high?: { url: string } } };
}

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, '\u2019').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 100);
  if (!q) return NextResponse.json({ items: [] });

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to search YouTube' }, { status: 401 });

  const rl = rateLimit(`yt:${user.id}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: `Too many searches. Try again in ${rl.retryAfter}s.` }, { status: 429 });

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return NextResponse.json({ error: 'YouTube search is not configured. Paste a YouTube link instead.' }, { status: 503 });

  const params = new URLSearchParams({
    part: 'snippet', type: 'video', videoEmbeddable: 'true', safeSearch: 'moderate',
    maxResults: '12', q, key,
  });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, { next: { revalidate: 600 } });
  if (!res.ok) return NextResponse.json({ error: 'YouTube search is unavailable right now' }, { status: 502 });
  const data = (await res.json()) as { items: YtItem[] };

  const items = data.items
    .filter((i) => i.id.videoId)
    .map((i) => ({
      id: i.id.videoId!,
      title: decode(i.snippet.title),
      channel: decode(i.snippet.channelTitle),
      thumbnail: i.snippet.thumbnails.high?.url ?? i.snippet.thumbnails.medium?.url ?? '',
    }));
  return NextResponse.json({ items });
}
