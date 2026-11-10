'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Check, Share2, Loader2, ImagePlus, Send } from 'lucide-react';
import { Modal } from '../Modal';
import { Avatar } from '../Avatar';
import { useToast } from '../Toast';
import { getSupabase } from '@/lib/supabase/client';
import { uploadImage } from '@/lib/upload';
import { inviteLink, errorMessage, cn } from '@/lib/utils';
import type { Profile, Room } from '@/lib/types';

export function InviteModal({ open, onClose, room, me }: { open: boolean; onClose(): void; room: Room; me: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const link = inviteLink(room.id);
  const text = `Join me in “${room.name}” on Nightcap: ${link}`;

  useEffect(() => {
    if (!open) return;
    const supabase = getSupabase();
    supabase.from('friendships')
      .select('requester, addressee, a:profiles!friendships_requester_fkey(id, username, display_name, avatar_url), b:profiles!friendships_addressee_fkey(id, username, display_name, avatar_url)')
      .eq('status', 'accepted')
      .then(({ data }) => {
        const rows = (data ?? []) as unknown as { requester: string; a: Profile; b: Profile }[];
        setFriends(rows.map((r) => (r.requester === me ? r.b : r.a)));
      });
  }, [open, me]);

  async function copy(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  async function invite(id: string) {
    const { error } = await getSupabase().rpc('invite_friend', { p_room: room.id, p_friend: id });
    if (error) toast(error.message, 'error');
    else { setInvited((s) => new Set(s).add(id)); toast('Invite sent', 'success'); }
  }

  const share = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(text)}`, color: '#25D366' },
    { label: 'Telegram', href: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(`Join “${room.name}” on Nightcap`)}`, color: '#2AABEE' },
    { label: 'Email', href: `mailto:?subject=${encodeURIComponent(`Watch with me: ${room.name}`)}&body=${encodeURIComponent(text)}`, color: '#9C6BFF' },
    { label: 'SMS', href: `sms:?&body=${encodeURIComponent(text)}`, color: '#FFB547' },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Invite friends">
      <label className="label">Invite link</label>
      <div className="flex gap-2">
        <input readOnly value={link} className="input text-sm" onFocus={(e) => e.target.select()} aria-label="Invite link" />
        <button className="btn-violet shrink-0" onClick={() => copy(link, 'link')}>{copied === 'link' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}Copy</button>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
        <span className="text-sm text-white/60">Room ID</span>
        <button onClick={() => copy(room.id, 'id')} className="flex items-center gap-2 font-display text-lg font-bold tracking-[0.2em]">
          {room.id}{copied === 'id' ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4 text-white/50" />}
        </button>
      </div>
      {room.has_password && <p className="mt-2 text-xs text-white/50">This room has a password. Share it separately.</p>}

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {share.map((s) => (
          <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
            className="rounded-xl border border-white/10 px-3 py-2.5 text-center text-sm font-medium hover:bg-white/5" style={{ color: s.color }}>{s.label}</a>
        ))}
      </div>
      {typeof navigator !== 'undefined' && 'share' in navigator && (
        <button className="btn-ghost mt-2 w-full" onClick={() => navigator.share({ title: room.name, text: `Join “${room.name}” on Nightcap`, url: link }).catch(() => {})}>
          <Share2 className="h-4 w-4" />More share options
        </button>
      )}

      <h3 className="mt-6 font-display font-bold">Your friends</h3>
      <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto scroll-thin">
        {friends.length === 0 && <li className="text-sm text-white/50">Add friends from the Friends page to invite them here directly.</li>}
        {friends.map((f) => (
          <li key={f.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-white/5">
            <Avatar name={f.display_name || f.username} src={f.avatar_url} size={32} />
            <span className="flex-1 truncate text-sm">{f.display_name || f.username} <span className="text-white/40">@{f.username}</span></span>
            <button className="btn-ghost px-3 py-1.5 text-xs" disabled={invited.has(f.id)} onClick={() => invite(f.id)}>
              {invited.has(f.id) ? 'Invited' : <><Send className="h-3.5 w-3.5" />Invite</>}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function RoomSettingsModal({ open, onClose, room, isOwner, onSaved }: {
  open: boolean; onClose(): void; room: Room; isOwner: boolean; onSaved(): void;
}) {
  const toast = useToast();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(room.name);
  const [isPublic, setIsPublic] = useState(room.is_public);
  const [everyone, setEveryone] = useState(room.everyone_can_control);
  const [avatar, setAvatar] = useState(room.avatar_url);
  const [password, setPassword] = useState('');
  const [clearPw, setClearPw] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setName(room.name); setIsPublic(room.is_public); setEveryone(room.everyone_can_control); setAvatar(room.avatar_url); setPassword(''); setClearPw(false); }
  }, [open, room]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password && password.length < 4) { toast('Room passwords need at least 4 characters.', 'error'); return; }
    setBusy(true);
    const { error } = await getSupabase().rpc('update_room_settings', {
      p_room: room.id, p_name: name, p_is_public: isPublic, p_everyone_can_control: everyone,
      p_avatar_url: avatar, p_password: password || null, p_clear_password: clearPw,
    });
    setBusy(false);
    if (error) toast(error.message, 'error'); else { toast('Room settings saved', 'success'); onSaved(); onClose(); }
  }

  async function del() {
    if (!confirm('Delete this room for everyone? Chat history will be lost.')) return;
    const { error } = await getSupabase().from('rooms').delete().eq('id', room.id);
    if (error) toast(error.message, 'error'); else router.replace('/');
  }

  return (
    <Modal open={open} onClose={onClose} title="Room settings">
      <form onSubmit={save} className="space-y-4">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => fileRef.current?.click()} className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/20" aria-label="Change room picture">
            {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-5 w-5 text-white/50" />}
          </button>
          <input ref={fileRef} type="file" hidden accept="image/*" onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            try { setAvatar(await uploadImage(f, 'rooms')); } catch (err) { toast(errorMessage(err), 'error'); }
          }} />
          <div className="flex-1"><label className="label" htmlFor="rn">Room name</label><input id="rn" className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></div>
        </div>
        <Toggle checked={isPublic} onChange={setIsPublic} label="Public room" hint="Listed on Browse for anyone to find" />
        <Toggle checked={everyone} onChange={setEveryone} label="Everyone can control playback" hint="Otherwise only the host and co-hosts can" />
        <div>
          <label className="label" htmlFor="rp">{room.has_password ? 'Change password' : 'Add a password'}</label>
          <input id="rp" type="password" className="input" value={password} onChange={(e) => { setPassword(e.target.value); setClearPw(false); }} placeholder="At least 4 characters" autoComplete="new-password" />
          {room.has_password && (
            <label className="mt-2 flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={clearPw} onChange={(e) => { setClearPw(e.target.checked); setPassword(''); }} />Remove password</label>
          )}
        </div>
        <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save settings</button>
        {isOwner && <button type="button" onClick={del} className="btn-danger w-full">Delete room</button>}
      </form>
    </Modal>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange(v: boolean): void; label: string; hint: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 px-4 py-3 text-left">
      <span><span className="block text-sm font-medium">{label}</span><span className="text-xs text-white/50">{hint}</span></span>
      <span className={cn('relative h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-violet' : 'bg-white/15')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition', checked ? 'left-[22px]' : 'left-0.5')} />
      </span>
    </button>
  );
}

export function ReportModal({ target, onClose, roomId }: {
  target: { userId: string; messageId?: string; name: string } | null; onClose(): void; roomId: string;
}) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('reports').insert({
      reporter: user!.id, reported_user: target.userId, room_id: roomId, message_id: target.messageId ?? null, reason: reason.trim(),
    });
    setBusy(false);
    if (error) toast(error.message, 'error'); else { toast('Report sent. Thanks for keeping rooms safe.', 'success'); setReason(''); onClose(); }
  }
  return (
    <Modal open={!!target} onClose={onClose} title={`Report ${target?.name ?? ''}`}>
      <form onSubmit={submit} className="space-y-3">
        <textarea className="input min-h-[110px]" required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What happened?" aria-label="Reason" />
        <button className="btn-danger w-full" disabled={busy || reason.trim().length < 3}>Send report</button>
      </form>
    </Modal>
  );
}
