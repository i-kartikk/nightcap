import { LegalPage } from '@/components/LegalPage';
export const metadata = { title: 'About' };
export default function About() {
  return (
    <LegalPage title="About Nightcap">
      <p>Nightcap is a place to watch things together when you can’t be on the same couch. One person starts a room, everyone joins with a link, and the video stays on the same second for the whole group.</p>
      <h2>What you can watch</h2>
      <p>YouTube videos, direct video files (MP4, WebM, Ogg), HLS live streams, and any website that allows itself to be embedded. Netflix works in assisted mode: everyone opens Netflix in their own account, and Nightcap keeps a shared clock and countdown.</p>
      <h2>What we won’t do</h2>
      <p>We don’t bypass DRM, paywalls, logins or a website’s embedding rules. If a site doesn’t allow embedding, we tell you and offer to open it in a new tab.</p>
    </LegalPage>
  );
}
