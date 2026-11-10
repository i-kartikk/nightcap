'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { getSupabase } from '@/lib/supabase/client';
import { useAuth } from './AuthProvider';
import { useToast } from './Toast';
import type { Notification } from '@/lib/types';
import { timeAgo } from '@/lib/utils';

function describe(n: Notification) {
  const p = n.payload;
  switch (n.type) {
    case 'friend_request': return { text: `@${p.from_username} sent you a friend request`, href: '/friends' };
    case 'friend_accepted': return { text: `@${p.from_username} accepted your friend request`, href: '/friends' };
    case 'dm': return { text: `@${p.from_username}: ${p.preview}`, href: `/messages?with=${p.from}` };
    case 'room_invite': return { text: `@${p.from_username} invited you to “${p.room_name}”`, href: `/join/${p.room_id}` };
    case 'role_changed': return { text: `Your role in room ${p.room_id} is now ${p.role}`, href: `/room/${p.room_id}` };
    case 'host_transferred': return { text: `You are now the host of room ${p.room_id}`, href: `/room/${p.room_id}` };
    default: return { text: 'New notification', href: '/' };
  }
}

export function NotificationBell() {
  const { userId } = useAuth();
  const supabase = getSupabase();
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId) return;
    supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => setItems((data as Notification[]) ?? []));
    const ch = supabase.channel(`notif:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (p) => {
          const n = p.new as Notification;
          setItems((x) => [n, ...x].slice(0, 30));
          if (n.type !== 'dm' || !location.pathname.startsWith('/messages')) toast(describe(n).text, 'info');
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, supabase, toast]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const unread = items.filter((i) => !i.read).length;

  async function markAll() {
    setItems((x) => x.map((i) => ({ ...i, read: true })));
    await supabase.from('notifications').update({ read: true }).eq('read', false);
  }

  if (!userId) return null;
  return (
    <div className="relative" ref={ref}>
      <button className="icon-btn relative" onClick={() => setOpen((o) => !o)} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-beam px-1 text-[10px] font-bold text-ink">{unread > 9 ? '9+' : unread}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="glass-strong absolute right-0 top-12 z-50 w-[min(92vw,360px)] rounded-2xl p-2 shadow-2xl">
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="font-display font-bold">Notifications</span>
              {unread > 0 && <button onClick={markAll} className="text-xs text-lilac hover:underline">Mark all read</button>}
            </div>
            <div className="max-h-[60vh] overflow-y-auto scroll-thin">
              {items.length === 0 && <p className="px-3 py-6 text-center text-sm text-white/50">You’re all caught up.</p>}
              {items.map((n) => {
                const d = describe(n);
                return (
                  <button key={n.id} onClick={async () => {
                    setOpen(false);
                    if (!n.read) { setItems((x) => x.map((i) => (i.id === n.id ? { ...i, read: true } : i))); await supabase.from('notifications').update({ read: true }).eq('id', n.id); }
                    router.push(d.href);
                  }} className="flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-white/5">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-beam'}`} />
                    <span className="flex-1"><span className="block text-white/90">{d.text}</span><span className="text-xs text-white/40">{timeAgo(n.created_at)}</span></span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
