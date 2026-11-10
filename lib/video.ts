import type { SourceType } from './types';

export interface ParsedSource {
  type: Exclude<SourceType, 'none'>;
  url: string;
  youtubeId?: string;
}

const YT_ID = /^[a-zA-Z0-9_-]{11}$/;
const YT_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'];

export function parseYouTubeId(input: string): string | null {
  const raw = input.trim();
  if (YT_ID.test(raw)) return raw;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    return YT_ID.test(id) ? id : null;
  }
  if (!YT_HOSTS.includes(host)) return null;
  const v = u.searchParams.get('v');
  if (v && YT_ID.test(v)) return v;
  const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function youtubeUrl(id: string) {
  return `https://www.youtube.com/watch?v=${id}`;
}

export function isNetflix(u: URL) {
  return /(^|\.)netflix\.com$/i.test(u.hostname);
}

/**
 * Classify a pasted link. Embeddable-or-not for generic pages is checked
 * separately by /api/embed-check (the browser cannot read X-Frame-Options).
 */
export function parseSource(input: string): ParsedSource | { error: string } {
  const raw = input.trim();
  if (!raw) return { error: 'Paste a link first.' };
  const ytId = parseYouTubeId(raw);
  if (ytId) return { type: 'youtube', url: youtubeUrl(ytId), youtubeId: ytId };

  let u: URL;
  try { u = new URL(raw); } catch { return { error: 'That doesn’t look like a link. It should start with https://' }; }
  if (u.protocol === 'http:') return { error: 'Only secure https:// links can play here. Browsers block http video on secure sites.' };
  if (u.protocol !== 'https:') return { error: 'Only https:// links are supported.' };
  if (u.username || u.password) return { error: 'Links with embedded credentials are not allowed.' };

  if (isNetflix(u)) return { type: 'netflix', url: u.toString() };
  const path = u.pathname.toLowerCase();
  if (path.endsWith('.m3u8')) return { type: 'hls', url: u.toString() };
  if (/\.(mp4|webm|ogg|ogv|m4v|mov)$/.test(path)) return { type: 'html5', url: u.toString() };
  return { type: 'iframe', url: u.toString() };
}

export function sourceLabel(type: SourceType) {
  return ({
    none: 'Nothing playing',
    youtube: 'YouTube',
    html5: 'Video file',
    hls: 'Live stream (HLS)',
    iframe: 'Embedded website',
    netflix: 'Netflix',
  } as const)[type];
}

export const isSyncable = (t: SourceType) => t === 'youtube' || t === 'html5' || t === 'hls';
