import { LegalPage } from '@/components/LegalPage';
export const metadata = { title: 'Terms' };
export default function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="November 2026">
      <p>By using Nightcap you agree to these terms. Replace them with terms reviewed for your jurisdiction before launching publicly.</p>
      <h2>Content you share</h2>
      <p>Only share links to content you have the right to watch. You are responsible for following the terms of the services you watch, including subscription requirements. Nightcap does not host video files.</p>
      <h2>Behaviour</h2>
      <p>No harassment, hate speech, spam, or illegal content. Room hosts and moderators can remove messages and people, and anyone can report or block users.</p>
      <h2>Availability</h2>
      <p>Playback quality and sync depend on your connection, your device and the video provider. The service is provided as is.</p>
    </LegalPage>
  );
}
