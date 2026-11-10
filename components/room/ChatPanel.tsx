'use client';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Reply, Smile, Trash2, Send, X, Flag, ImagePlay, Loader2, SmilePlus } from 'lucide-react';
import { Avatar } from '../Avatar';
import type { Message, Profile, Reaction, RoomRole } from '@/lib/types';
import { canModerate } from '@/lib/types';
import { clockTime, cn } from '@/lib/utils';

export const QUICK_EMOJI = ['😂', '❤️', '😮', '😭', '🔥', '👏', '💀', '🍿'];
const PICKER_EMOJI = ['😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😎', '🤔', '😮', '😱', '😭', '😡', '🥺', '😴', '🤯', '👀', '💀', '🔥', '❤️', '💜', '💔', '👍', '👎', '👏', '🙌', '🙏', '🍿', '🎬', '🎉', '✨', '💯'];

interface Props {
  messages: Message[];
  reactions: Reaction[];
  profiles: Record<string, Profile>;
  me: string;
  myRole: RoomRole | null;
  typing: string[];
  blocked: Set<string>;
  onSend(content: string, gifUrl: string | null, replyTo: string | null): Promise<boolean>;
  onDelete(id: string): void;
  onReact(messageId: string, emoji: string): void;
  onTyping(): void;
  onReport(m: Message): void;
}

export function ChatPanel(props: Props) {
  const { messages, reactions, profiles, me, myRole, typing, blocked, onSend, onDelete, onReact, onTyping, onReport } = props;
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [panel, setPanel] = useState<null | 'emoji' | 'gif'>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const visible = useMemo(() => messages.filter((m) => !blocked.has(m.user_id)), [messages, blocked]);
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const reactionsByMsg = useMemo(() => {
    const map = new Map<string, Map<string, string[]>>();
    for (const r of reactions) {
      const m = map.get(r.message_id) ?? new Map<string, string[]>();
      m.set(r.emoji, [...(m.get(r.emoji) ?? []), r.user_id]);
      map.set(r.message_id, m);
    }
    return map;
  }, [reactions]);

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [visible.length]);

  async function submit(gif: string | null = null) {
    const content = text.trim();
    if (!content && !gif) return;
    setSending(true);
    const ok = await onSend(gif ? '' : content, gif, replyTo?.id ?? null);
    setSending(false);
    if (ok) { if (!gif) setText(''); setReplyTo(null); setPanel(null); stick.current = true; }
    inputRef.current?.focus();
  }

  const name = (id: string) => profiles[id]?.display_name || profiles[id]?.username || 'Someone';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={listRef} className="scroll-thin min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3"
        onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        {visible.length === 0 && <p className="mt-10 text-center text-sm text-white/45">No messages yet. Say hi to the room.</p>}
        {visible.map((m, i) => {
          const prev = visible[i - 1];
          const grouped = prev && prev.user_id === m.user_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 120000 && !m.reply_to;
          return (
            <ChatMessage key={m.id} m={m} grouped={!!grouped} mine={m.user_id === me} profile={profiles[m.user_id]}
              replied={m.reply_to ? byId.get(m.reply_to) : undefined} repliedName={m.reply_to && byId.get(m.reply_to) ? name(byId.get(m.reply_to)!.user_id) : ''}
              reactions={reactionsByMsg.get(m.id)} me={me} canDelete={m.user_id === me || canModerate(myRole)}
              onReply={() => { setReplyTo(m); inputRef.current?.focus(); }} onDelete={() => onDelete(m.id)}
              onReact={(e) => onReact(m.id, e)} onReport={() => onReport(m)} />
          );
        })}
      </div>

      <div className="h-5 px-4 text-xs text-white/50" aria-live="polite">
        {typing.length > 0 && <span>{typing.slice(0, 2).join(', ')}{typing.length > 2 ? ` and ${typing.length - 2} more` : ''} {typing.length === 1 ? 'is' : 'are'} typing…</span>}
      </div>

      <div className="border-t border-white/5 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <AnimatePresence>
          {replyTo && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="mb-2 flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs">
              <Reply className="h-3.5 w-3.5 text-lilac" />
              <span className="flex-1 truncate">Replying to <b>{name(replyTo.user_id)}</b>: {replyTo.content || 'GIF'}</span>
              <button onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X className="h-3.5 w-3.5" /></button>
            </motion.div>
          )}
          {panel === 'emoji' && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-2 grid grid-cols-8 gap-1 rounded-2xl bg-white/5 p-2">
              {PICKER_EMOJI.map((e) => (
                <button key={e} className="rounded-lg p-1 text-xl hover:bg-white/10" onClick={() => setText((t) => t + e)} aria-label={`Insert ${e}`}>{e}</button>
              ))}
            </motion.div>
          )}
          {panel === 'gif' && <GifPicker onPick={(url) => submit(url)} />}
        </AnimatePresence>
        <div className="flex items-end gap-2">
          <button className={cn('icon-btn h-10 w-10 shrink-0', panel === 'emoji' && 'bg-white/15')} onClick={() => setPanel(panel === 'emoji' ? null : 'emoji')} aria-label="Emoji"><Smile className="h-[18px] w-[18px]" /></button>
          <button className={cn('icon-btn h-10 w-10 shrink-0', panel === 'gif' && 'bg-white/15')} onClick={() => setPanel(panel === 'gif' ? null : 'gif')} aria-label="Send a GIF"><ImagePlay className="h-[18px] w-[18px]" /></button>
          <textarea ref={inputRef} rows={1} value={text} maxLength={1000} placeholder="Message the room"
            className="input max-h-28 min-h-[40px] resize-none py-2" aria-label="Chat message"
            onChange={(e) => { setText(e.target.value); onTyping(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} />
          <button className="btn-violet h-10 w-10 shrink-0 p-0" onClick={() => submit()} disabled={sending || !text.trim()} aria-label="Send">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

const ChatMessage = memo(function ChatMessage({ m, grouped, mine, profile, replied, repliedName, reactions, me, canDelete, onReply, onDelete, onReact, onReport }: {
  m: Message; grouped: boolean; mine: boolean; profile?: Profile; replied?: Message; repliedName: string;
  reactions?: Map<string, string[]>; me: string; canDelete: boolean;
  onReply(): void; onDelete(): void; onReact(e: string): void; onReport(): void;
}) {
  const [picker, setPicker] = useState(false);
  const deleted = !!m.deleted_at;
  return (
    <div className={cn('group relative flex gap-2.5 rounded-xl px-1.5 py-1 hover:bg-white/[0.03]', grouped ? 'mt-0' : 'mt-2')}>
      <div className="w-8 shrink-0">{!grouped && <Avatar name={profile?.display_name || profile?.username} src={profile?.avatar_url} size={32} />}</div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className={cn('truncate text-sm font-semibold', mine ? 'text-beam' : 'text-lilac')}>{profile?.display_name || profile?.username || '…'}</span>
            <time className="text-[11px] text-white/35" dateTime={m.created_at}>{clockTime(m.created_at)}</time>
          </div>
        )}
        {replied && (
          <div className="mt-0.5 flex items-center gap-1.5 border-l-2 border-violet/60 pl-2 text-xs text-white/50">
            <Reply className="h-3 w-3 shrink-0" /><span className="truncate"><b>{repliedName}</b> {replied.deleted_at ? 'deleted message' : replied.content || 'GIF'}</span>
          </div>
        )}
        {deleted ? <p className="text-sm italic text-white/35">Message removed</p> : (
          <>
            {m.content && <p className="whitespace-pre-wrap break-words text-[14.5px] leading-snug text-white/90">{m.content}</p>}
            {m.gif_url && <img src={m.gif_url} alt="GIF" loading="lazy" className="mt-1 max-h-44 rounded-xl" />}
          </>
        )}
        {reactions && reactions.size > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {[...reactions.entries()].map(([emoji, users]) => (
              <button key={emoji} onClick={() => onReact(emoji)}
                className={cn('flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs', users.includes(me) ? 'border-violet/60 bg-violet/20' : 'border-white/10 bg-white/5')}>
                <span>{emoji}</span><span className="text-white/70">{users.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {!deleted && (
        <div className="absolute -top-3 right-1 hidden items-center gap-0.5 rounded-full border border-white/10 bg-coal p-0.5 shadow-lg group-hover:flex group-focus-within:flex">
          <button onClick={() => setPicker((p) => !p)} className="rounded-full p-1.5 hover:bg-white/10" aria-label="React"><SmilePlus className="h-3.5 w-3.5" /></button>
          <button onClick={onReply} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Reply"><Reply className="h-3.5 w-3.5" /></button>
          {!mine && <button onClick={onReport} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Report message"><Flag className="h-3.5 w-3.5" /></button>}
          {canDelete && <button onClick={onDelete} className="rounded-full p-1.5 text-rose-300 hover:bg-white/10" aria-label="Delete message"><Trash2 className="h-3.5 w-3.5" /></button>}
        </div>
      )}
      {picker && (
        <div className="absolute -top-12 right-1 z-10 flex gap-0.5 rounded-full border border-white/10 bg-coal p-1 shadow-xl">
          {QUICK_EMOJI.map((e) => <button key={e} className="rounded-full p-1 text-lg hover:bg-white/10" onClick={() => { onReact(e); setPicker(false); }}>{e}</button>)}
        </div>
      )}
    </div>
  );
});

function GifPicker({ onPick }: { onPick(url: string): void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<{ id: string; url: string; preview: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/gifs?q=${encodeURIComponent(q)}`).then((r) => r.json()).then((d) => {
        if (d.error) setError(d.error); else { setError(''); setItems(d.items); }
      }).catch(() => setError('GIFs couldn’t load.')).finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-2 rounded-2xl bg-white/5 p-2">
      <input className="input py-2 text-sm" placeholder="Search GIPHY" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Search GIFs" />
      <div className="scroll-thin mt-2 grid max-h-52 grid-cols-3 gap-1.5 overflow-y-auto">
        {loading && <Loader2 className="col-span-3 mx-auto my-6 h-5 w-5 animate-spin" />}
        {error && <p className="col-span-3 py-4 text-center text-xs text-white/50">{error}</p>}
        {!loading && items.map((g) => (
          <button key={g.id} onClick={() => onPick(g.url)} className="overflow-hidden rounded-lg"><img src={g.preview} alt={g.title} loading="lazy" className="h-20 w-full object-cover" /></button>
        ))}
      </div>
      <p className="mt-1 text-right text-[10px] text-white/35">Powered by GIPHY</p>
    </motion.div>
  );
}
