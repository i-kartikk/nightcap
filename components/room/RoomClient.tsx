'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'framer-motion';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  ArrowLeft, Clapperboard, UserPlus, Settings, Star, Maximize, PictureInPicture2, Phone, Video, MessageSquare,
  Users, Wifi, WifiOff, Loader2, Volume2, Play, Timer, LogOut, X,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { syncClock, serverNow, clockRtt } from '@/lib/clock';
import { useSync, stateFromRoom } from '@/hooks/useSync';
import { YouTubePlayer, Html5Player, IframeEmbed, type PlayerHandle } from './players';
import { NetflixPanel, ManualSyncBar } from './ManualSync';
import { ChatPanel, QUICK_EMOJI } from './ChatPanel';
import { ParticipantsPanel, ParticipantStrip, type MemberActions } from './ParticipantsPanel';
import { SourcePicker } from './SourcePicker';
import { InviteModal, RoomSettingsModal, ReportModal } from './modals';
import { useToast } from '../Toast';
import { useAuth } from '../AuthProvider';
import { parseYouTubeId, sourceLabel, isSyncable } from '@/lib/video';
import { canControl } from '@/lib/types';
import type { Member, Message, PlaybackState, PresenceInfo, Profile, Reaction, Room, RoomRole } from '@/lib/types';
import { cn } from '@/lib/utils';

const CallPanel = dynamic(() => import('./CallPanel').then((m) => m.CallPanel), { ssr: false });

type ConnStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';
interface FloatingReaction { id: number; emoji: string; x: number }

export function RoomClient({ initialRoom, initialMembers, me, initialFavorite }: {
  initialRoom: Room; initialMembers: Member[]; me: string; initialFavorite: boolean;
}) {
  const supabase = getSupabase();
  const router = useRouter();
  const toast = useToast();
  const { profile } = useAuth();
  const roomId = initialRoom.id;

  const [room, setRoom] = useState(initialRoom);
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [presence, setPresence] = useState<Record<string, PresenceInfo>>({});
  const [typing, setTyping] = useState<Record<string, { name: string; at: number }>>({});
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [floating, setFloating] = useState<FloatingReaction[]>([]);
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [favorite, setFavorite] = useState(initialFavorite);
  const [call, setCall] = useState<null | { video: boolean }>(null);
  const [picker, setPicker] = useState(false);
  const [invite, setInvite] = useState(false);
  const [settings, setSettings] = useState(false);
  const [report, setReport] = useState<{ userId: string; messageId?: string; name: string } | null>(null);
  const [sideTab, setSideTab] = useState<'chat' | 'people'>('chat');
  const [sheet, setSheet] = useState(false);
  const [unread, setUnread] = useState(0);
  const [qualities, setQualities] = useState<{ id: number; label: string }[]>([]);
  const [, forceTick] = useState(0);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const playerRef = useRef<PlayerHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const wasDisconnected = useRef(false);
  const lastTypingSent = useRef(0);
  const lastReactionSent = useRef(0);
  const historyLogged = useRef<string | null>(null);
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const deniedAt = useRef(0);

  const myRole: RoomRole | null = members.find((m) => m.user_id === me)?.role ?? null;
  const controlling = canControl(myRole, room.everyone_can_control);
  const profiles = useMemo(() => {
    const map: Record<string, Profile> = {};
    for (const m of members) if (m.profile) map[m.user_id] = m.profile;
    return map;
  }, [members]);
  const membersRef = useRef(members);
  membersRef.current = members;
  const roomRef = useRef(room);
  roomRef.current = room;

  /* ---------------- sync engine ---------------- */
  const broadcastState = useCallback((s: PlaybackState) => {
    channelRef.current?.send({ type: 'broadcast', event: 'sync', payload: { state: s, from: me } });
  }, [me]);

  const sync = useSync({
    roomId, initial: initialRoom, controlling, player: playerRef, broadcast: broadcastState,
    onError: (m) => toast(m, 'error'),
    onDenied: () => {
      if (Date.now() - deniedAt.current > 4000) { deniedAt.current = Date.now(); toast('Only the host and co-hosts control playback in this room.', 'info'); }
    },
  });
  const { state } = sync;

  /* ---------------- data loaders ---------------- */
  const loadMembers = useCallback(async () => {
    const { data } = await supabase.from('room_members').select('*, profile:profiles(id, username, display_name, avatar_url)').eq('room_id', roomId);
    if (data) {
      setMembers(data as Member[]);
      if (!data.some((m) => m.user_id === me)) { toast('You are no longer a member of this room.', 'error'); router.replace('/'); }
    }
  }, [supabase, roomId, me, router, toast]);

  const loadRoom = useCallback(async () => {
    const { data, error } = await supabase.from('rooms').select('*').eq('id', roomId).maybeSingle();
    if (!data && !error) { toast('This room was closed.', 'info'); router.replace('/'); return; }
    if (data) { setRoom(data as Room); sync.applyRemote(stateFromRoom(data as Room)); }
  }, [supabase, roomId, router, toast, sync.applyRemote]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadChat = useCallback(async () => {
    const { data } = await supabase.from('messages').select('*').eq('room_id', roomId).order('created_at', { ascending: false }).limit(150);
    const list = ((data ?? []) as Message[]).reverse();
    setMessages(list);
    if (list.length) {
      const { data: rx } = await supabase.from('message_reactions').select('room_id, message_id, user_id, emoji').eq('room_id', roomId);
      setReactions((rx ?? []) as Reaction[]);
    }
  }, [supabase, roomId]);

  const ensureProfile = useCallback(async (userId: string) => {
    if (membersRef.current.some((m) => m.user_id === userId && m.profile)) return;
    await loadMembers();
  }, [loadMembers]);

  /* ---------------- realtime channel ---------------- */
  useEffect(() => {
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectAttempt = 0;
    let activeChannel: RealtimeChannel | null = null;
    syncClock();
    const clockTimer = setInterval(syncClock, 5 * 60_000);
    loadChat();
    supabase.from('blocks').select('blocked').then(({ data }) => setBlocked(new Set((data ?? []).map((b) => b.blocked))));

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) supabase.realtime.setAuth(session.access_token);
      if (disposed) return;

      const createChannel = () => {
        if (disposed) return;
        const ch = supabase.channel(`room:${roomId}`, { config: { private: true, presence: { key: me }, broadcast: { self: false, ack: false } } });
        activeChannel = ch;
        channelRef.current = ch;

        ch.on('presence', { event: 'sync' }, () => {
          const raw = ch.presenceState<PresenceInfo>();
          const next: Record<string, PresenceInfo> = {};
          for (const [key, metas] of Object.entries(raw)) if (metas[0]) next[key] = metas[0];
          setPresence(next);
        })
          .on('broadcast', { event: 'sync' }, ({ payload }) => {
            const sender = membersRef.current.find((m) => m.user_id === payload.from);
            if (!sender || !canControl(sender.role, roomRef.current.everyone_can_control)) return;
            sync.applyRemote({ ...(payload.state as PlaybackState), origin: 'broadcast' });
          })
          .on('broadcast', { event: 'typing' }, ({ payload }) => {
            setTyping((t) => ({ ...t, [payload.from]: { name: payload.name, at: Date.now() } }));
          })
          .on('broadcast', { event: 'reaction' }, ({ payload }) => spawnReaction(payload.emoji))
          .on('broadcast', { event: 'members' }, () => loadMembers())
          .on('broadcast', { event: 'kick' }, ({ payload }) => {
            if (payload.user === me) { toast(payload.ban ? 'You were banned from this room.' : 'A moderator removed you from this room.', 'error'); router.replace('/'); }
            else loadMembers();
          })
          .on('broadcast', { event: 'unreact' }, ({ payload }) => {
            setReactions((r) => r.filter((x) => !(x.message_id === payload.message_id && x.user_id === payload.user_id && x.emoji === payload.emoji)));
          })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, ({ new: r }) => {
            setRoom(r as Room);
            sync.applyRemote(stateFromRoom(r as Room, 'db'));
          })
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, () => {
            toast('The host closed this room.', 'info'); router.replace('/');
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` }, () => loadMembers())
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, ({ new: m }) => {
            const msg = m as Message;
            setMessages((list) => (list.some((x) => x.id === msg.id) ? list : [...list, msg].slice(-300)));
            setTyping((t) => { const n = { ...t }; delete n[msg.user_id]; return n; });
            ensureProfile(msg.user_id);
            if (msg.user_id !== me && !sheetRef.current && window.innerWidth < 1024) setUnread((u) => u + 1);
          })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, ({ new: m }) => {
            setMessages((list) => list.map((x) => (x.id === (m as Message).id ? (m as Message) : x)));
          })
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions', filter: `room_id=eq.${roomId}` }, ({ new: r }) => {
            const rx = r as Reaction;
            setReactions((list) => (list.some((x) => x.message_id === rx.message_id && x.user_id === rx.user_id && x.emoji === rx.emoji) ? list : [...list, rx]));
          })
          .subscribe(async (s, err) => {
          if (err) console.error('Realtime:', s, err);
            if (s === 'SUBSCRIBED') {
              if (reconnectTimer) clearTimeout(reconnectTimer);
              reconnectTimer = undefined;
              reconnectAttempt = 0;
              setStatus('live');
              await ch.track(presencePayload(false));
              if (wasDisconnected.current) {
                wasDisconnected.current = false;
                toast('Reconnected. Catching up…', 'success');
                loadRoom(); loadMembers(); loadChat(); syncClock();
              }
            } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
              if (!disposed) {
                wasDisconnected.current = true;
                setStatus(navigator.onLine ? 'reconnecting' : 'offline');
                if (s === 'CLOSED' && activeChannel === ch) {
                  if (reconnectTimer) clearTimeout(reconnectTimer);
                  const delay = Math.min(1000 * 2 ** reconnectAttempt++, 30_000);
                  reconnectTimer = setTimeout(() => {
                    if (!disposed && activeChannel === ch) createChannel();
                  }, delay);
                }
              }
            }
          });
      };

      createChannel();
    })();

    const onOffline = () => { wasDisconnected.current = true; setStatus('offline'); };
    const onOnline = () => { wasDisconnected.current = true; setStatus('reconnecting'); };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    const touch = () => { supabase.rpc('touch_presence', { p_room: roomId }).then(() => {}); };
    const beat = setInterval(touch, 60_000);
    touch();

    return () => {
      disposed = true;
      clearInterval(clockTimer); clearInterval(beat);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  function presencePayload(inCall: boolean): PresenceInfo {
    return {
      user_id: me, username: profile?.display_name || profile?.username || 'Someone', avatar_url: profile?.avatar_url ?? null,
      watching: document.visibilityState === 'visible', in_call: inCall, online_at: new Date().toISOString(),
    };
  }

  // Re-announce presence when tab visibility or call state changes.
  useEffect(() => {
    const update = () => { if (channelRef.current && status === 'live') channelRef.current.track(presencePayload(!!call)); };
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [call, status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Expire typing indicators; refresh countdown display.
  useEffect(() => {
    const t = setInterval(() => {
      setTyping((ty) => {
        const now = Date.now();
        const entries = Object.entries(ty).filter(([, v]) => now - v.at < 3500);
        return entries.length === Object.keys(ty).length ? ty : Object.fromEntries(entries);
      });
      if (state.countdownAtMs && state.countdownAtMs > serverNow() - 1000) forceTick((x) => x + 1);
    }, 250);
    return () => clearInterval(t);
  }, [state.countdownAtMs]);

  // Log watch history once per source.
  useEffect(() => {
    if (!state.source_url || state.source_type === 'none' || historyLogged.current === state.source_url) return;
    historyLogged.current = state.source_url;
    supabase.from('watch_history').insert({ user_id: me, room_id: roomId, source_type: state.source_type, source_url: state.source_url, title: state.source_title }).then(() => {});
  }, [state.source_url, state.source_type, state.source_title, me, roomId, supabase]);

  /* ---------------- reactions ---------------- */
  function spawnReaction(emoji: string) {
    const id = Date.now() + Math.random();
    setFloating((f) => [...f.slice(-24), { id, emoji, x: 10 + Math.random() * 80 }]);
    setTimeout(() => setFloating((f) => f.filter((x) => x.id !== id)), 2700);
  }
  function sendReaction(emoji: string) {
    if (Date.now() - lastReactionSent.current < 250) return;
    lastReactionSent.current = Date.now();
    spawnReaction(emoji);
    channelRef.current?.send({ type: 'broadcast', event: 'reaction', payload: { emoji, from: me } });
  }

  /* ---------------- chat actions ---------------- */
  const sendMessage = useCallback(async (content: string, gifUrl: string | null, replyTo: string | null) => {
    const { data, error } = await supabase.from('messages').insert({ room_id: roomId, user_id: me, content, gif_url: gifUrl, reply_to: replyTo }).select().single();
    if (error) { toast(error.message, 'error'); return false; }
    setMessages((list) => (list.some((x) => x.id === data.id) ? list : [...list, data as Message]));
    return true;
  }, [supabase, roomId, me, toast]);

  const deleteMessage = useCallback(async (id: string) => {
    const { error } = await supabase.rpc('delete_message', { p_message: id });
    if (error) toast(error.message, 'error');
    else setMessages((list) => list.map((m) => (m.id === id ? { ...m, content: '', gif_url: null, deleted_at: new Date().toISOString() } : m)));
  }, [supabase, toast]);

  const react = useCallback(async (messageId: string, emoji: string) => {
    const mine = reactions.some((r) => r.message_id === messageId && r.user_id === me && r.emoji === emoji);
    if (mine) {
      setReactions((r) => r.filter((x) => !(x.message_id === messageId && x.user_id === me && x.emoji === emoji)));
      await supabase.from('message_reactions').delete().match({ message_id: messageId, user_id: me, emoji });
      channelRef.current?.send({ type: 'broadcast', event: 'unreact', payload: { message_id: messageId, user_id: me, emoji } });
    } else {
      const rx = { room_id: roomId, message_id: messageId, user_id: me, emoji };
      setReactions((r) => [...r, rx]);
      const { error } = await supabase.from('message_reactions').insert(rx);
      if (error) setReactions((r) => r.filter((x) => !(x.message_id === messageId && x.user_id === me && x.emoji === emoji)));
    }
  }, [reactions, supabase, me, roomId]);

  const onTyping = useCallback(() => {
    if (Date.now() - lastTypingSent.current < 2000) return;
    lastTypingSent.current = Date.now();
    channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { from: me, name: profile?.display_name || profile?.username } });
  }, [me, profile]);

  /* ---------------- member actions ---------------- */
  const notifyMembers = () => channelRef.current?.send({ type: 'broadcast', event: 'members', payload: {} });
  const memberActions: MemberActions = {
    async setRole(userId, role) {
      const { error } = await supabase.rpc('set_member_role', { p_room: roomId, p_user: userId, p_role: role });
      if (error) toast(error.message, 'error'); else { toast('Role updated', 'success'); loadMembers(); notifyMembers(); }
    },
    async transfer(userId) {
      if (!confirm(`Make ${profiles[userId]?.username} the host? You’ll become a co-host.`)) return;
      const { error } = await supabase.rpc('transfer_host', { p_room: roomId, p_user: userId });
      if (error) toast(error.message, 'error'); else { toast('Host transferred', 'success'); loadMembers(); notifyMembers(); }
    },
    async kick(userId, ban) {
      if (!confirm(ban ? `Ban ${profiles[userId]?.username} from this room?` : `Remove ${profiles[userId]?.username} from this room?`)) return;
      const { error } = await supabase.rpc('kick_member', { p_room: roomId, p_user: userId, p_ban: ban });
      if (error) toast(error.message, 'error');
      else { channelRef.current?.send({ type: 'broadcast', event: 'kick', payload: { user: userId, ban } }); loadMembers(); }
    },
    async addFriend(userId) {
      const { error } = await supabase.from('friendships').insert({ requester: me, addressee: userId });
      if (error) toast(error.code === '23505' ? 'You already sent a request or are friends.' : error.message, 'error');
      else toast('Friend request sent', 'success');
    },
    message(userId) { window.open(`/messages?with=${userId}`, '_blank', 'noopener'); },
    report(userId) { setReport({ userId, name: profiles[userId]?.username ?? 'user' }); },
    async block(userId) {
      if (!confirm(`Block ${profiles[userId]?.username}? You won’t see their messages.`)) return;
      const { error } = await supabase.from('blocks').insert({ blocker: me, blocked: userId });
      if (error && error.code !== '23505') toast(error.message, 'error');
      else { setBlocked((b) => new Set(b).add(userId)); toast('User blocked', 'success'); }
    },
  };

  /* ---------------- room actions ---------------- */
  async function toggleFavorite() {
    setFavorite((f) => !f);
    if (favorite) await supabase.from('favorites').delete().match({ user_id: me, room_id: roomId });
    else await supabase.from('favorites').insert({ user_id: me, room_id: roomId });
  }

  async function leave() {
    if (!confirm(myRole === 'owner' ? 'Leave this room? Host passes to the next person, or the room closes if you’re the last one.' : 'Leave this room?')) return;
    const { error } = await supabase.rpc('leave_room', { p_room: roomId });
    if (error) toast(error.message, 'error');
    else { notifyMembers(); router.replace('/'); }
  }

  function fullscreen() {
    const el = stageRef.current;
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => playerRef.current?.nativeFullscreen?.());
    else playerRef.current?.nativeFullscreen?.();
  }

  const onReady = useCallback(() => {
    sync.onPlayerReady();
    setTimeout(() => setQualities(playerRef.current?.qualities?.() ?? []), 1500);
  }, [sync.onPlayerReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const endCall = useCallback(() => setCall(null), []);
  const callError = useCallback((m: string) => toast(m, 'error'), [toast]);

  /* ---------------- render helpers ---------------- */
  const ytId = state.source_type === 'youtube' && state.source_url ? parseYouTubeId(state.source_url) : null;
  const countdownLeft = state.countdownAtMs ? Math.ceil((state.countdownAtMs - serverNow()) / 1000) : 0;
  const typingNames = Object.entries(typing).filter(([id]) => id !== me && !blocked.has(id)).map(([, v]) => v.name);
  const pipSupported = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && (state.source_type === 'html5' || state.source_type === 'hls');

  const player = (
    <div ref={stageRef} className="relative aspect-video w-full overflow-hidden bg-black lg:rounded-3xl">
      {state.source_type === 'none' && (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
          <Clapperboard className="h-10 w-10 text-beam" />
          <p className="max-w-sm text-white/70">{controlling ? 'Nothing is playing yet. Pick a YouTube video or paste a link.' : 'Waiting for the host to pick something to watch.'}</p>
          {controlling && <button className="btn-primary" onClick={() => setPicker(true)}>Choose a video</button>}
        </div>
      )}
      {ytId && <YouTubePlayer key={ytId} ref={playerRef} videoId={ytId} onReady={onReady} onPlay={sync.onLocalChange} onPause={sync.onLocalChange} onSeek={sync.onLocalChange} onBuffering={sync.setBuffering} />}
      {(state.source_type === 'html5' || state.source_type === 'hls') && state.source_url && (
        <Html5Player key={state.source_url} ref={playerRef} src={state.source_url} hls={state.source_type === 'hls'}
          onReady={onReady} onPlay={sync.onLocalChange} onPause={sync.onLocalChange} onSeek={sync.onLocalChange} onBuffering={sync.setBuffering} />
      )}
      {state.source_type === 'iframe' && state.source_url && (
        <IframeEmbed key={state.source_url} url={state.source_url} onCountdown={controlling ? () => sync.startCountdown(5) : undefined} />
      )}
      {state.source_type === 'netflix' && state.source_url && <NetflixPanel url={state.source_url} />}

      {/* floating emoji */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {floating.map((f) => <span key={f.id} className="absolute bottom-6 animate-floatUp text-4xl" style={{ left: `${f.x}%` }}>{f.emoji}</span>)}
      </div>

      <AnimatePresence>
        {countdownLeft > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
            <motion.span key={countdownLeft} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-display text-[22vw] font-extrabold leading-none text-beam lg:text-[10rem]">{countdownLeft}</motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      {sync.needsGesture && isSyncable(state.source_type) && (
        <button onClick={sync.resolveGesture} className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
          <span className="btn-primary px-6 py-3 text-base">
            {sync.needsGesture === 'muted' ? <><Volume2 className="h-5 w-5" />Tap to turn on sound</> : <><Play className="h-5 w-5" />Tap to join playback</>}
          </span>
        </button>
      )}
      {sync.buffering && !sync.needsGesture && (
        <span className="chip absolute left-3 top-3 bg-black/60"><Loader2 className="h-3 w-3 animate-spin" />Buffering</span>
      )}
    </div>
  );

  const connChip = (
    <span className={cn('chip', status === 'live' ? 'text-emerald-300' : status === 'offline' ? 'text-rose-300' : 'text-beam')}
      title={status === 'live' ? `Connected · ${Math.round(clockRtt())} ms round trip` : undefined}>
      {status === 'live' ? <Wifi className="h-3.5 w-3.5" /> : status === 'offline' ? <WifiOff className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {status === 'live' ? `${Math.round(clockRtt()) || '–'} ms` : status === 'offline' ? 'Offline' : status === 'connecting' ? 'Connecting' : 'Reconnecting'}
    </span>
  );

  const chat = (
    <ChatPanel messages={messages} reactions={reactions} profiles={profiles} me={me} myRole={myRole} typing={typingNames} blocked={blocked}
      onSend={sendMessage} onDelete={deleteMessage} onReact={react} onTyping={onTyping}
      onReport={(m) => setReport({ userId: m.user_id, messageId: m.id, name: profiles[m.user_id]?.username ?? 'user' })} />
  );
  const people = <ParticipantsPanel members={members} presence={presence} me={me} myRole={myRole} actions={memberActions} />;

  const sideTabs = (
    <div className="flex gap-1 border-b border-white/5 p-2">
      {([['chat', 'Chat', MessageSquare], ['people', `People · ${Object.keys(presence).length}`, Users]] as const).map(([k, label, I]) => (
        <button key={k} onClick={() => setSideTab(k)} className={cn('flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium', sideTab === k ? 'bg-white/10' : 'text-white/55 hover:text-white')}>
          <I className="h-4 w-4" />{label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center gap-2 border-b border-white/5 bg-ink/80 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-xl sm:px-4">
        <Link href="/" className="icon-btn h-9 w-9" aria-label="Back home"><ArrowLeft className="h-4 w-4" /></Link>
        {room.avatar_url ? <img src={room.avatar_url} alt="" className="h-9 w-9 rounded-xl object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-plum font-display font-bold text-lilac">{room.name.charAt(0).toUpperCase()}</span>}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[15px] font-bold leading-tight">{room.name}</h1>
          <p className="truncate text-xs text-white/50">{state.source_title || sourceLabel(state.source_type)}</p>
        </div>
        <div className="hidden sm:block">{connChip}</div>
        <button className="icon-btn h-9 w-9" onClick={toggleFavorite} aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={favorite}>
          <Star className={cn('h-4 w-4', favorite && 'fill-beam text-beam')} />
        </button>
        {(myRole === 'owner' || myRole === 'cohost') && <button className="icon-btn h-9 w-9" onClick={() => setSettings(true)} aria-label="Room settings"><Settings className="h-4 w-4" /></button>}
        <button className="btn-violet px-3 py-2 sm:px-4" onClick={() => setInvite(true)}><UserPlus className="h-4 w-4" /><span className="hidden sm:inline">Invite</span></button>
        <button className="icon-btn h-9 w-9" onClick={leave} aria-label="Leave room"><LogOut className="h-4 w-4" /></button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Stage */}
        <main className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto lg:p-4 scroll-thin">
          <div className="sticky top-0 z-30 lg:static">{player}</div>

          <div className="flex flex-col gap-3 px-3 lg:px-0">
            {/* Controls row */}
            <div className="flex flex-wrap items-center gap-2">
              {controlling && <button className="btn-ghost px-3.5 py-2" onClick={() => setPicker(true)}><Clapperboard className="h-4 w-4" />Change video</button>}
              {controlling && state.source_type !== 'none' && <button className="btn-ghost px-3.5 py-2" onClick={() => sync.startCountdown(5)}><Timer className="h-4 w-4" />Countdown</button>}
              {!call ? (
                <>
                  <button className="btn-ghost px-3.5 py-2" onClick={() => setCall({ video: false })}><Phone className="h-4 w-4" />Voice</button>
                  <button className="btn-ghost px-3.5 py-2" onClick={() => setCall({ video: true })}><Video className="h-4 w-4" />Video call</button>
                </>
              ) : <span className="chip text-emerald-300"><Phone className="h-3.5 w-3.5" />In call</span>}
              <div className="ml-auto flex items-center gap-1.5">
                <span className="sm:hidden">{connChip}</span>
                {qualities.length > 1 && (
                  <select className="input w-auto py-1.5 text-xs" aria-label="Video quality" defaultValue={-1} onChange={(e) => playerRef.current?.setQuality?.(Number(e.target.value))}>
                    {qualities.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
                  </select>
                )}
                {pipSupported && <button className="icon-btn h-9 w-9" onClick={() => playerRef.current?.pip?.().catch(() => toast('Picture-in-picture isn’t available for this video.', 'error'))} aria-label="Picture in picture"><PictureInPicture2 className="h-4 w-4" /></button>}
                {state.source_type !== 'none' && <button className="icon-btn h-9 w-9" onClick={fullscreen} aria-label="Full screen"><Maximize className="h-4 w-4" /></button>}
              </div>
            </div>

            {/* Reactions */}
            <div className="scroll-thin flex gap-1.5 overflow-x-auto">
              {QUICK_EMOJI.map((e) => (
                <button key={e} onClick={() => sendReaction(e)} className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xl transition hover:-translate-y-0.5 hover:bg-white/10 active:scale-90" aria-label={`React ${e}`}>{e}</button>
              ))}
            </div>

            {(state.source_type === 'netflix' || state.source_type === 'iframe') && (
              <ManualSyncBar state={state} controlling={controlling} onSet={sync.setManual} onCountdown={() => sync.startCountdown(5)} />
            )}

            {!controlling && state.source_type !== 'none' && (
              <p className="text-xs text-white/45">
                {members.find((m) => m.role === 'owner')?.profile?.username ? `@${members.find((m) => m.role === 'owner')!.profile!.username} is hosting.` : ''} Playback follows the host. Volume and fullscreen are yours.
              </p>
            )}

            <div className="card mb-24 p-3 lg:mb-0"><ParticipantStrip members={members} presence={presence} /></div>
          </div>
        </main>

        {/* Desktop sidebar */}
        <aside className="hidden min-h-0 flex-col border-l border-white/5 bg-coal/40 lg:flex">
          {sideTabs}
          <div className="min-h-0 flex-1">{sideTab === 'chat' ? chat : people}</div>
        </aside>
      </div>

      {/* Mobile chat button + bottom sheet */}
      <button onClick={() => { setSheet(true); setUnread(0); }}
        className="btn-primary fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-40 -translate-x-1/2 px-6 py-3 shadow-2xl lg:hidden">
        <MessageSquare className="h-5 w-5" />Chat{unread > 0 && <span className="rounded-full bg-ink px-2 py-0.5 text-xs text-beam">{unread}</span>}
      </button>
      <AnimatePresence>
        {sheet && (
          <motion.div className="fixed inset-0 z-[60] bg-black/50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheet(false)}>
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => { if (info.offset.y > 120) setSheet(false); }}
              onClick={(e) => e.stopPropagation()}
              className="glass-strong absolute inset-x-0 bottom-0 flex h-[72dvh] flex-col rounded-t-3xl">
              <div className="flex items-center justify-between px-3 pt-2">
                <span className="mx-auto h-1.5 w-10 rounded-full bg-white/20" />
              </div>
              <div className="flex items-center">
                <div className="flex-1">{sideTabs}</div>
                <button className="icon-btn mr-2 h-9 w-9" onClick={() => setSheet(false)} aria-label="Close chat"><X className="h-4 w-4" /></button>
              </div>
              <div className="min-h-0 flex-1">{sideTab === 'chat' ? chat : people}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {call && <CallPanel roomId={roomId} withVideo={call.video} onLeave={endCall} onError={callError} />}

      <SourcePicker open={picker} onClose={() => setPicker(false)} onPick={(type, url, title) => { setPicker(false); sync.changeSource(type, url, title); }} />
      <InviteModal open={invite} onClose={() => setInvite(false)} room={room} me={me} />
      <RoomSettingsModal open={settings} onClose={() => setSettings(false)} room={room} isOwner={myRole === 'owner'} onSaved={loadRoom} />
      <ReportModal target={report} onClose={() => setReport(null)} roomId={roomId} />
      <span className="sr-only" aria-live="polite">{countdownLeft > 0 ? `Starting in ${countdownLeft}` : ''}</span>
    </div>
  );
}
