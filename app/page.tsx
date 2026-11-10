import Link from 'next/link';
import { RefreshCw, MessageSquareText, Video, ShieldCheck, Link2, Film } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Hero } from '@/components/home/Hero';
import { createClient } from '@/lib/supabase/server';
import { sourceLabel } from '@/lib/video';
import { timeAgo } from '@/lib/utils';
import type { Room } from '@/lib/types';

const FEATURES = [
  { icon: RefreshCw, title: 'Synced to the second', text: 'Play, pause, seek and video changes reach every viewer instantly. Players that drift get nudged back without a jarring jump.' },
  { icon: MessageSquareText, title: 'Chat beside the screen', text: 'Replies, emoji reactions, GIFs and typing indicators, with moderators who can tidy things up.' },
  { icon: Video, title: 'Talk face to face', text: 'Group voice and video calls in a floating window you can shrink while the movie keeps playing.' },
  { icon: ShieldCheck, title: 'Hosts stay in control', text: 'Passwords, private rooms, co-hosts and moderators, plus kick, ban, block and report.' },
];

const CATEGORIES = [
  { label: 'Movie night', q: 'full movie free' },
  { label: 'Music videos', q: 'official music video' },
  { label: 'Anime', q: 'anime episode official' },
  { label: 'Documentaries', q: 'full documentary' },
  { label: 'Comedy', q: 'stand up comedy special' },
  { label: 'Trailers', q: 'official trailer 2026' },
  { label: 'Live streams', q: 'live now' },
  { label: 'Sports highlights', q: 'extended highlights' },
];

const STEPS = [
  { icon: Film, title: 'Create a room', text: 'Name it, make it private or public, and add a password if you like.' },
  { icon: Link2, title: 'Share the invite', text: 'Send the link on WhatsApp or anywhere. Friends join with one tap.' },
  { icon: RefreshCw, title: 'Pick something to watch', text: 'Search YouTube or paste a video link. Everyone gets it at once.' },
  { icon: Video, title: 'Press play together', text: 'Start a countdown, hop on a call, and react as it happens.' },
];

export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let recent: (Room & { last_active?: string })[] = [];
  if (user) {
    const { data } = await supabase
      .from('room_members')
      .select('last_active, rooms(*)')
      .eq('user_id', user.id)
      .order('last_active', { ascending: false })
      .limit(6);
    recent = ((data ?? []) as unknown as { last_active: string; rooms: Room | null }[])
      .filter((r) => r.rooms)
      .map((r) => ({ ...(r.rooms as Room), last_active: r.last_active }));
  }
  const { data: live } = await supabase
    .from('rooms').select('*').eq('is_public', true).order('last_activity', { ascending: false }).limit(6);

  const showcase = recent.length ? recent : ((live ?? []) as Room[]);

  return (
    <>
      <Navbar />
      <main>
        <Hero />

        <section className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="card p-6">
                <f.icon className="h-6 w-6 text-beam" />
                <h3 className="mt-4 font-display text-lg font-bold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-7xl px-4 sm:px-6">
          <h2 className="font-display text-3xl font-bold tracking-tight">What people are watching</h2>
          <div className="mt-6 flex flex-wrap gap-2.5">
            {CATEGORIES.map((c) => (
              <Link key={c.label} href={`/browse?q=${encodeURIComponent(c.q)}`}
                className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-medium transition hover:border-beam/60 hover:text-beam">
                {c.label}
              </Link>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-7xl px-4 sm:px-6">
          <div className="flex items-end justify-between gap-4">
            <h2 className="font-display text-3xl font-bold tracking-tight">{recent.length ? 'Your recent rooms' : 'Live public rooms'}</h2>
            <Link href="/browse" className="text-sm text-lilac hover:underline">See all</Link>
          </div>
          {showcase.length === 0 ? (
            <div className="card mt-6 flex flex-col items-center gap-3 p-10 text-center">
              <p className="text-white/65">No rooms yet. Start the first one and invite your friends.</p>
              <Link href={user ? '/rooms/new' : '/login?next=/rooms/new'} className="btn-primary">Create a room</Link>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {showcase.map((r) => (
                <Link key={r.id} href={recent.length ? `/room/${r.id}` : `/join/${r.id}`} className="card group flex items-center gap-4 p-4 transition hover:border-white/20">
                  {r.avatar_url
                    ? <img src={r.avatar_url} alt="" className="h-14 w-14 rounded-2xl object-cover" />
                    : <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-plum font-display text-xl font-bold text-lilac">{r.name.charAt(0).toUpperCase()}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold group-hover:text-beam">{r.name}</span>
                    <span className="block truncate text-sm text-white/55">{r.source_title || sourceLabel(r.source_type)}</span>
                    <span className="text-xs text-white/35">{timeAgo(r.last_active ?? r.last_activity)}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="mx-auto mt-20 max-w-7xl px-4 sm:px-6">
          <h2 className="font-display text-3xl font-bold tracking-tight">How it works</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card relative p-6">
                <span className="font-display text-5xl font-extrabold text-white/10">{i + 1}</span>
                <h3 className="mt-2 font-display text-lg font-bold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <Footer />
    </>
  );
}
