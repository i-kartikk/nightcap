export default function Loading() {
  return (
    <div className="flex min-h-dvh flex-col gap-4 p-4 lg:grid lg:grid-cols-[1fr_380px]">
      <div className="aspect-video w-full animate-pulse rounded-3xl bg-white/[0.04]" />
      <div className="hidden animate-pulse rounded-3xl bg-white/[0.04] lg:block" />
    </div>
  );
}
