'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Camera, Loader2, Star, Trash2, History, DoorOpen } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/components/AuthProvider';
import { getSupabase } from '@/lib/supabase/client';
import { uploadImage } from '@/lib/upload';
import { errorMessage, timeAgo } from '@/lib/utils';
import { sourceLabel } from '@/lib/video';
import type { Profile, SourceType } from '@/lib/types';

interface RoomLite { id: string; name: string; avatar_url: string | null; source_title: string | null }
interface HistoryRow { id: string; room_id: string | null; source_type: SourceType; source_url: string; title: string | null; watched_at: string }

export function ProfileClient({ profile, email, history: initialHistory, favorites: initialFav, recent }: {
  profile: Profile; email: string; history: HistoryRow[];
  favorites: { room_id: string; rooms: RoomLite | null }[];
  recent: { last_active: string; role: string; rooms: RoomLite | null }[];
}) {
  const supabase = getSupabase();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const { refreshProfile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ username: profile.username, display_name: profile.display_name ?? '', bio: profile.bio ?? '', avatar_url: profile.avatar_url });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pw, setPw] = useState('');
  const [history, setHistory] = useState(initialHistory);
  const [favorites, setFavorites] = useState(initialFav);
  const resetting = params.get('reset') === '1';

  async function onAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setUploading(true);
    try {
      const url = await uploadImage(f, 'profile');
      setForm((s) => ({ ...s, avatar_url: url }));
      const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id);
      if (error) throw error;
      await refreshProfile();
      toast('Profile picture updated', 'success');
    } catch (err) { toast(errorMessage(err), 'error'); }
    finally { setUploading(false); e.target.value = ''; }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const username = form.username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) { toast('Usernames use 3–24 lowercase letters, numbers or underscores.', 'error'); return; }
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      username, display_name: form.display_name.trim().slice(0, 40) || null, bio: form.bio.trim().slice(0, 200) || null,
    }).eq('id', profile.id);
    setSaving(false);
    if (error) toast(error.code === '23505' ? 'That username is taken.' : error.message, 'error');
    else { toast('Profile saved', 'success'); await refreshProfile(); router.refresh(); }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { toast('Use at least 8 characters.', 'error'); return; }
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) toast(error.message, 'error'); else { toast('Password updated', 'success'); setPw(''); }
  }

  async function removeHistory(id: string) {
    setHistory((h) => h.filter((x) => x.id !== id));
    await supabase.from('watch_history').delete().eq('id', id);
  }
  async function clearHistory() {
    setHistory([]);
    await supabase.from('watch_history').delete().eq('user_id', profile.id);
  }
  async function unfavorite(roomId: string) {
    setFavorites((f) => f.filter((x) => x.room_id !== roomId));
    await supabase.from('favorites').delete().eq('room_id', roomId).eq('user_id', profile.id);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <section className="card p-6">
        <h1 className="font-display text-2xl font-bold">Your profile</h1>
        <div className="mt-5 flex items-center gap-4">
          <div className="relative">
            <Avatar name={form.display_name || form.username} src={form.avatar_url} size={84} />
            <button onClick={() => fileRef.current?.click()} className="icon-btn absolute -bottom-1 -right-1 h-9 w-9 bg-coal" aria-label="Change profile picture">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={onAvatar} />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold">{form.display_name || form.username}</p>
            <p className="truncate text-sm text-white/50">{email}</p>
          </div>
        </div>
        <form onSubmit={save} className="mt-6 space-y-4">
          <div><label className="label" htmlFor="u">Username</label><input id="u" className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
          <div><label className="label" htmlFor="d">Display name</label><input id="d" className="input" maxLength={40} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></div>
          <div><label className="label" htmlFor="b">Bio</label><textarea id="b" className="input min-h-[80px]" maxLength={200} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></div>
          <button className="btn-primary" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save profile</button>
        </form>

        <form onSubmit={changePassword} className={`mt-8 rounded-2xl border p-4 ${resetting ? 'border-beam/50 bg-beam/5' : 'border-white/10'}`}>
          <label className="label" htmlFor="pw">{resetting ? 'Set your new password' : 'Change password'}</label>
          <div className="flex gap-2">
            <input id="pw" type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" />
            <button className="btn-ghost shrink-0">Update</button>
          </div>
        </form>
      </section>

      <div className="space-y-6">
        <section className="card p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold"><DoorOpen className="h-5 w-5 text-beam" />Recently joined rooms</h2>
          <ul className="mt-3 space-y-1">
            {recent.filter((r) => r.rooms).length === 0 && <li className="text-sm text-white/50">Rooms you join show up here.</li>}
            {recent.filter((r) => r.rooms).map((r) => (
              <li key={r.rooms!.id}>
                <Link href={`/room/${r.rooms!.id}`} className="flex items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-white/5">
                  <span className="truncate">{r.rooms!.name}</span><span className="text-xs text-white/40">{timeAgo(r.last_active)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Star className="h-5 w-5 text-beam" />Favorite rooms</h2>
          <ul className="mt-3 space-y-1">
            {favorites.length === 0 && <li className="text-sm text-white/50">Tap the star inside a room to save it here.</li>}
            {favorites.filter((f) => f.rooms).map((f) => (
              <li key={f.room_id} className="flex items-center gap-2">
                <Link href={`/room/${f.room_id}`} className="flex-1 truncate rounded-xl px-3 py-2 text-sm hover:bg-white/5">{f.rooms!.name}</Link>
                <button onClick={() => unfavorite(f.room_id)} className="icon-btn h-8 w-8" aria-label="Remove from favorites"><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-6">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold"><History className="h-5 w-5 text-beam" />Watch history</h2>
            {history.length > 0 && <button onClick={clearHistory} className="text-xs text-rose-300 hover:underline">Clear all</button>}
          </div>
          <ul className="mt-3 space-y-1">
            {history.length === 0 && <li className="text-sm text-white/50">Videos you watch in rooms appear here.</li>}
            {history.map((h) => (
              <li key={h.id} className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-white/5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{h.title || h.source_url}</span>
                  <span className="text-xs text-white/40">{sourceLabel(h.source_type)} · {timeAgo(h.watched_at)}</span>
                </span>
                <button onClick={() => removeHistory(h.id)} className="icon-btn h-8 w-8" aria-label="Remove from history"><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
