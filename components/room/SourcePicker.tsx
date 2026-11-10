'use client';
import { useState } from 'react';
import { Search, Link2, Loader2, Info } from 'lucide-react';
import { Modal } from '../Modal';
import { parseSource } from '@/lib/video';
import type { SourceType } from '@/lib/types';
import { cn } from '@/lib/utils';

interface YtResult { id: string; title: string; channel: string; thumbnail: string }

export function SourcePicker({ open, onClose, onPick }: {
  open: boolean; onClose(): void; onPick(type: SourceType, url: string, title: string | null): void;
}) {
  const [tab, setTab] = useState<'search' | 'link'>('search');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<YtResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  const [title, setTitle] = useState('');

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true); setError('');
    try {
      const r = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setResults(d.items);
      if (!d.items.length) setError('No embeddable videos found. Try other words.');
    } catch (err) { setError((err as Error).message || 'Search failed.'); }
    finally { setLoading(false); }
  }

  function useLink(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseSource(link);
    if ('error' in parsed) { setError(parsed.error); return; }
    let fallback: string;
    try { fallback = new URL(parsed.url).hostname; } catch { fallback = parsed.url; }
    onPick(parsed.type, parsed.url, title.trim() || (parsed.type === 'youtube' ? null : fallback));
    setLink(''); setTitle('');
  }

  const preview = link.trim() ? parseSource(link) : null;

  return (
    <Modal open={open} onClose={onClose} title="Choose what to watch" wide>
      <div className="mb-4 inline-flex rounded-full bg-white/5 p-1">
        {([['search', 'Search YouTube', Search], ['link', 'Paste a link', Link2]] as const).map(([k, label, I]) => (
          <button key={k} onClick={() => { setTab(k); setError(''); }}
            className={cn('flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition', tab === k ? 'bg-white/12 text-white' : 'text-white/60')}>
            <I className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'search' ? (
        <>
          <form onSubmit={search} className="flex gap-2">
            <input className="input" placeholder="Search YouTube videos" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Search YouTube" />
            <button className="btn-violet shrink-0" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}</button>
          </form>
          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((r) => (
              <button key={r.id} onClick={() => onPick('youtube', `https://www.youtube.com/watch?v=${r.id}`, r.title)}
                className="group overflow-hidden rounded-2xl border border-white/10 text-left transition hover:border-beam/60">
                <img src={r.thumbnail} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                <div className="p-2.5">
                  <p className="line-clamp-2 text-sm font-medium group-hover:text-beam">{r.title}</p>
                  <p className="mt-0.5 truncate text-xs text-white/50">{r.channel}</p>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <form onSubmit={useLink} className="space-y-3">
          <input className="input" placeholder="https://…" value={link} onChange={(e) => { setLink(e.target.value); setError(''); }} autoFocus aria-label="Video link" />
          <input className="input" placeholder="Title shown to the room (optional)" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
          {preview && !('error' in preview) && (
            <div className="flex gap-2 rounded-xl bg-white/5 p-3 text-sm text-white/70">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-lilac" />
              <span>
                {preview.type === 'youtube' && 'YouTube video. Play, pause and seeking sync for everyone.'}
                {preview.type === 'html5' && 'Direct video file. Plays in our player with full sync. The file’s server must allow streaming to other sites.'}
                {preview.type === 'hls' && 'HLS stream. Plays with full sync and quality selection when the server allows other sites.'}
                {preview.type === 'netflix' && 'Netflix can’t be embedded or controlled by other websites. Everyone opens it in their own Netflix account, and Nightcap keeps a shared clock and countdown so you press play together.'}
                {preview.type === 'iframe' && 'Website embed. We’ll check whether the site allows embedding. Controls inside embeds can’t be synced, so use the countdown to start together.'}
              </span>
            </div>
          )}
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <button className="btn-primary w-full">Show to the room</button>
          <p className="text-xs text-white/45">Supported: YouTube, MP4, WebM, Ogg, HLS (.m3u8), Netflix (assisted), and sites that allow embedding. Nightcap never bypasses DRM or paywalls.</p>
        </form>
      )}
    </Modal>
  );
}
