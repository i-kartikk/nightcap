export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export function GET() {
  return new Response(JSON.stringify({ now: Date.now() }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
