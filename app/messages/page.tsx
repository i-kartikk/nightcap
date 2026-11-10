import { Suspense } from 'react';
import { Navbar } from '@/components/Navbar';
import { MessagesClient } from './MessagesClient';

export const metadata = { title: 'Messages' };

export default function MessagesPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-5xl px-0 sm:px-6 sm:py-6"><Suspense><MessagesClient /></Suspense></main>
    </>
  );
}
