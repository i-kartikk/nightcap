import { Suspense } from 'react';
import { Navbar } from '@/components/Navbar';
import { CreateRoomForm } from './CreateRoomForm';

export const metadata = { title: 'Create a room' };

export default function NewRoomPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-xl px-4 py-10 sm:py-16">
        <Suspense><CreateRoomForm /></Suspense>
      </main>
    </>
  );
}
