import { LegalPage } from '@/components/LegalPage';
export const metadata = { title: 'Privacy Policy' };
export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="November 2026">
      <p>This policy explains what Nightcap stores and why. Replace it with a policy reviewed for your jurisdiction before launching publicly.</p>
      <h2>What we store</h2>
      <p>Your email address, username, display name, profile picture and bio; rooms you create or join; chat and private messages; friends, blocks and reports; and your watch history. Watch history can be deleted from your profile at any time.</p>
      <h2>Calls</h2>
      <p>Voice and video calls are relayed through our call provider (LiveKit) and are not recorded by Nightcap.</p>
      <h2>Third parties</h2>
      <p>Videos load directly from their providers (for example YouTube), which may set their own cookies under their own policies. GIF search is provided by GIPHY.</p>
      <h2>Your choices</h2>
      <p>You can edit your profile, delete watch history, leave rooms, and block people. To delete your account, contact us from the Contact page.</p>
    </LegalPage>
  );
}
