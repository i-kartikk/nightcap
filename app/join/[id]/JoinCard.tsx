'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Lock, Users } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';

interface Preview { id: string; name: string; avatar_url: string | null; has_password: boolean; member_count: number; owner_username: string; source_title: string | null }

export function JoinCard({ room }: { room: Preview }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = await getSupabase().rpc('join_room', { p_room: room.id, p_password: password || null });
    if (error) { setError(error.message); setBusy(false); return; }
    router.replace(`/room/${room.id}`);
  }

  return (
    <form onSubmit={join} className="card p-8 text-center">
      {room.avatar_url
        ? <img src={room.avatar_url} alt="" className="mx-auto h-20 w-20 rounded-3xl object-cover" />
        : <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-plum font-display text-3xl font-bold text-lilac">{room.name.charAt(0).toUpperCase()}</span>}
      <p className="mt-5 text-sm text-white/55">@{room.owner_username} invited you to</p>
      <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">{room.name}</h1>
      <div className="mt-3 flex justify-center gap-2">
        <span className="chip"><Users className="h-3.5 w-3.5" />{room.member_count} {room.member_count === 1 ? 'member' : 'members'}</span>
        {room.has_password && <span className="chip"><Lock className="h-3.5 w-3.5" />Password</span>}
      </div>
      {room.source_title && <p className="mt-3 truncate text-sm text-white/60">Now showing: {room.source_title}</p>}
      {room.has_password && (
        <input type="password" className="input mt-6 text-center" placeholder="Room password" value={password}
          onChange={(e) => setPassword(e.target.value)} autoFocus required aria-label="Room password" />
      )}
      {error && <p className="mt-3 text-sm text-rose-300" role="alert">{error}</p>}
      <button className="btn-primary mt-6 w-full py-3 text-base" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Join room</button>
    </form>
  );
}
