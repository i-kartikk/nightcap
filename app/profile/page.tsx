import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { createClient } from '@/lib/supabase/server';
import { ProfileClient } from './ProfileClient';

export const metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/profile');

  const [{ data: profile }, { data: history }, { data: favorites }, { data: recent }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('watch_history').select('*').order('watched_at', { ascending: false }).limit(30),
    supabase.from('favorites').select('room_id, rooms(id, name, avatar_url, source_title)').order('created_at', { ascending: false }),
    supabase.from('room_members').select('last_active, role, rooms(id, name, avatar_url, source_title)').eq('user_id', user.id).order('last_active', { ascending: false }).limit(12),
  ]);

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <Suspense>
          <ProfileClient
            profile={profile}
            email={user.email ?? ''}
            history={history ?? []}
            favorites={(favorites ?? []) as never}
            recent={(recent ?? []) as never}
          />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
