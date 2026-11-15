import { Link, Outlet } from 'react-router-dom';
import { ArrowLeft, Lock, ShieldCheck } from 'lucide-react';
import Logo from '../components/common/Logo';

const HIGHLIGHTS = [
  {
    icon: ShieldCheck,
    title: 'Patient-controlled consent',
    description: 'You decide which records a doctor may open, and for how long.',
  },
  {
    icon: Lock,
    title: 'Encrypted at rest',
    description: 'AES-256-GCM encryption with SHA-256 integrity verification.',
  },
];

/**
 * Split-screen shell for Login and the two registration flows.
 * The left panel carries the brand message; the right panel hosts the form.
 */
export default function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <div className="flex min-h-screen bg-surface">
      {/* Brand panel */}
      <aside className="relative hidden w-[42%] max-w-xl flex-col justify-between bg-navy-950 p-10 lg:flex xl:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, #0d9488 0, transparent 45%), radial-gradient(circle at 80% 70%, #31759f 0, transparent 45%)',
          }}
          aria-hidden="true"
        />

        <div className="relative">
          <Logo variant="light" size="md" />

          <h2 className="mt-14 text-3xl font-semibold leading-tight text-white xl:text-4xl">
            Your medical records.
            <br />
            <span className="text-teal-400">Your control.</span>
          </h2>

          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-300">
            A single secure place to store medical documents and grant time-limited, record-specific
            access to verified doctors.
          </p>

          <ul className="mt-10 space-y-5">
            {HIGHLIGHTS.map(({ icon: Icon, title: heading, description }) => (
              <li key={heading} className="flex gap-3.5">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-teal-300">
                  <Icon size={17} aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-white">{heading}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">
                    {description}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-500">
          College demonstration project · synthetic data only · not for clinical use
        </p>
      </aside>

      {/* Form panel */}
      <div className="flex w-full flex-col lg:w-[58%]">
        <header className="flex items-center justify-between px-5 py-5 sm:px-8">
          <div className="lg:hidden">
            <Logo size="sm" />
          </div>
          <Link
            to="/"
            className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-navy-900"
          >
            <ArrowLeft size={15} />
            Back to home
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center px-5 pb-10 sm:px-8">
          <div className="w-full max-w-md">
            <h1 className="text-2xl font-semibold text-navy-900">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}

            <div className="mt-7">{children}</div>

            {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  );
}
