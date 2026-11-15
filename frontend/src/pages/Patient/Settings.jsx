import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  BellRing,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Lock,
  ShieldCheck,
  Trash2,
  Wallet,
} from 'lucide-react';
import PageHeading from '../../components/common/PageHeading';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import StatusBadge from '../../components/common/StatusBadge';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import WalletCard from '../../components/wallet/WalletCard';
import Field from '../../components/forms/Field';
import { Input, Select, Toggle } from '../../components/forms/FormControls';
import { useAuth } from '../../context/AuthContext';
import { formatDate } from '../../utils/format';

const PASSWORD_FIELDS = [
  { key: 'current', label: 'Current password', id: 'current-password' },
  { key: 'next', label: 'New password', id: 'new-password' },
  { key: 'confirm', label: 'Confirm new password', id: 'confirm-password' },
];

const PREFERENCE_ITEMS = [
  {
    key: 'emailAlerts',
    label: 'Email notifications for new access requests',
    description: 'Get an email the moment a doctor requests access.',
  },
  {
    key: 'smsAlerts',
    label: 'SMS alerts for record access',
    description: 'Receive a text when one of your records is opened.',
  },
  {
    key: 'twoFactor',
    label: 'Two-factor authentication',
    description: 'Add a second step when signing in.',
  },
  {
    key: 'weeklySummary',
    label: 'Weekly security summary',
    description: 'A weekly digest of access activity and consent changes.',
  },
];

const LANGUAGE_OPTIONS = [
  { label: 'English', value: 'en' },
  { label: 'Hindi', value: 'hi' },
  { label: 'Marathi', value: 'mr' },
  { label: 'Tamil', value: 'ta' },
];

const DATE_FORMAT_OPTIONS = [
  { label: 'DD/MM/YYYY', value: 'dd/mm/yyyy' },
  { label: 'MM/DD/YYYY', value: 'mm/dd/yyyy' },
  { label: 'YYYY-MM-DD', value: 'yyyy-mm-dd' },
];

const STATUS_LABELS = {
  active: 'Active',
  pending: 'Pending',
  suspended: 'Suspended',
  rejected: 'Rejected',
  not_applicable: 'Not applicable',
  verified: 'Verified',
  'under review': 'Under review',
};

const STATUS_TONES = {
  active: 'success',
  verified: 'success',
  pending: 'warning',
  'under review': 'warning',
  suspended: 'danger',
  rejected: 'danger',
  not_applicable: 'neutral',
};

const PREFERENCES = { emailAlerts: true, smsAlerts: false, twoFactor: true, weeklySummary: true };

export default function Settings() {
  const { user } = useAuth();
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [visible, setVisible] = useState({});
  const [deleteOpen, setDeleteOpen] = useState(false);

  const setPasswordField = (key, value) =>
    setPasswords((previous) => ({ ...previous, [key]: value }));

  const handlePasswordSubmit = (event) => {
    event.preventDefault();
    toast('Password change is not available yet — it arrives in a later phase.', { icon: 'ℹ️' });
  };

  return (
    <div className="space-y-6">
      <PageHeading
        title="Settings"
        subtitle="Your account information, security status and wallet connection."
      />

      {/* Account information — read directly from the authenticated session */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <ShieldCheck size={16} aria-hidden="true" /> Account &amp; Security
          </span>
        }
        subtitle="This is the information your authenticated session is using right now."
      >
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Full name', user?.fullName ?? '—'],
            ['Email', user?.email ?? '—'],
            ['Mobile', user?.mobileNumber ?? '—'],
            ['Account role', user?.role ?? '—'],
            ['Member since', user?.createdAt ? formatDate(user.createdAt) : '—'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-slate-50 px-3 py-2.5">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
              <dd className="mt-0.5 break-words text-sm capitalize text-navy-900">{value}</dd>
            </div>
          ))}

          <div className="rounded-lg bg-slate-50 px-3 py-2.5">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Account status
            </dt>
            <dd className="mt-1">
              <StatusBadge
                status={user?.accountStatus}
                tone={STATUS_TONES[user?.accountStatus] ?? 'neutral'}
              >
                {STATUS_LABELS[user?.accountStatus] ?? user?.accountStatus ?? '—'}
              </StatusBadge>
            </dd>
          </div>

          <div className="rounded-lg bg-slate-50 px-3 py-2.5">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Verification
            </dt>
            <dd className="mt-1">
              <StatusBadge
                status={user?.verificationStatus}
                tone={STATUS_TONES[user?.verificationStatus] ?? 'neutral'}
              >
                {STATUS_LABELS[user?.verificationStatus] ?? user?.verificationStatus ?? '—'}
              </StatusBadge>
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-xs text-muted">
          You are signed in with a session cookie that JavaScript cannot read. Your password is
          stored as a bcrypt hash and is never returned by the API.
        </p>
      </Card>

      {/* Change password — visible but not implemented in this phase */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <KeyRound size={16} aria-hidden="true" /> Change Password
          </span>
        }
        subtitle="Not available in this phase."
      >
        <form onSubmit={handlePasswordSubmit} className="max-w-xl space-y-4">
          {PASSWORD_FIELDS.map((field) => (
            <Field key={field.key} label={field.label} htmlFor={field.id} required>
              <div className="relative">
                <Input
                  id={field.id}
                  type={visible[field.key] ? 'text' : 'password'}
                  value={passwords[field.key]}
                  onChange={(event) => setPasswordField(field.key, event.target.value)}
                  className="pr-10"
                  autoComplete="new-password"
                  disabled
                />
                <button
                  type="button"
                  onClick={() => setVisible((previous) => ({ ...previous, [field.key]: !previous[field.key] }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  aria-label={visible[field.key] ? 'Hide password' : 'Show password'}
                  disabled
                >
                  {visible[field.key] ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
          ))}

          <div className="rounded-xl2 bg-amber-50 p-3.5">
            <p className="flex items-start gap-2 text-xs text-amber-800">
              <Lock size={14} className="mt-px shrink-0" aria-hidden="true" />
              This form is disabled. Password changes and password recovery are not implemented in
              this phase — nothing is submitted.
            </p>
          </div>

          <div className="flex justify-end">
            <Button type="submit" variant="primary" icon={KeyRound} disabled>
              Update password
            </Button>
          </div>
        </form>
      </Card>

      {/* Account preferences — not persisted yet */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <BellRing size={16} aria-hidden="true" /> Account Preferences
          </span>
        }
        subtitle="Not saved yet."
      >
        <div className="space-y-5">
          <div className="divide-y divide-slate-100">
            {PREFERENCE_ITEMS.map((item) => (
              <div key={item.key} className="py-3.5 first:pt-0">
                <Toggle
                  id={`pref-${item.key}`}
                  checked={PREFERENCES[item.key]}
                  label={item.label}
                  description={item.description}
                  disabled
                />
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Preferred language" htmlFor="pref-language">
              <Select id="pref-language" value="en" disabled options={LANGUAGE_OPTIONS} />
            </Field>
            <Field label="Date format" htmlFor="pref-dateformat">
              <Select id="pref-dateformat" value="dd/mm/yyyy" disabled options={DATE_FORMAT_OPTIONS} />
            </Field>
          </div>

          <div className="flex items-center gap-2 text-xs text-amber-700">
            <Globe size={14} aria-hidden="true" />
            These preferences are disabled and are not stored anywhere — no notification system is
            configured in this phase.
          </div>
        </div>
      </Card>

      {/* Wallet connection — Phase 9 */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <Wallet size={16} aria-hidden="true" /> Wallet Connection
          </span>
        }
        subtitle="Connect and verify your Ethereum wallet to sign on-chain consents on the local blockchain."
      >
        <div className="min-w-0">
          <WalletCard />
        </div>
      </Card>

      {/* Danger zone */}
      <Card title="Danger Zone" subtitle="Irreversible account actions." className="border-red-200">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-navy-900">Delete account</p>
            <p className="text-xs text-muted">
              Permanently remove your account and every stored record.
            </p>
          </div>
          <Button variant="danger" icon={Trash2} disabled title="Account deletion is not available in this phase">
            Delete account
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => setDeleteOpen(false)}
        tone="danger"
        title="Delete your account?"
        message="This action is not available in this phase."
        confirmLabel="Delete account"
      >
        <p className="text-sm text-slate-700">
          Nothing will be removed. Account deletion is not implemented in this phase.
        </p>
      </ConfirmDialog>
    </div>
  );
}
