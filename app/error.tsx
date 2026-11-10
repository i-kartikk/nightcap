'use client';
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-display text-3xl font-bold">This page hit a problem</h1>
      <p className="max-w-md text-white/60">{error.message || 'An unexpected error happened.'} Try again, or go back home.</p>
      <div className="flex gap-2"><button onClick={reset} className="btn-primary">Try again</button><a href="/" className="btn-ghost">Home</a></div>
    </main>
  );
}
