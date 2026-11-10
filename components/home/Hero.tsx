'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { motion, MotionConfig } from 'framer-motion';
import { Plus, LogIn, Compass, Play } from 'lucide-react';
import { useAuth } from '../AuthProvider';

const LINES = ['Your Movies.', 'Your Friends.', 'One Room.'];

function extractRoomId(input: string) {
  const s = input.trim();
  const m = s.match(/\/join\/([A-Za-z0-9]{8})/) || s.match(/\/room\/([A-Za-z0-9]{8})/) || s.match(/^([A-Za-z0-9]{8})$/);
  return m ? m[1].toUpperCase() : null;
}

export function Hero() {
  const { userId } = useAuth();
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');

  const create = () => router.push(userId ? '/rooms/new' : '/login?next=/rooms/new');
  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractRoomId(code);
    if (!id) { setErr('Enter the 8-character room ID or paste the invite link.'); return; }
    router.push(`/join/${id}`);
  };

  return (
    <MotionConfig reducedMotion="user">
      <section className="relative isolate overflow-hidden">
        {/* projector beam */}
        <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 -z-10 h-[900px] w-[900px] opacity-60"
          style={{ background: 'conic-gradient(from 120deg at 20% 20%, transparent 0deg, rgba(255,181,71,.22) 18deg, rgba(156,107,255,.12) 40deg, transparent 62deg)', filter: 'blur(30px)' }} />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 md:pt-20 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <h1 className="font-display text-[clamp(2.9rem,8.5vw,6.2rem)] font-extrabold leading-[0.92] tracking-[-0.035em]">
              {LINES.map((l, i) => (
                <motion.span key={l} className="block"
                  initial={{ opacity: 0, y: 28, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ delay: 0.12 + i * 0.16, duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
                  style={i === 2 ? { backgroundImage: 'linear-gradient(100deg,#FFD08A,#FFB547 40%,#C9A2FF 90%)', WebkitBackgroundClip: 'text', color: 'transparent' } : undefined}>
                  {l}
                </motion.span>
              ))}
            </h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
              className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
              Start a room, send the link, and everyone’s player stays on the same second. When the host presses
              pause, the whole room pauses. Chat, react and talk on camera without leaving the movie.
            </motion.p>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.85 }} className="mt-8 flex flex-wrap gap-3">
              <button onClick={create} className="btn-primary px-6 py-3 text-base"><Plus className="h-5 w-5" />Create Room</button>
              <button onClick={() => setJoining((j) => !j)} className="btn-ghost px-6 py-3 text-base" aria-expanded={joining}><LogIn className="h-5 w-5" />Join Room</button>
              <Link href="/browse" className="btn-ghost px-6 py-3 text-base"><Compass className="h-5 w-5" />Browse Movies</Link>
            </motion.div>

            {joining && (
              <motion.form onSubmit={join} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-4 max-w-md">
                <div className="flex gap-2">
                  <input autoFocus value={code} onChange={(e) => { setCode(e.target.value); setErr(''); }}
                    placeholder="Room ID or invite link" className="input" aria-label="Room ID or invite link" />
                  <button className="btn-violet shrink-0">Join</button>
                </div>
                {err && <p className="mt-2 text-sm text-rose-300">{err}</p>}
              </motion.form>
            )}
          </div>

          {/* Room preview */}
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35, duration: 0.8 }}
            className="card relative p-3 sm:p-4" aria-hidden>
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-gradient-to-br from-[#2b1846] via-[#14101e] to-[#3a2108]">
              <div className="absolute inset-0" style={{ background: 'radial-gradient(60% 70% at 70% 40%, rgba(255,181,71,.35), transparent 70%)' }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 backdrop-blur"><Play className="ml-1 h-7 w-7 fill-white" /></span>
              </div>
              <div className="absolute inset-x-4 bottom-4">
                <div className="h-1.5 overflow-hidden rounded-full bg-white/20"><div className="h-full w-[42%] rounded-full bg-beam" /></div>
                <div className="mt-2 flex justify-between text-[11px] text-white/70"><span>48:12</span><span>In sync · 4 watching</span></div>
              </div>
              <span className="absolute right-[18%] top-[30%] animate-floatUp text-3xl [animation-iteration-count:infinite]">😂</span>
              <span className="absolute right-[32%] top-[40%] animate-floatUp text-2xl [animation-delay:1.2s] [animation-iteration-count:infinite]">❤️</span>
            </div>
            <div className="mt-3 grid grid-cols-[auto_1fr] gap-3">
              <div className="flex -space-x-2 self-start pt-1">
                {['#9C6BFF', '#FFB547', '#5BD1C0', '#FF7A9C'].map((c, i) => (
                  <span key={c} className="h-9 w-9 rounded-full ring-2 ring-coal" style={{ background: c }}>
                    <span className="flex h-full items-center justify-center font-display text-sm font-bold text-ink">{'AMRJ'[i]}</span>
                  </span>
                ))}
              </div>
              <div className="space-y-1.5 text-[13px]">
                <p className="w-fit rounded-2xl rounded-tl-sm bg-white/[0.07] px-3 py-1.5"><b className="text-lilac">Maya</b> wait rewind that 😭</p>
                <p className="ml-auto w-fit rounded-2xl rounded-tr-sm bg-violet/30 px-3 py-1.5"><b className="text-beam">Arjun</b> rewinding for everyone</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </MotionConfig>
  );
}
