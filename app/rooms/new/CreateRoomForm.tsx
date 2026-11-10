'use client';
import { useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ImagePlus, Loader2, Lock, Globe2 } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { uploadImage } from '@/lib/upload';
import { parseSource } from '@/lib/video';
import { serverNow } from '@/lib/clock';
import { errorMessage, cn } from '@/lib/utils';
import { useAuth } from '@/components/AuthProvider';

export function CreateRoomForm() {
  const supabase = getSupabase();
  const router = useRouter();
  const params = useSearchParams();
  const { profile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(profile ? `${profile.display_name || profile.username}’s room` : '');
  const [isPublic, setIsPublic] = useState(false);
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [video, setVideo] = useState(params.get('v') ?? '');
  const videoTitle = params.get('title') ?? null;
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function onAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setUploading(true); setError('');
    try { setAvatar(await uploadImage(f, 'rooms')); } catch (err) { setError(errorMessage(err)); }
    finally { setUploading(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    let parsed: ReturnType<typeof parseSource> | null = null;
    if (video.trim()) {
      parsed = parseSource(video);
      if ('error' in parsed) { setError(parsed.error); return; }
    }
    setBusy(true);
    try {
      const { data: id, error } = await supabase.rpc('create_room', {
        p_name: name, p_is_public: isPublic, p_password: password || null, p_avatar_url: avatar,
      });
      if (error) throw error;
      if (parsed && !('error' in parsed)) {
        await supabase.rpc('update_playback', {
          p_room: id, p_is_playing: false, p_position: 0, p_rate: 1, p_sent_at: new Date(serverNow()).toISOString(),
          p_source_type: parsed.type, p_source_url: parsed.url, p_source_title: videoTitle,
        });
      }
      router.push(`/room/${id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-6 p-6 sm:p-8">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Create a room</h1>
        <p className="mt-1 text-sm text-white/60">You’ll be the host. You can change all of this later.</p>
      </div>

      <div className="flex items-center gap-4">
        <button type="button" onClick={() => fileRef.current?.click()}
          className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/20 bg-white/[0.03] hover:border-beam/60"
          aria-label="Upload room picture">
          {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6 text-white/50" />}
        </button>
        <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" onChange={onAvatar} />
        <div className="flex-1">
          <label className="label" htmlFor="name">Room name</label>
          <input id="name" className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Friday movie night" required />
        </div>
      </div>

      <fieldset>
        <legend className="label">Who can find it</legend>
        <div className="grid grid-cols-2 gap-3">
          {[
            { v: false, icon: Lock, title: 'Private', text: 'Only people with the link' },
            { v: true, icon: Globe2, title: 'Public', text: 'Listed on Browse' },
          ].map((o) => (
            <button type="button" key={o.title} onClick={() => setIsPublic(o.v)} aria-pressed={isPublic === o.v}
              className={cn('rounded-2xl border p-4 text-left transition', isPublic === o.v ? 'border-beam/70 bg-beam/10' : 'border-white/10 hover:border-white/25')}>
              <o.icon className="h-5 w-5 text-beam" />
              <span className="mt-2 block font-semibold">{o.title}</span>
              <span className="text-xs text-white/55">{o.text}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label className="label" htmlFor="pw">Room password <span className="text-white/40">(optional)</span></label>
        <input id="pw" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave empty for no password" autoComplete="new-password" />
      </div>

      <div>
        <label className="label" htmlFor="video">Start with a video <span className="text-white/40">(optional)</span></label>
        <input id="video" className="input" value={video} onChange={(e) => setVideo(e.target.value)} placeholder="YouTube link, .mp4, .m3u8 or website" />
      </div>

      {error && <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300" role="alert">{error}</p>}
      <button className="btn-primary w-full py-3 text-base" disabled={busy || uploading}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}Create room
      </button>
    </form>
  );
}
