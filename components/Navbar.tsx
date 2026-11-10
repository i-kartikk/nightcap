'use client';
import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X, Plus, LogOut, User, Users, MessageCircle, Compass } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Logo } from './Logo';
import { Avatar } from './Avatar';
import { NotificationBell } from './NotificationBell';
import { useAuth } from './AuthProvider';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/browse', label: 'Browse', icon: Compass },
  { href: '/friends', label: 'Friends', icon: Users },
  { href: '/messages', label: 'Messages', icon: MessageCircle },
];

export function Navbar() {
  const { userId, profile } = useAuth();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-ink/70 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href}
              className={cn('rounded-full px-4 py-2 text-sm font-medium transition', path.startsWith(l.href) ? 'bg-white/10 text-white' : 'text-white/65 hover:text-white')}>
              {l.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {userId ? (
            <>
              <Link href="/rooms/new" className="btn-primary hidden sm:inline-flex"><Plus className="h-4 w-4" />Create room</Link>
              <NotificationBell />
              <div className="relative hidden md:block">
                <button onClick={() => setMenu((m) => !m)} className="rounded-full" aria-label="Account menu" aria-expanded={menu}>
                  <Avatar name={profile?.display_name || profile?.username} src={profile?.avatar_url} size={38} />
                </button>
                <AnimatePresence>
                  {menu && (
                    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                      onMouseLeave={() => setMenu(false)}
                      className="glass-strong absolute right-0 top-12 w-56 rounded-2xl p-2 shadow-2xl">
                      <p className="truncate px-3 py-2 text-sm text-white/60">@{profile?.username}</p>
                      <Link href="/profile" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-white/5"><User className="h-4 w-4" />Profile & history</Link>
                      <form action="/auth/signout" method="post">
                        <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-rose-300 hover:bg-white/5"><LogOut className="h-4 w-4" />Sign out</button>
                      </form>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          ) : (
            <>
              <Link href="/login" className="hidden text-sm font-medium text-white/75 hover:text-white sm:block">Sign in</Link>
              <Link href="/login?mode=signup" className="btn-primary">Get started</Link>
            </>
          )}
          <button className="icon-btn md:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-[60] bg-black/60 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-strong absolute right-0 top-0 flex h-full w-[80%] max-w-xs flex-col gap-1 p-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
              <div className="mb-4 flex items-center justify-between">
                {profile ? <div className="flex items-center gap-2"><Avatar name={profile.username} src={profile.avatar_url} size={34} /><span className="font-semibold">@{profile.username}</span></div> : <Logo />}
                <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
              </div>
              {userId && <Link href="/rooms/new" onClick={() => setOpen(false)} className="btn-primary mb-3"><Plus className="h-4 w-4" />Create room</Link>}
              {LINKS.map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-white/5">
                  <l.icon className="h-5 w-5 text-lilac" />{l.label}
                </Link>
              ))}
              {userId ? (
                <>
                  <Link href="/profile" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-white/5"><User className="h-5 w-5 text-lilac" />Profile & history</Link>
                  <form action="/auth/signout" method="post" className="mt-auto">
                    <button className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-rose-300 hover:bg-white/5"><LogOut className="h-5 w-5" />Sign out</button>
                  </form>
                </>
              ) : (
                <Link href="/login" onClick={() => setOpen(false)} className="btn-ghost mt-auto">Sign in</Link>
              )}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
