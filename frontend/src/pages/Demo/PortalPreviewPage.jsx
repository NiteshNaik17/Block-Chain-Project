import { useNavigate } from 'react-router-dom';
import { ArrowRight, BadgeCheck, FlaskConical, ShieldAlert, Stethoscope, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '../../components/common/Button';
import { demoAdmin, demoDoctor, demoPatient } from '../../data/demoUsers';

const PORTALS = [
  {
    key: 'patient',
    icon: Users,
    title: 'Patient Portal',
    user: demoPatient,
    subtitle: 'Ananya Sharma',
    description:
      'Dashboard, medical records, doctor access requests, active consents, consent and access history, profile and settings.',
    to: '/patient/dashboard',
    pages: 8,
    accent: 'bg-teal-50 text-teal-700',
  },
  {
    key: 'doctor',
    icon: Stethoscope,
    title: 'Doctor Portal',
    user: demoDoctor,
    subtitle: 'Dr. Rohan Mehta · Cardiology',
    description:
      'Dashboard, patient search, requesting medical records, my requests, accessible records, access history and profile.',
    to: '/doctor/dashboard',
    pages: 7,
    accent: 'bg-navy-50 text-navy-800',
  },
  {
    key: 'admin',
    icon: BadgeCheck,
    title: 'Admin Portal',
    user: demoAdmin,
    subtitle: 'Priya Nair · Administrator',
    description:
      'Dashboard, manage patients, verify doctors, manage users and the system activity log.',
    to: '/admin/dashboard',
    pages: 5,
    accent: 'bg-amber-50 text-amber-700',
  },
];

/**
 * Development-only preview of the three portals.
 * The buttons below only navigate to the portals — they no longer bypass access
 * control. Each portal enforces the real backend session, so an unauthenticated
 * visitor (or one signed in with a different role) is redirected to sign in.
 */
export default function PortalPreviewPage() {
  const navigate = useNavigate();

  const open = (portal) => {
    toast(`Opening the ${portal.title}. Sign-in with the matching role is required.`, {
      icon: 'ℹ️',
    });
    navigate(portal.to);
  };

  return (
    <div className="bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
            <FlaskConical size={13} aria-hidden="true" />
            Development-only preview
          </span>

          <h1 className="mt-5 text-2xl font-semibold text-navy-900 sm:text-3xl lg:text-4xl">
            Preview the three MediConsent portals
          </h1>

          <p className="mt-4 text-base leading-relaxed text-muted">
            Select a role to open its portal. Real authentication is now active: the portals are
            protected by the backend session, so you must be signed in with the matching role to
            stay on the page.
          </p>
        </div>

        <div className="mt-10 flex items-start gap-3 rounded-xl2 border border-amber-200 bg-amber-50 px-5 py-4">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="text-sm leading-relaxed text-amber-900">
            <strong className="font-semibold">This page does not bypass access control.</strong>{' '}
            Sign-in, role enforcement and route protection are live (JWT sessions in an HttpOnly
            cookie). Opening a portal you are not authorised for simply redirects you to sign in or
            to your own portal.
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {PORTALS.map(({ key, icon: Icon, title, subtitle, description, to, pages, accent }) => (
            <article key={key} className="card card-hover flex flex-col p-6">
              <div className="flex items-start justify-between gap-3">
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl2 ${accent}`}>
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span className="badge bg-slate-100 text-slate-600">{pages} pages</span>
              </div>

              <h2 className="mt-5 text-base font-semibold text-navy-900">{title}</h2>
              <p className="mt-1 text-xs font-medium text-teal-700">{subtitle}</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{description}</p>

              <Button
                variant="outline"
                className="mt-6 self-start"
                iconRight={ArrowRight}
                onClick={() => open({ title, to })}
              >
                Open {title}
              </Button>
            </article>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center gap-3 border-t border-slate-200 pt-8 text-center">
          <p className="text-sm text-muted">
            Looking for the real entry points? Sign-in and registration are on the public pages.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="ghost" size="sm" to="/login">
              Sign in
            </Button>
            <Button variant="ghost" size="sm" to="/register/patient">
              Patient registration
            </Button>
            <Button variant="ghost" size="sm" to="/register/doctor">
              Doctor registration
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
