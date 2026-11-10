'use client';
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en"><body style={{ background: '#07060C', color: '#fff', fontFamily: 'system-ui', display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}><h1>Nightcap couldn’t load</h1><button onClick={reset} style={{ marginTop: 16, padding: '10px 20px', borderRadius: 999 }}>Reload</button></div>
    </body></html>
  );
}
