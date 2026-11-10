import { LegalPage } from '@/components/LegalPage';
export const metadata = { title: 'Contact' };
export default function Contact() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'support@example.com';
  return (
    <LegalPage title="Contact">
      <p>Questions, bug reports, account deletion or abuse reports: email <a className="text-beam hover:underline" href={`mailto:${email}`}>{email}</a>.</p>
      <p>To report someone inside a room, open the People list or hover a chat message and choose Report. Moderators review reports in the database’s reports table.</p>
    </LegalPage>
  );
}
