import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

interface GiphyItem {
  id: string;
  title: string;
  images: { fixed_height: { url: string; width: string; height: string }; fixed_height_small: { url: string } };
}

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 50);
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

  const rl = rateLimit(`gif:${user.id}`, 40, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'Too many GIF searches' }, { status: 429 });

  const key = process.env.GIPHY_API_KEY;
  if (!key) return NextResponse.json({ error: 'GIFs are not configured on this server' }, { status: 503 });

  const endpoint = q ? 'search' : 'trending';
  const params = new URLSearchParams({ api_key: key, limit: '24', rating: 'pg-13', ...(q ? { q } : {}) });
  const res = await fetch(`https://api.giphy.com/v1/gifs/${endpoint}?${params}`, { next: { revalidate: 300 } });
  if (!res.ok) return NextResponse.json({ error: 'GIF search is unavailable right now' }, { status: 502 });
  const { data } = (await res.json()) as { data: GiphyItem[] };

  return NextResponse.json({
    items: data.map((g) => ({
      id: g.id,
      title: g.title,
      url: g.images.fixed_height.url,
      preview: g.images.fixed_height_small.url,
    })),
  });
}
