'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import type { Profile } from '@/lib/types';

interface AuthCtx {
  userId: string | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
}
const Ctx = createContext<AuthCtx>({ userId: null, profile: null, refreshProfile: async () => {} });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({
  children, initialUserId, initialProfile,
}: { children: React.ReactNode; initialUserId: string | null; initialProfile: Profile | null }) {
  const [userId, setUserId] = useState(initialUserId);
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const supabase = getSupabase();

  const refreshProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setProfile(null); return; }
    const { data } = await supabase.from('profiles').select('id, username, display_name, avatar_url, bio').eq('id', user.id).single();
    setProfile(data);
  }, [supabase]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setUserId(session?.user.id ?? null);
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') refreshProfile();
      if (event === 'SIGNED_OUT') setProfile(null);
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase, refreshProfile]);

  // Online-status heartbeat.
  useEffect(() => {
    if (!userId) return;
    const beat = () => { if (document.visibilityState === 'visible') supabase.rpc('touch_presence').then(() => {}); };
    beat();
    const t = setInterval(beat, 60_000);
    return () => clearInterval(t);
  }, [userId, supabase]);

  return <Ctx.Provider value={{ userId, profile, refreshProfile }}>{children}</Ctx.Provider>;
}
