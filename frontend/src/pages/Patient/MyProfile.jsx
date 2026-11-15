import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Droplet, Mail, MapPin, Phone, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import PageHeading from '../../components/common/PageHeading';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Avatar from '../../components/common/Avatar';
import StatusBadge from '../../components/common/StatusBadge';
import ErrorState from '../../components/common/ErrorState';
import { Skeleton } from '../../components/common/LoadingSkeleton';
import Field from '../../components/forms/Field';
import { Input, Select, Textarea } from '../../components/forms/FormControls';
import usePatientResource from '../../hooks/usePatientResource';
import { fetchProfile, updateProfile } from '../../services/patientService';
import { apiErrorMessage, fieldErrorsFrom } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

/** Mirrors the values accepted by User.GENDERS / User.BLOOD_GROUPS on the server. */
const GENDER_OPTIONS = [
  { label: 'Female', value: 'female' },
  { label: 'Male', value: 'male' },
  { label: 'Other', value: 'other' },
  { label: 'Prefer not to say', value: 'prefer_not_to_say' },
];

const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((value) => ({
  label: value,
  value,
}));

const ACCOUNT_STATUS_LABELS = {
  active: 'Active',
  pending: 'Pending',
  suspended: 'Suspended',
  rejected: 'Rejected',
};

/** Same mobile rule the registration and profile endpoints enforce. */
const MOBILE_PATTERN = /^\+?[0-9][0-9\s\-()]{6,19}$/;

const EMPTY_FORM = {
  fullName: '',
  mobileNumber: '',
  dateOfBirth: '',
  gender: '',
  address: '',
  emergencyContact: '',
  bloodGroup: '',
};

function toDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export default function MyProfile() {
  const { refresh } = useAuth();
  const { status: loadStatus, data: user, error, reload } = usePatientResource(
    () => fetchProfile(),
    [],
    { fallbackMessage: 'Could not load your profile.' }
  );

  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Re-fill the form whenever a fresh server copy of the profile arrives.
  useEffect(() => {
    if (!user) return;
    setForm({
      fullName: user.fullName ?? '',
      mobileNumber: user.mobileNumber ?? '',
      dateOfBirth: toDateInput(user.dateOfBirth),
      gender: user.gender ?? '',
      address: user.address ?? '',
      emergencyContact: user.emergencyContact ?? '',
      bloodGroup: user.bloodGroup ?? '',
    });
    setErrors({});
  }, [user]);

  const setField = (key, value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: '' }));
  };

  const validate = () => {
    const next = {};
    if (form.fullName.trim().length < 2) next.fullName = 'Full name must be at least 2 characters.';
    if (!form.mobileNumber.trim()) next.mobileNumber = 'Mobile number is required.';
    else if (!MOBILE_PATTERN.test(form.mobileNumber.trim())) {
      next.mobileNumber = 'Enter a valid mobile number.';
    }
    if (form.dateOfBirth && new Date(form.dateOfBirth).getTime() > Date.now()) {
      next.dateOfBirth = 'Date of birth cannot be in the future.';
    }
    if (form.address.length > 300) next.address = 'Address must be at most 300 characters.';
    if (form.emergencyContact.length > 120) {
      next.emergencyContact = 'Emergency contact must be at most 120 characters.';
    }
    return next;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      // Only allow-listed fields are ever sent; the server rejects anything else.
      await updateProfile({
        fullName: form.fullName.trim(),
        mobileNumber: form.mobileNumber.trim(),
        dateOfBirth: form.dateOfBirth,
        gender: form.gender,
        address: form.address.trim(),
        emergencyContact: form.emergencyContact.trim(),
        bloodGroup: form.bloodGroup,
      });
      toast.success('Profile updated.');
      // Keep the shell (name, avatar) in step with the saved profile.
      await refresh().catch(() => {});
      await reload({ silent: true });
    } catch (requestError) {
      const fieldErrors = fieldErrorsFrom(requestError);
      if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);
      toast.error(apiErrorMessage(requestError, 'Could not save your profile.'));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!user) return;
    setForm({
      fullName: user.fullName ?? '',
      mobileNumber: user.mobileNumber ?? '',
      dateOfBirth: toDateInput(user.dateOfBirth),
      gender: user.gender ?? '',
      address: user.address ?? '',
      emergencyContact: user.emergencyContact ?? '',
      bloodGroup: user.bloodGroup ?? '',
    });
    setErrors({});
  };

  if (loadStatus === 'error') {
    return (
      <div className="space-y-6">
        <PageHeading title="My Profile" subtitle="Your personal details and contact information." />
        <Card bodyClassName="p-0">
          <ErrorState title="We could not load your profile" message={error} onRetry={() => reload()} />
        </Card>
      </div>
    );
  }

  const loading = loadStatus === 'loading';

  return (
    <div className="space-y-6">
      <PageHeading
        title="My Profile"
        subtitle="Keep your contact details up to date so doctors can reach you about your care."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Avatar summary */}
        <div className="lg:col-span-1">
          <Card>
            <div className="flex flex-col items-center text-center">
              {loading ? (
                <>
                  <Skeleton className="h-16 w-16 rounded-full" />
                  <Skeleton className="mt-3 h-4 w-32" />
                  <Skeleton className="mt-2 h-3 w-40" />
                </>
              ) : (
                <>
                  <Avatar name={user?.fullName} src={user?.profilePhoto ?? undefined} size="xl" />
                  <p className="mt-3 text-base font-semibold text-navy-900">{user?.fullName}</p>
                  <p className="break-all font-mono text-[11px] text-muted">{user?.id}</p>

                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    {form.bloodGroup && (
                      <StatusBadge tone="accent" dot={false}>
                        <Droplet size={12} aria-hidden="true" />
                        {form.bloodGroup}
                      </StatusBadge>
                    )}
                    <StatusBadge
                      status={user?.accountStatus}
                      tone={user?.accountStatus === 'active' ? 'success' : 'warning'}
                    >
                      {ACCOUNT_STATUS_LABELS[user?.accountStatus] ?? user?.accountStatus}
                    </StatusBadge>
                  </div>

                  {user?.createdAt && (
                    <p className="mt-4 text-xs text-muted">
                      Patient since {new Date(user.createdAt).getFullYear()}
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="divider my-5" />

            <dl className="space-y-3 text-sm">
              <div className="flex items-start gap-2.5">
                <Mail size={15} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
                <div className="min-w-0">
                  <dt className="text-xs text-muted">Email</dt>
                  <dd className="truncate text-slate-700">{user?.email ?? '—'}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Phone size={15} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
                <div className="min-w-0">
                  <dt className="text-xs text-muted">Mobile</dt>
                  <dd className="text-slate-700">{user?.mobileNumber ?? '—'}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <MapPin size={15} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
                <div className="min-w-0">
                  <dt className="text-xs text-muted">Address</dt>
                  <dd className="text-slate-700">{user?.address || 'Not provided'}</dd>
                </div>
              </div>
            </dl>

            <p className="mt-5 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-muted">
              <ShieldCheck size={14} className="mt-px shrink-0" aria-hidden="true" />
              Profile photo upload arrives in a later phase. No image is uploaded or stored here.
            </p>
          </Card>
        </div>

        {/* Editable form */}
        <div className="lg:col-span-2">
          <Card title="Personal details" subtitle="Update the information below and save.">
            {loading ? (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-16 w-full" />
                  ))}
                </div>
                <Skeleton className="h-24 w-full" />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full Name" htmlFor="profile-name" required error={errors.fullName}>
                    <Input
                      id="profile-name"
                      value={form.fullName}
                      onChange={(event) => setField('fullName', event.target.value)}
                      error={errors.fullName}
                    />
                  </Field>

                  <Field
                    label="Email"
                    htmlFor="profile-email"
                    hint="Email changes are not supported yet — a verified email workflow comes later."
                  >
                    <Input id="profile-email" type="email" value={user?.email ?? ''} disabled readOnly />
                  </Field>

                  <Field label="Mobile" htmlFor="profile-mobile" required error={errors.mobileNumber}>
                    <Input
                      id="profile-mobile"
                      type="tel"
                      value={form.mobileNumber}
                      onChange={(event) => setField('mobileNumber', event.target.value)}
                      error={errors.mobileNumber}
                    />
                  </Field>

                  <Field label="Date of Birth" htmlFor="profile-dob" error={errors.dateOfBirth}>
                    <Input
                      id="profile-dob"
                      type="date"
                      max={toDateInput(Date.now())}
                      value={form.dateOfBirth}
                      onChange={(event) => setField('dateOfBirth', event.target.value)}
                      error={errors.dateOfBirth}
                    />
                  </Field>

                  <Field label="Gender" htmlFor="profile-gender">
                    <Select
                      id="profile-gender"
                      value={form.gender}
                      onChange={(event) => setField('gender', event.target.value)}
                      placeholder="Not specified"
                      options={GENDER_OPTIONS}
                    />
                  </Field>

                  <Field label="Blood Group" htmlFor="profile-blood">
                    <Select
                      id="profile-blood"
                      value={form.bloodGroup}
                      onChange={(event) => setField('bloodGroup', event.target.value)}
                      placeholder="Not specified"
                      options={BLOOD_GROUP_OPTIONS}
                    />
                  </Field>
                </div>

                <Field
                  label="Emergency Contact"
                  htmlFor="profile-emergency"
                  optional
                  error={errors.emergencyContact}
                >
                  <Input
                    id="profile-emergency"
                    value={form.emergencyContact}
                    onChange={(event) => setField('emergencyContact', event.target.value)}
                    error={errors.emergencyContact}
                    placeholder="Name — phone number"
                  />
                </Field>

                <Field label="Address" htmlFor="profile-address" optional error={errors.address}>
                  <Textarea
                    id="profile-address"
                    rows={3}
                    value={form.address}
                    onChange={(event) => setField('address', event.target.value)}
                    error={errors.address}
                  />
                </Field>

                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-5">
                  <Button variant="outline" icon={RotateCcw} onClick={handleReset} disabled={saving}>
                    Reset
                  </Button>
                  <Button type="submit" variant="accent" icon={Save} loading={saving}>
                    Save changes
                  </Button>
                </div>
              </form>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
