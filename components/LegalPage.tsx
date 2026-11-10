import { Navbar } from './Navbar';
import { Footer } from './Footer';

export function LegalPage({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">{title}</h1>
        {updated && <p className="mt-2 text-sm text-white/45">Last updated {updated}</p>}
        <div className="mt-8 space-y-5 leading-relaxed text-white/75 [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white">{children}</div>
      </main>
      <Footer />
    </>
  );
}
