import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  BadgeCheck,
  Building2,
  Calendar,
  Info,
  Mail,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import PageHeading from '../../components/common/PageHeading';
import Card from '../../components/common/Card';
import Avatar from '../../components/common/Avatar';
import Button from '../../components/common/Button';
import StatusBadge from '../../components/common/StatusBadge';
import ErrorState from '../../components/common/ErrorState';
import { Skeleton } from '../../components/common/LoadingSkeleton';
import Field from '../../components/forms/Field';
import { Input, Select } from '../../components/forms/FormControls';
import WalletCard from '../../components/wallet/WalletCard';
import usePatientResource from '../../hooks/usePatientResource';
import { apiErrorMessage } from '../../services/api';
import { fetchProfile, updateProfile } from '../../services/doctorService';
import { formatDate } from '../../utils/format';
import { specializations } from '../../data/doctorData';

const EMPTY_FORM = {
  fullName: '',
  mobileNumber: '',
  specialization: '',
  hospitalName: '',
  profilePhoto: '',
};

/** Only the fields the server allows through PATCH /api/v1/doctor/profile. */
function formFromProfile(profile) {
  return {
    fullName: profile?.fullName ?? '',
    mobileNumber: profile?.mobileNumber ?? '',
    specialization: profile?.specialization ?? '',
    hospitalName: profile?.hospitalName ?? '',
    profilePhoto: profile?.profilePhoto ?? '',
  };
}

/** Doctor professional profile — identity, editable details, verification and wallet. */
export default function MyProfile() {
  const { status, data, error, reload, setData } = usePatientResource(() => fetchProfile(), [], {
    fallbackMessage: 'Could not load your profile.',
  });

  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setForm(formFromProfile(data));
  }, [data]);

  const update = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));

  const specializationOptions = useMemo(() => {
    const list = [...specializations];
    if (form.specialization && !list.includes(form.specialization)) list.push(form.specialization);
    return list.map((item) => ({ label: item, value: item }));
  }, [form.specialization]);

  const handleSave = async () => {
    const next = {};
    if (!form.fullName.trim()) next.fullName = 'Full name is required.';
    if (!form.mobileNumber.trim()) next.mobileNumber = 'Mobile number is required.';
    if (!form.specialization.trim()) next.specialization = 'Specialization is required.';
    if (!form.hospitalName.trim()) next.hospitalName = 'Hospital or clinic is required.';

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      const updated = await updateProfile({
        fullName: form.fullName.trim(),
        mobileNumber: form.mobileNumber.trim(),
        specialization: form.specialization,
        hospitalName: form.hospitalName.trim(),
        // A reference only - never a local path or an upload.
        profilePhoto: form.profilePhoto.trim(),
      });
      setData(updated);
      setErrors({});
      toast.success('Your profile has been updated.');
    } catch (requestError) {
      toast.error(apiErrorMessage(requestError, 'Could not update your profile.'));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setForm(formFromProfile(data));
    setErrors({});
    toast('Reverted to your saved details.', { icon: '↩️' });
  };

  const doctor = data;

  return (
    <>
      <PageHeading
        title="My profile"
        subtitle="Review and update your professional identity on MediConsent."
        breadcrumb={[{ label: 'Doctor', to: '/doctor/dashboard' }, { label: 'Profile' }]}
      />

      {status === 'error' && !doctor ? (
        <ErrorState
          title="We could not load your profile"
          message={error}
          onRetry={() => reload()}
        />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-1" title="Professional identity">
              {!doctor ? (
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-3">
                    <Skeleton className="h-16 w-16 rounded-full" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : (
                <>
                  <div className="flex flex-col items-center text-center">
                    <Avatar name={doctor.fullName} src={doctor.profilePhoto || undefined} size="xl" />
                    <h3 className="mt-3 text-lg font-semibold text-navy-900">{doctor.fullName}</h3>
                    <p className="mt-0.5 text-sm text-muted">
                      {doctor.specialization ?? 'Specialization not recorded'}
                    </p>
                    <p className="mt-0.5 text-sm text-muted">
                      {doctor.hospitalName ?? 'No hospital recorded'}
                    </p>
                    <StatusBadge status={doctor.verificationStatus} className="mt-3" />
                  </div>

                  <dl className="mt-5 space-y-3 border-t border-slate-200 pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-sm text-muted">Doctor ID</dt>
                      <dd className="truncate font-mono text-sm font-medium text-navy-900">
                        {doctor.id}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-sm text-muted">Registered since</dt>
                      <dd className="text-sm font-medium text-navy-900">
                        {formatDate(doctor.createdAt)}
                      </dd>
                    </div>
                  </dl>
                </>
              )}
            </Card>

            <Card
              className="lg:col-span-2"
              title="Edit details"
              subtitle="Update the information shown to patients and administrators."
              footer={
                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" onClick={handleReset} disabled={!doctor || saving}>
                    Reset
                  </Button>
                  <Button variant="accent" onClick={handleSave} loading={saving} disabled={!doctor}>
                    Save changes
                  </Button>
                </div>
              }
            >
              {!doctor ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="space-y-2">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full name" htmlFor="profile-name" required error={errors.fullName}>
                    <Input
                      id="profile-name"
                      value={form.fullName}
                      error={Boolean(errors.fullName)}
                      onChange={(event) => update('fullName', event.target.value)}
                    />
                  </Field>

                  <Field
                    label="Email address"
                    htmlFor="profile-email"
                    hint="Email is your sign-in identity and cannot be changed here."
                  >
                    <Input id="profile-email" type="email" icon={Mail} value={doctor.email ?? ''} disabled readOnly />
                  </Field>

                  <Field label="Mobile number" htmlFor="profile-phone" required error={errors.mobileNumber}>
                    <Input
                      id="profile-phone"
                      icon={Phone}
                      value={form.mobileNumber}
                      error={Boolean(errors.mobileNumber)}
                      onChange={(event) => update('mobileNumber', event.target.value)}
                    />
                  </Field>

                  <Field
                    label="Medical registration number"
                    htmlFor="profile-registration"
                    hint="This value cannot be edited — it is verified by an administrator."
                  >
                    <Input
                      id="profile-registration"
                      value={doctor.medicalRegistrationNumber ?? ''}
                      disabled
                      readOnly
                    />
                  </Field>

                  <Field
                    label="Specialization"
                    htmlFor="profile-specialization"
                    required
                    error={errors.specialization}
                  >
                    <Select
                      id="profile-specialization"
                      value={form.specialization}
                      error={Boolean(errors.specialization)}
                      options={specializationOptions}
                      placeholder="Select a specialization"
                      onChange={(event) => update('specialization', event.target.value)}
                    />
                  </Field>

                  <Field
                    label="Hospital / clinic"
                    htmlFor="profile-hospital"
                    required
                    error={errors.hospitalName}
                  >
                    <Input
                      id="profile-hospital"
                      icon={Building2}
                      value={form.hospitalName}
                      error={Boolean(errors.hospitalName)}
                      onChange={(event) => update('hospitalName', event.target.value)}
                    />
                  </Field>

                  <Field
                    label="Profile photo URL"
                    htmlFor="profile-photo"
                    className="sm:col-span-2"
                    optional
                    hint="A public http(s) image reference."
                  >
                    <Input
                      id="profile-photo"
                      value={form.profilePhoto}
                      placeholder="https://…"
                      onChange={(event) => update('profilePhoto', event.target.value)}
                    />
                  </Field>
                </div>
              )}
            </Card>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card title="Verification status">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  <BadgeCheck size={20} aria-hidden="true" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-navy-900">
                      {doctor?.verificationStatus === 'verified'
                        ? 'Verified practitioner'
                        : 'Verification pending'}
                    </p>
                    {doctor && <StatusBadge status={doctor.verificationStatus} />}
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    Your medical registration is reviewed and approved by a platform administrator.
                  </p>
                </div>
              </div>

              <ul className="mt-4 space-y-3 border-t border-slate-200 pt-4 text-sm text-slate-600">
                <li className="flex items-start gap-2">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0 text-teal-700" aria-hidden="true" />
                  <span>
                    Administrators verify each doctor's registration number against the medical council
                    records before granting access.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Calendar size={16} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
                  <span>
                    Verification status and account status are read-only — they can only be changed by
                    an administrator.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Info size={16} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
                  <span>
                    Your email, medical registration number and wallet address cannot be changed
                    through the profile form.
                  </span>
                </li>
              </ul>
            </Card>

            <div className="space-y-4">
              <WalletCard />
            </div>
          </div>
        </>
      )}
    </>
  );
}
