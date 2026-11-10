import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Manrope } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';
import { ToastProvider } from '@/components/Toast';
import { createClient } from '@/lib/supabase/server';

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display', weight: ['500', '700', '800'] });
const body = Manrope({ subsets: ['latin'], variable: '--font-body' });

export const metadata: Metadata = {
  title: { default: 'Nightcap · Watch together', template: '%s · Nightcap' },
  description: 'Create a room, invite friends, and watch YouTube and video links in perfect sync with chat and video calls.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  openGraph: { title: 'Nightcap', description: 'Your movies. Your friends. One room.' },
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#07060C',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('id, username, display_name, avatar_url').eq('id', user.id).single()
    : { data: null };

  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="font-sans">
        <ToastProvider>
          <AuthProvider initialUserId={user?.id ?? null} initialProfile={profile ?? null}>
            {children}
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
