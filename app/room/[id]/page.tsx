import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { RoomClient } from '@/components/room/RoomClient';
import type { Member, Room } from '@/lib/types';

export async function generateMetadata({ params }: { params: { id: string } }) {
  return { title: `Room ${params.id.toUpperCase()}` };
}

export default async function RoomPage({ params }: { params: { id: string } }) {
  const id = params.id.toUpperCase();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/room/${id}`);

  const { data: membership } = await supabase.from('room_members').select('role').eq('room_id', id).eq('user_id', user.id).maybeSingle();
  if (!membership) redirect(`/join/${id}`);

  const [{ data: room }, { data: members }, { data: fav }] = await Promise.all([
    supabase.from('rooms').select('*').eq('id', id).single(),
    supabase.from('room_members').select('*, profile:profiles(id, username, display_name, avatar_url)').eq('room_id', id),
    supabase.from('favorites').select('room_id').eq('room_id', id).eq('user_id', user.id).maybeSingle(),
  ]);
  if (!room) redirect('/');

  return (
    <RoomClient
      initialRoom={room as Room}
      initialMembers={(members ?? []) as Member[]}
      me={user.id}
      initialFavorite={!!fav}
    />
  );
}
