'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Mail } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { safeNext, errorMessage } from '@/lib/utils';

type Mode = 'signin' | 'signup' | 'reset';

export function AuthForm() {
  const params = useSearchParams();
  const router = useRouter();
  const supabase = getSupabase();
  const next = safeNext(params.get('next'));
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get('error') ?? '');
  const [notice, setNotice] = useState('');

  const callback = (n: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(n)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setNotice(''); setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next); router.refresh();
      } else if (mode === 'signup') {
        if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) throw new Error('Usernames use 3–24 letters, numbers or underscores.');
        if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { data: { username: username.toLowerCase() }, emailRedirectTo: callback(next) },
        });
        if (error) throw error;
        if (data.session) { router.replace(next); router.refresh(); }
        else setNotice('Check your inbox and tap the confirmation link to finish creating your account.');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callback('/profile?reset=1') });
        if (error) throw error;
        setNotice('If an account exists for that email, a reset link is on its way.');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callback(next) } });
    if (error) setError(error.message);
  }

  return (
    <div className="card p-6 sm:p-8">
      <h1 className="font-display text-3xl font-bold tracking-tight">
        {mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset your password'}
      </h1>
      <p className="mt-1.5 text-sm text-white/60">
        {mode === 'signin' ? 'Sign in to create and join watch rooms.' : mode === 'signup' ? 'It takes less than a minute.' : 'We’ll email you a link to set a new password.'}
      </p>

      {mode !== 'reset' && (
        <>
          <button onClick={google} className="btn-ghost mt-6 w-full py-3">
            <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
            Continue with Google
          </button>
          <div className="my-5 flex items-center gap-3 text-xs text-white/40"><span className="h-px flex-1 bg-white/10" />or with email<span className="h-px flex-1 bg-white/10" /></div>
        </>
      )}

      <form onSubmit={submit} className={mode === 'reset' ? 'mt-6 space-y-4' : 'space-y-4'}>
        {mode === 'signup' && (
          <div>
            <label className="label" htmlFor="username">Username</label>
            <input id="username" className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="movie_buff" autoComplete="username" required />
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
        </div>
        {mode !== 'reset' && (
          <div>
            <div className="flex items-center justify-between">
              <label className="label" htmlFor="password">Password</label>
              {mode === 'signin' && <button type="button" onClick={() => setMode('reset')} className="mb-1.5 text-xs text-lilac hover:underline">Forgot password?</button>}
            </div>
            <input id="password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 8 : 1} />
          </div>
        )}
        {error && <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300" role="alert">{error}</p>}
        {notice && <p className="flex gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300"><Mail className="mt-0.5 h-4 w-4 shrink-0" />{notice}</p>}
        <button className="btn-primary w-full py-3" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-white/60">
        {mode === 'signin' ? <>New here? <button onClick={() => setMode('signup')} className="font-semibold text-beam hover:underline">Create an account</button></>
          : <>Already have an account? <button onClick={() => setMode('signin')} className="font-semibold text-beam hover:underline">Sign in</button></>}
      </p>
    </div>
  );
}
