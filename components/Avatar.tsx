import { cn } from '@/lib/utils';

const HUES = ['#9C6BFF', '#FFB547', '#5BD1C0', '#FF7A9C', '#7AA7FF', '#C9E36B'];

export function Avatar({
  name, src, size = 36, online, className,
}: { name?: string | null; src?: string | null; size?: number; online?: boolean; className?: string }) {
  const label = (name || '?').trim();
  const hue = HUES[[...label].reduce((s, c) => s + c.charCodeAt(0), 0) % HUES.length];
  return (
    <span className={cn('relative inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      {src ? (
        <img src={src} alt="" referrerPolicy="no-referrer" className="h-full w-full rounded-full object-cover ring-1 ring-white/10" />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-full font-display font-bold text-ink"
          style={{ background: hue, fontSize: size * 0.42 }} aria-hidden>
          {label.charAt(0).toUpperCase()}
        </span>
      )}
      {online !== undefined && (
        <span className={cn('absolute bottom-0 right-0 rounded-full ring-2 ring-coal', online ? 'bg-emerald-400' : 'bg-white/25')}
          style={{ width: size * 0.28, height: size * 0.28 }} aria-label={online ? 'Online' : 'Offline'} />
      )}
    </span>
  );
}
