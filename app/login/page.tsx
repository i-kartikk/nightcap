import { Suspense } from 'react';
import { AuthForm } from './AuthForm';
import { Logo } from '@/components/Logo';

export const metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <Suspense><AuthForm /></Suspense>
      </div>
    </main>
  );
}
