import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { getSetting } from "@/lib/settings";

export const metadata = { title: "Privacy notice" };

/**
 * Privacy notice under the Philippine Data Privacy Act of 2012 (RA 10173).
 * PLAIN-LANGUAGE DRAFT — Print Amplified should have it reviewed and name
 * its Data Protection Officer before go-live.
 */
export default async function PrivacyPage() {
  const company = process.env.NEXT_PUBLIC_SUPABASE_URL ? await getSetting("company").catch(() => null) : null;
  const name = company?.legal_name || "Print Amplified";
  const contact = company?.email || "hello@printamplified.com";
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/"><Logo /></Link>
      <article className="mt-8 space-y-5 text-[15px] leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">
        <h1 className="text-3xl font-bold tracking-tight">Privacy notice</h1>
        <p className="text-sm text-muted-foreground">Draft for review · Data Privacy Act of 2012 (Republic Act No. 10173)</p>
        <p>{name} (“we”) runs this ordering app for its business clients. This notice explains what personal data we collect, why, and your rights.</p>
        <h2>What we collect</h2>
        <ul>
          <li>Account details: your name, work email, mobile number, job title, company and role.</li>
          <li>Sign-in and security records: sign-in times, failed attempts, IP address, device/browser type, and whether 2-step verification is on.</li>
          <li>Order records: delivery contact names, phone numbers and addresses; approvals you give (name, date, time and IP address).</li>
          <li>Files you upload (artwork, logos, deposit slips). These may contain personal data you choose to include, such as names on business cards.</li>
        </ul>
        <p>We do not collect payment card details. Payments are made outside the app by bank transfer or cheque.</p>
        <h2>Why we use it</h2>
        <ul>
          <li>To provide quotes, take and deliver your orders, and keep your company’s print records.</li>
          <li>To keep accounts secure (2-step verification, lockouts, new-device alerts) and keep an audit trail.</li>
          <li>To send service emails and notifications about your orders. We do not send marketing from this app.</li>
        </ul>
        <p>Our legal basis is the performance of our contract with your company and our legitimate interest in running a secure service.</p>
        <h2>Who can see it</h2>
        <p>Only users of your own company and the Print Amplified staff who serve your account. Each company’s data is separated in the database itself. Our service providers process data for us under agreements: Supabase (database and file storage), Vercel (hosting), Resend (email) and Cloudflare (bot protection). Some of these may store data outside the Philippines with appropriate safeguards.</p>
        <h2>How long we keep it</h2>
        <p>Print records (artwork, colour standards, specs, prices, orders) belong to your company and are kept while your company is our client, so reorders stay accurate even years later. Sign-in records are kept for up to 2 years. When someone leaves your company, their account is deactivated; their name stays on records they created or approved.</p>
        <h2>Your rights</h2>
        <p>You may ask to be informed, to access, correct or object to the processing of your personal data, to data portability, and to have data erased where the law allows. You may also complain to the National Privacy Commission (privacy.gov.ph).</p>
        <h2>Contact</h2>
        <p>Data Protection Officer, {name} — <a className="text-primary underline" href={`mailto:${contact}`}>{contact}</a></p>
      </article>
    </main>
  );
}
