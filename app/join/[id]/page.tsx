import { redirect } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { createClient } from '@/lib/supabase/server';
import { JoinCard } from './JoinCard';

export const metadata = { title: 'Join room' };

export default async function JoinPage({ params }: { params: { id: string } }) {
  const id = params.id.toUpperCase();
  const supabase = createClient();
  const { data } = await supabase.rpc('room_preview', { p_room: id });
  const room = Array.isArray(data) ? data[0] : null;
  if (room?.is_member) redirect(`/room/${room.id}`);

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-md px-4 py-12 sm:py-20">
        {room ? <JoinCard room={room} /> : (
          <div className="card p-8 text-center">
            <h1 className="font-display text-2xl font-bold">Room not found</h1>
            <p className="mt-2 text-white/60">The room ID <b>{id}</b> doesn’t exist, or the room was closed. Ask your friend for a fresh link.</p>
            <a href="/" className="btn-ghost mt-6">Back home</a>
          </div>
        )}
      </main>
    </>
  );
}
