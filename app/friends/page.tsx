import { Navbar } from '@/components/Navbar';
import { FriendsClient } from './FriendsClient';

export const metadata = { title: 'Friends' };

export default function FriendsPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6"><FriendsClient /></main>
    </>
  );
}
