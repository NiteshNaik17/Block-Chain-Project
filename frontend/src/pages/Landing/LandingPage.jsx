import {
  Activity,
  ArrowRight,
  Blocks,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileText,
  Fingerprint,
  Hospital,
  KeyRound,
  Lock,
  Send,
  ShieldCheck,
  Stethoscope,
  Upload,
  UserCheck,
  Users,
} from 'lucide-react';
import Button from '../../components/common/Button';

/* ------------------------------------------------------------------ *
 * Landing page content
 * ------------------------------------------------------------------ */

const FEATURES = [
  {
    icon: FileText,
    title: 'Secure Medical Records',
    description:
      'Keep prescriptions, lab reports, imaging and discharge summaries in one encrypted vault that only you can open by default.',
  },
  {
    icon: UserCheck,
    title: 'Patient-Controlled Consent',
    description:
      'Every doctor request waits for your decision. Approve or reject, choose exactly which records are shared, and set an expiry date.',
  },
  {
    icon: Blocks,
    title: 'Blockchain Verification',
    description:
      'Consent grant and revoke events are anchored on-chain, creating a tamper-evident trail that no one can quietly rewrite.',
  },
  {
    icon: Lock,
    title: 'Encrypted File Storage',
    description:
      'Documents are encrypted with AES-256-GCM before they are stored. Nothing clinically identifiable ever goes on-chain.',
  },
  {
    icon: Activity,
    title: 'Access Tracking',
    description:
      'See when each doctor opened a record, what they were allowed to see, and every blocked attempt — in plain language.',
  },
];

const STEPS = [
  {
    icon: Upload,
    title: 'Patient uploads medical records',
    description:
      'Documents are encrypted on upload and hashed with SHA-256 so any later tampering can be detected.',
  },
  {
    icon: Send,
    title: 'Doctor requests access',
    description:
      'A verified doctor searches for your patient reference and submits a request naming the records and the clinical purpose.',
  },
  {
    icon: ClipboardCheck,
    title: 'Patient reviews and approves',
    description:
      'You see who is asking, why, and which records they want. You choose the records and how long access should last.',
  },
  {
    icon: Blocks,
    title: 'Blockchain records consent',
    description:
      'The consent decision is signed and anchored on-chain, producing a permanent, verifiable reference for that grant.',
  },
  {
    icon: Eye,
    title: 'Doctor accesses authorised records',
    description:
      'Access is re-verified against the on-chain consent before a single byte is decrypted and delivered — and the access is logged.',
  },
];

const SECURITY = [
  {
    icon: Lock,
    title: 'AES-256-GCM Encryption',
    description:
      'Authenticated symmetric encryption protects every stored document and its wrapped key material.',
  },
  {
    icon: Fingerprint,
    title: 'SHA-256 Integrity Verification',
    description:
      'A hash is recorded when a file is stored and re-checked on every download to prove the bytes are unchanged.',
  },
  {
    icon: Blocks,
    title: 'Blockchain Consent Management',
    description:
      'Grant, extend and revoke actions are recorded in a tamper-evident ledger with a transaction reference.',
  },
  {
    icon: KeyRound,
    title: 'Role-Based Access Control',
    description:
      'Patients, doctors and administrators see only what their role permits; administrators never open patient records.',
  },
];

const TRUST_POINTS = [
  'Consent is required before any record is decrypted',
  'Clinical documents never leave encrypted off-chain storage',
  'Every access attempt is logged and auditable',
];

/* ------------------------------------------------------------------ *
 * Sections
 * ------------------------------------------------------------------ */

function SectionHeading({ eyebrow, title, description, align = 'center' }) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
      {eyebrow && (
        <span className="text-xs font-semibold uppercase tracking-widest text-teal-700">
          {eyebrow}
        </span>
      )}
      <h2 className="mt-3 text-2xl font-semibold text-navy-900 sm:text-3xl">{title}</h2>
      {description && <p className="mt-3 text-base leading-relaxed text-muted">{description}</p>}
    </div>
  );
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-surface">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-80 opacity-[0.06]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 25% 40%, #0d9488 0, transparent 50%), radial-gradient(circle at 75% 20%, #082f49 0, transparent 50%)',
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-24">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800 ring-1 ring-inset ring-teal-200">
            <ShieldCheck size={13} aria-hidden="true" />
            Patient-controlled medical data access
          </span>

          <h1 className="mt-5 text-3xl font-semibold leading-tight text-navy-900 sm:text-4xl lg:text-5xl">
            Your Medical Records.
            <br />
            <span className="text-teal-600">Your Control.</span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Take control of your healthcare information. Securely manage medical records and decide
            who can access them through blockchain-powered consent management.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button to="/get-started" variant="accent" size="lg" iconRight={ArrowRight}>
              Get Started
            </Button>
            <Button to="/#features" variant="outline" size="lg">
              Explore Features
            </Button>
          </div>

          <ul className="mx-auto mt-9 flex max-w-2xl flex-wrap justify-center gap-x-6 gap-y-2.5">
            {TRUST_POINTS.map((point) => (
              <li key={point} className="flex items-center gap-2 text-sm text-slate-600">
                <CheckCircle2
                  size={16}
                  className="shrink-0 text-teal-600"
                  aria-hidden="true"
                />
                {point}
              </li>
            ))}
          </ul>

          <dl className="mx-auto mt-10 grid max-w-lg grid-cols-3 gap-6 border-t border-slate-200 pt-6">
            {[
              { label: 'Records encrypted', value: 'AES-256' },
              { label: 'Integrity check', value: 'SHA-256' },
              { label: 'Consent ledger', value: 'On-chain' },
            ].map((item) => (
              <div key={item.label} className="text-center">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  {item.label}
                </dt>
                <dd className="mt-1 text-sm font-semibold text-navy-900">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

function About() {
  const items = [
    {
      icon: Users,
      title: 'The problem',
      description:
        'Medical documents are scattered across hospitals, labs and clinics. Once shared, a patient rarely knows who still holds a copy, why they hold it, or for how long — and there is usually no reliable way to withdraw that access.',
    },
    {
      icon: ShieldCheck,
      title: 'Why you should control it',
      description:
        'Your records describe your body, your treatments and your family history. Access should be a deliberate decision made by you, limited to the records that are clinically relevant and to a period you agree to.',
    },
    {
      icon: Hospital,
      title: 'How MediConsent helps',
      description:
        'MediConsent keeps your records encrypted off-chain, requires an explicit consent decision from you before any release, and anchors that decision on a blockchain so it cannot be silently altered or denied later.',
    },
  ];

  return (
    <section id="about" className="scroll-mt-20 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <SectionHeading
          eyebrow="About MediConsent"
          title="Healthcare data sharing should not happen behind your back"
          description="MediConsent is built around a simple principle: a medical record belongs to the person it describes, and access to it must be granted knowingly."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {items.map(({ icon: Icon, title, description }) => (
            <article key={title} className="card card-hover p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl2 bg-navy-50 text-navy-800">
                <Icon size={20} aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-base font-semibold text-navy-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="scroll-mt-20 bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <SectionHeading
          eyebrow="Features"
          title="Everything needed for consent-first record sharing"
          description="Five capabilities work together so that a medical record is only ever released when the patient has explicitly allowed it."
        />

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <article key={title} className="card card-hover p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl2 bg-teal-50 text-teal-700">
                <Icon size={20} aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-base font-semibold text-navy-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
            </article>
          ))}

          <article className="flex flex-col justify-between rounded-xl2 bg-navy-950 p-6 text-white shadow-card">
            <div>
              <h3 className="text-base font-semibold">Ready to see it in action?</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                Explore the patient, doctor and administrator portals with sample data — no account
                required.
              </p>
            </div>
            <Button to="/demo" variant="accent" className="mt-6 self-start" iconRight={ArrowRight}>
              Open portal preview
            </Button>
          </article>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <SectionHeading
          eyebrow="How it works"
          title="From upload to authorised access in five steps"
          description="Each step leaves a clear record of who did what, so the consent trail can always be reconstructed."
        />

        <ol className="mt-12 grid gap-6 lg:grid-cols-5">
          {STEPS.map(({ icon: Icon, title, description }, index) => (
            <li key={title} className="card relative p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-900 text-xs font-semibold text-white">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <Icon size={18} className="text-teal-600" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-navy-900">{title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">{description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Security() {
  return (
    <section id="security" className="scroll-mt-20 bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <SectionHeading
          eyebrow="Security"
          title="Defence in depth for sensitive health information"
          description="Confidentiality, integrity and accountability are handled separately, so a failure in one control does not expose your records."
        />

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {SECURITY.map(({ icon: Icon, title, description }) => (
            <article key={title} className="card card-hover p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl2 bg-white text-navy-900 ring-1 ring-inset ring-slate-200">
                <Icon size={20} aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-sm font-semibold text-navy-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function CallToAction() {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="relative overflow-hidden rounded-xl2 bg-navy-950 px-6 py-12 sm:px-12 sm:py-14">
          <div
            className="pointer-events-none absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                'radial-gradient(circle at 15% 25%, #0d9488 0, transparent 45%), radial-gradient(circle at 85% 75%, #31759f 0, transparent 45%)',
            }}
            aria-hidden="true"
          />

          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold text-white sm:text-3xl">
                Start deciding who can see your medical records
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-300 sm:text-base">
                Create an account as a patient to upload and control your records, or register as a
                doctor to request access with a verifiable consent trail.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button to="/register/patient" variant="accent" size="lg" icon={Users}>
                Register as patient
              </Button>
              <Button
                to="/register/doctor"
                size="lg"
                icon={Stethoscope}
                className="border border-white/20 bg-white/10 text-white hover:bg-white/20"
              >
                Register as doctor
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <>
      <Hero />
      <About />
      <Features />
      <HowItWorks />
      <Security />
      <CallToAction />
    </>
  );
}
