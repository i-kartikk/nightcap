import Link from 'next/link';

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="group inline-flex items-center gap-2.5" aria-label="Nightcap home">
      <svg viewBox="0 0 64 64" className="h-8 w-8" aria-hidden>
        <rect x="6" y="12" width="52" height="34" rx="9" fill="none" stroke="#9C6BFF" strokeWidth="5" />
        <path d="M38 20a10 10 0 1 0 8 16 11 11 0 0 1-8-16Z" fill="#FFB547" />
        <path d="M22 54h20" stroke="#9C6BFF" strokeWidth="5" strokeLinecap="round" />
      </svg>
      {!compact && <span className="font-display text-xl font-extrabold tracking-tight">Nightcap</span>}
    </Link>
  );
}
