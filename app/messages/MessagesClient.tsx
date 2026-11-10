'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Send } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { getSupabase } from '@/lib/supabase/client';
import { clockTime, cn, isOnline } from '@/lib/utils';
import type { Profile } from '@/lib/types';

interface DM { id: string; sender: string; recipient: string; content: string; read_at: string | null; created_at: string }

export function MessagesClient() {
  const supabase = getSupabase();
  const { userId } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const withId = params.get('with');
  const [friends, setFriends] = useState<Profile[]>([]);
  const [thread, setThread] = useState<DM[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const withRef = useRef(withId);
  withRef.current = withId;

  const loadFriends = useCallback(async () => {
    const { data } = await supabase.from('friendships')
      .select('requester, a:profiles!friendships_requester_fkey(id, username, display_name, avatar_url, last_seen), b:profiles!friendships_addressee_fkey(id, username, display_name, avatar_url, last_seen)')
      .eq('status', 'accepted');
    setFriends(((data ?? []) as unknown as { requester: string; a: Profile; b: Profile }[]).map((r) => (r.requester === userId ? r.b : r.a)));
    const { data: un } = await supabase.from('direct_messages').select('sender').eq('recipient', userId!).is('read_at', null);
    const counts: Record<string, number> = {};
    for (const m of un ?? []) counts[m.sender] = (counts[m.sender] ?? 0) + 1;
    setUnread(counts);
  }, [supabase, userId]);

  const loadThread = useCallback(async (other: string) => {
    const { data } = await supabase.from('direct_messages').select('*')
      .or(`and(sender.eq.${userId},recipient.eq.${other}),and(sender.eq.${other},recipient.eq.${userId})`)
      .order('created_at', { ascending: true }).limit(200);
    setThread((data ?? []) as DM[]);
    await supabase.from('direct_messages').update({ read_at: new Date().toISOString() }).eq('sender', other).eq('recipient', userId!).is('read_at', null);
    setUnread((u) => ({ ...u, [other]: 0 }));
  }, [supabase, userId]);

  useEffect(() => { if (userId) loadFriends(); }, [userId, loadFriends]);
  useEffect(() => { if (userId && withId) loadThread(withId); }, [userId, withId, loadThread]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [thread.length]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase.channel(`dm:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `recipient=eq.${userId}` }, ({ new: m }) => {
        const dm = m as DM;
        if (dm.sender === withRef.current) {
          setThread((t) => [...t, dm]);
          supabase.from('direct_messages').update({ read_at: new Date().toISOString() }).eq('id', dm.id).then(() => {});
        } else setUnread((u) => ({ ...u, [dm.sender]: (u[dm.sender] ?? 0) + 1 }));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase, userId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content || !withId) return;
    const { data, error } = await supabase.from('direct_messages').insert({ sender: userId, recipient: withId, content }).select().single();
    if (error) { toast(error.message.includes('row-level') ? 'You can only message friends who haven’t blocked you.' : error.message, 'error'); return; }
    setThread((t) => [...t, data as DM]);
    setText('');
  }

  const current = friends.find((f) => f.id === withId);

  return (
    <div className="glass grid h-[calc(100dvh-4rem)] overflow-hidden sm:h-[calc(100dvh-7rem)] sm:rounded-3xl md:grid-cols-[300px_1fr]">
      <aside className={cn('scroll-thin overflow-y-auto border-r border-white/5', withId && 'hidden md:block')}>
        <h1 className="px-5 pb-2 pt-5 font-display text-2xl font-bold">Messages</h1>
        {friends.length === 0 && <p className="px-5 text-sm text-white/50">Add friends to start private conversations. <Link href="/friends" className="text-beam hover:underline">Find friends</Link></p>}
        {friends.map((f) => (
          <button key={f.id} onClick={() => router.replace(`/messages?with=${f.id}`)}
            className={cn('flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5', f.id === withId && 'bg-white/[0.07]')}>
            <Avatar name={f.display_name || f.username} src={f.avatar_url} size={40} online={isOnline(f.last_seen)} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.display_name || f.username}</span>
            {(unread[f.id] ?? 0) > 0 && <span className="rounded-full bg-beam px-2 py-0.5 text-xs font-bold text-ink">{unread[f.id]}</span>}
          </button>
        ))}
      </aside>

      <section className={cn('flex min-h-0 flex-col', !withId && 'hidden md:flex')}>
        {!withId ? (
          <div className="flex flex-1 items-center justify-center text-sm text-white/45">Pick a friend to start chatting.</div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
              <button className="icon-btn h-9 w-9 md:hidden" onClick={() => router.replace('/messages')} aria-label="Back"><ArrowLeft className="h-4 w-4" /></button>
              <Avatar name={current?.display_name || current?.username} src={current?.avatar_url} size={36} online={isOnline(current?.last_seen)} />
              <span className="font-semibold">{current ? (current.display_name || current.username) : 'Conversation'}</span>
            </header>
            <div className="scroll-thin min-h-0 flex-1 space-y-1.5 overflow-y-auto p-4">
              {!current && <p className="text-center text-sm text-white/50">You can only message people who are your friends.</p>}
              {thread.map((m) => (
                <div key={m.id} className={cn('flex', m.sender === userId ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[78%] rounded-2xl px-3.5 py-2 text-[14.5px]', m.sender === userId ? 'rounded-br-sm bg-violet/40' : 'rounded-bl-sm bg-white/[0.07]')}>
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    <p className="mt-0.5 text-right text-[10px] text-white/45">{clockTime(m.created_at)}{m.sender === userId && m.read_at ? ' · Seen' : ''}</p>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <form onSubmit={send} className="flex gap-2 border-t border-white/5 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <input className="input" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="Write a message" disabled={!current} aria-label="Message" />
              <button className="btn-violet h-11 w-11 shrink-0 p-0" disabled={!text.trim() || !current} aria-label="Send"><Send className="h-4 w-4" /></button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
