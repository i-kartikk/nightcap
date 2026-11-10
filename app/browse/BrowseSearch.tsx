'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Search, Users } from 'lucide-react';

interface Item { id: string; title: string; channel: string; thumbnail: string }

export function BrowseSearch({ signedIn }: { signedIn: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const initial = params.get('q') ?? '';
  const [q, setQ] = useState(initial);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function run(query: string) {
    if (!query.trim() || !signedIn) return;
    setLoading(true); setError('');
    try {
      const r = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setItems(d.items);
      if (!d.items.length) setError('Nothing embeddable came up. Try different words.');
    } catch (e) { setError((e as Error).message || 'Search failed.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (initial) run(initial); }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="mt-8">
      <form onSubmit={(e) => { e.preventDefault(); router.replace(`/browse?q=${encodeURIComponent(q)}`); run(q); }} className="flex max-w-2xl gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input className="input pl-11" placeholder="Search YouTube" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search YouTube" />
        </div>
        <button className="btn-primary" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}</button>
      </form>
      {!signedIn && <p className="mt-3 text-sm text-white/60"><Link href="/login?next=/browse" className="text-beam hover:underline">Sign in</Link> to search YouTube and start rooms.</p>}
      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it) => {
          const url = `https://www.youtube.com/watch?v=${it.id}`;
          return (
            <div key={it.id} className="card overflow-hidden">
              <img src={it.thumbnail} alt="" loading="lazy" className="aspect-video w-full object-cover" />
              <div className="p-3">
                <p className="line-clamp-2 text-sm font-medium">{it.title}</p>
                <p className="mt-0.5 truncate text-xs text-white/50">{it.channel}</p>
                <Link href={`/rooms/new?v=${encodeURIComponent(url)}&title=${encodeURIComponent(it.title)}`} className="btn-violet mt-3 w-full py-2 text-xs">
                  <Users className="h-3.5 w-3.5" />Watch together
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
