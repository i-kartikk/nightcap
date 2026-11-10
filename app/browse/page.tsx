import Link from 'next/link';
import { Suspense } from 'react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { createClient } from '@/lib/supabase/server';
import { sourceLabel } from '@/lib/video';
import { timeAgo } from '@/lib/utils';
import type { Room } from '@/lib/types';
import { BrowseSearch } from './BrowseSearch';

export const metadata = { title: 'Browse' };
export const dynamic = 'force-dynamic';

export default async function BrowsePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: rooms } = await supabase.from('rooms').select('*').eq('is_public', true).order('last_activity', { ascending: false }).limit(24);

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Find something to watch</h1>
        <p className="mt-2 max-w-2xl text-white/60">Search YouTube and start a room around any video, or drop into a public room that’s already watching.</p>
        <Suspense><BrowseSearch signedIn={!!user} /></Suspense>

        <h2 className="mt-16 font-display text-2xl font-bold">Public rooms</h2>
        {(!rooms || rooms.length === 0) ? (
          <p className="mt-4 text-white/55">No public rooms right now. Create one and set it to public so others can join.</p>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(rooms as Room[]).map((r) => (
              <Link key={r.id} href={`/join/${r.id}`} className="card group flex items-center gap-4 p-4 hover:border-white/20">
                {r.avatar_url ? <img src={r.avatar_url} alt="" className="h-14 w-14 rounded-2xl object-cover" />
                  : <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-plum font-display text-xl font-bold text-lilac">{r.name.charAt(0).toUpperCase()}</span>}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold group-hover:text-beam">{r.name}</span>
                  <span className="block truncate text-sm text-white/55">{r.source_title || sourceLabel(r.source_type)}</span>
                  <span className="text-xs text-white/35">{r.has_password ? 'Password · ' : ''}active {timeAgo(r.last_activity)}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
