import { ArrowRight, BadgeCheck, ShieldCheck, Stethoscope, Users } from 'lucide-react';
import Button from '../../components/common/Button';

const OPTIONS = [
  {
    icon: Users,
    title: 'I am a patient',
    description:
      'Upload medical records, review doctor requests and approve or revoke access with an expiry date you choose.',
    action: { label: 'Create patient account', to: '/register/patient', variant: 'accent' },
    points: [
      'Encrypted record storage',
      'Record-level consent decisions',
      'Full access history',
    ],
  },
  {
    icon: Stethoscope,
    title: 'I am a doctor',
    description:
      'Request the records you need for a case, state your clinical purpose and access only what a patient approves.',
    action: { label: 'Register as doctor', to: '/register/doctor', variant: 'primary' },
    points: [
      'Administrator-verified accounts',
      'Consent required per record',
      'Time-limited access windows',
    ],
  },
  {
    icon: BadgeCheck,
    title: 'I am an administrator',
    description:
      'Verify doctor registrations, manage accounts and review the platform activity log. Administrators never open patient records.',
    action: { label: 'Open portal preview', to: '/demo', variant: 'outline' },
    points: [
      'Doctor verification queue',
      'User and role management',
      'System-wide activity logs',
    ],
  },
];

export default function GetStartedPage() {
  return (
    <div className="bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800 ring-1 ring-inset ring-teal-200">
            <ShieldCheck size={13} aria-hidden="true" />
            Get started with MediConsent
          </span>

          <h1 className="mt-5 text-2xl font-semibold text-navy-900 sm:text-3xl lg:text-4xl">
            Choose how you want to use MediConsent
          </h1>

          <p className="mt-4 text-base leading-relaxed text-muted">
            Patient and doctor accounts have different responsibilities, so they register separately.
            Administrator accounts are provisioned internally rather than self-registered.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {OPTIONS.map(({ icon: Icon, title, description, action, points }) => (
            <article key={title} className="card card-hover flex flex-col p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl2 bg-navy-50 text-navy-800">
                <Icon size={20} aria-hidden="true" />
              </span>

              <h2 className="mt-5 text-base font-semibold text-navy-900">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>

              <ul className="mt-5 space-y-2">
                {points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm text-slate-600">
                    <ShieldCheck
                      size={15}
                      className="mt-0.5 shrink-0 text-teal-600"
                      aria-hidden="true"
                    />
                    {point}
                  </li>
                ))}
              </ul>

              <Button
                to={action.to}
                variant={action.variant}
                className="mt-6 self-start"
                iconRight={ArrowRight}
              >
                {action.label}
              </Button>
            </article>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 rounded-xl2 border border-amber-200 bg-amber-50 px-5 py-4 sm:flex-row">
          <p className="text-sm leading-relaxed text-amber-900">
            <strong className="font-semibold">Phase 2 is front-end only.</strong> Registration and
            sign-in are visual at this stage — no account is created and no data is transmitted. To
            explore the finished interfaces, use the development portal preview.
          </p>
          <Button to="/demo" variant="primary" size="sm" iconRight={ArrowRight} className="shrink-0">
            Portal preview
          </Button>
        </div>
      </div>
    </div>
  );
}
