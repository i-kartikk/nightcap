import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-display text-7xl font-extrabold text-white/10">404</p>
      <h1 className="font-display text-3xl font-bold">Nothing showing here</h1>
      <Link href="/" className="btn-primary">Back home</Link>
    </main>
  );
}
