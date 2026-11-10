'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Search, UserPlus, Check, X, MessageCircle, Loader2, Ban } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { getSupabase } from '@/lib/supabase/client';
import { isOnline } from '@/lib/utils';
import type { Profile } from '@/lib/types';

interface Row { requester: string; addressee: string; status: 'pending' | 'accepted'; a: Profile; b: Profile }

export function FriendsClient() {
  const supabase = getSupabase();
  const { userId } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [blocked, setBlocked] = useState<Profile[]>([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('friendships')
      .select('requester, addressee, status, a:profiles!friendships_requester_fkey(id, username, display_name, avatar_url, last_seen), b:profiles!friendships_addressee_fkey(id, username, display_name, avatar_url, last_seen)');
    setRows((data ?? []) as unknown as Row[]);
    const { data: bl } = await supabase.from('blocks').select('blocked, p:profiles!blocks_blocked_fkey(id, username, display_name, avatar_url)');
    setBlocked(((bl ?? []) as unknown as { p: Profile }[]).map((x) => x.p));
  }, [supabase]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!userId) return;
    const ch = supabase.channel(`friends:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase, userId, load]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (term.length < 2) return;
    setSearching(true);
    const { data } = await supabase.from('profiles').select('id, username, display_name, avatar_url, last_seen').ilike('username', `%${term}%`).neq('id', userId!).limit(12);
    setResults((data ?? []) as Profile[]);
    setSearching(false);
  }

  async function request(id: string) {
    const { error } = await supabase.from('friendships').insert({ requester: userId, addressee: id });
    if (error) toast(error.code === '23505' ? 'Request already sent.' : error.message, 'error'); else { toast('Friend request sent', 'success'); load(); }
  }
  async function accept(r: Row) {
    const { error } = await supabase.from('friendships').update({ status: 'accepted' }).match({ requester: r.requester, addressee: r.addressee });
    if (error) toast(error.message, 'error'); else load();
  }
  async function remove(r: Row) {
    await supabase.from('friendships').delete().match({ requester: r.requester, addressee: r.addressee });
    load();
  }
  async function unblock(id: string) {
    await supabase.from('blocks').delete().match({ blocker: userId, blocked: id });
    load();
  }

  const other = (r: Row) => (r.requester === userId ? r.b : r.a);
  const friends = rows.filter((r) => r.status === 'accepted');
  const incoming = rows.filter((r) => r.status === 'pending' && r.addressee === userId);
  const outgoing = rows.filter((r) => r.status === 'pending' && r.requester === userId);
  const relation = (id: string) => rows.find((r) => r.requester === id || r.addressee === id);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Friends</h1>

      <section className="card p-5">
        <form onSubmit={search} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input className="input pl-11" placeholder="Find people by username" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search usernames" />
          </div>
          <button className="btn-violet" disabled={searching}>{searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}</button>
        </form>
        {results.length > 0 && (
          <ul className="mt-3 space-y-1">
            {results.map((p) => {
              const rel = relation(p.id);
              return (
                <li key={p.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5">
                  <Avatar name={p.display_name || p.username} src={p.avatar_url} size={36} online={isOnline(p.last_seen)} />
                  <span className="flex-1 truncate text-sm">{p.display_name || p.username} <span className="text-white/40">@{p.username}</span></span>
                  {rel ? <span className="text-xs text-white/50">{rel.status === 'accepted' ? 'Friends' : 'Pending'}</span>
                    : <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => request(p.id)}><UserPlus className="h-3.5 w-3.5" />Add</button>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {incoming.length > 0 && (
        <section className="card p-5">
          <h2 className="font-display text-lg font-bold">Requests</h2>
          <ul className="mt-2 space-y-1">
            {incoming.map((r) => (
              <li key={r.requester} className="flex items-center gap-3 rounded-xl px-2 py-2">
                <Avatar name={r.a.display_name || r.a.username} src={r.a.avatar_url} size={36} />
                <span className="flex-1 truncate text-sm">@{r.a.username}</span>
                <button className="icon-btn h-9 w-9 text-emerald-300" onClick={() => accept(r)} aria-label="Accept"><Check className="h-4 w-4" /></button>
                <button className="icon-btn h-9 w-9 text-rose-300" onClick={() => remove(r)} aria-label="Decline"><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-5">
        <h2 className="font-display text-lg font-bold">Your friends <span className="text-white/40">{friends.length}</span></h2>
        <ul className="mt-2 space-y-1">
          {friends.length === 0 && <li className="py-4 text-sm text-white/50">Search for people above, or add someone from a room’s People list.</li>}
          {friends.map((r) => {
            const p = other(r);
            return (
              <li key={p.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5">
                <Avatar name={p.display_name || p.username} src={p.avatar_url} size={40} online={isOnline(p.last_seen)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.display_name || p.username}</span>
                  <span className="text-xs text-white/45">{isOnline(p.last_seen) ? 'Online' : 'Offline'} · @{p.username}</span>
                </span>
                <Link href={`/messages?with=${p.id}`} className="icon-btn h-9 w-9" aria-label={`Message ${p.username}`}><MessageCircle className="h-4 w-4" /></Link>
                <button className="icon-btn h-9 w-9" onClick={() => confirm(`Remove @${p.username} from friends?`) && remove(r)} aria-label="Remove friend"><X className="h-4 w-4" /></button>
              </li>
            );
          })}
        </ul>
        {outgoing.length > 0 && <p className="mt-3 text-xs text-white/45">Waiting on {outgoing.map((r) => `@${r.b.username}`).join(', ')}</p>}
      </section>

      {blocked.length > 0 && (
        <section className="card p-5">
          <h2 className="font-display text-lg font-bold">Blocked</h2>
          <ul className="mt-2 space-y-1">
            {blocked.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-2 py-2">
                <Ban className="h-4 w-4 text-rose-300" /><span className="flex-1 text-sm">@{p.username}</span>
                <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => unblock(p.id)}>Unblock</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
