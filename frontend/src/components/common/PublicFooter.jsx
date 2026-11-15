import { Link } from 'react-router-dom';
import { Lock, Mail, ShieldCheck } from 'lucide-react';
import Logo from './Logo';

const PRODUCT_LINKS = [
  { label: 'About', hash: 'about' },
  { label: 'Features', hash: 'features' },
  { label: 'How It Works', hash: 'how-it-works' },
  { label: 'Security', hash: 'security' },
];

const ACCESS_LINKS = [
  { label: 'Login', to: '/login' },
  { label: 'Patient Registration', to: '/register/patient' },
  { label: 'Doctor Registration', to: '/register/doctor' },
  { label: 'Portal Preview', to: '/demo' },
];

/** Marketing footer: brand, navigation columns and copyright. */
export default function PublicFooter() {
  return (
    <footer className="border-t border-slate-200 bg-navy-950 text-slate-300">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-4 lg:px-8">
        <div className="lg:col-span-2">
          <Logo variant="light" size="md" />

          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-400">
            MediConsent puts patients in charge of their medical information. Records stay encrypted
            off-chain while consent decisions are recorded in a tamper-evident blockchain ledger —
            so access is always explicit, limited and auditable.
          </p>

          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400">
            <li className="inline-flex items-center gap-1.5">
              <Lock size={13} aria-hidden="true" />
              AES-256-GCM encrypted storage
            </li>
            <li className="inline-flex items-center gap-1.5">
              <ShieldCheck size={13} aria-hidden="true" />
              SHA-256 integrity checks
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Mail size={13} aria-hidden="true" />
              support@mediconsent.local
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-white">Product</h3>
          <ul className="mt-4 space-y-2.5 text-sm">
            {PRODUCT_LINKS.map((link) => (
              <li key={link.hash}>
                <a
                  href={`/#${link.hash}`}
                  className="text-slate-400 transition-colors hover:text-teal-300"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-white">Access</h3>
          <ul className="mt-4 space-y-2.5 text-sm">
            {ACCESS_LINKS.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="text-slate-400 transition-colors hover:text-teal-300">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} MediConsent. All rights reserved.</p>
          <p>
            College demonstration project · synthetic data only · not a medical device and not for
            clinical use.
          </p>
        </div>
      </div>
    </footer>
  );
}
