import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BadgeCheck,
  Clock,
  Eye,
  EyeOff,
  Lock,
  Stethoscope,
  Upload,
} from 'lucide-react';
import toast from 'react-hot-toast';
import AuthLayout from '../../layouts/AuthLayout';
import Field from '../../components/forms/Field';
import { Checkbox, Input, Select } from '../../components/forms/FormControls';
import FileUpload from '../../components/forms/FileUpload';
import Button from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';
import { apiErrorMessage, fieldErrorsFrom } from '../../services/api';
import { uploadCertificate } from '../../services/doctorService';
import { specializations } from '../../data/doctorData';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_PATTERN = /^\+?[0-9][0-9\s\-()]{6,19}$/;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/;

/** Backend field name -> form field name. */
const FIELD_MAP = {
  mobileNumber: 'mobile',
  medicalRegistrationNumber: 'registrationNumber',
  hospitalName: 'hospital',
};

const EMPTY = {
  fullName: '',
  email: '',
  mobile: '',
  registrationNumber: '',
  specialization: '',
  hospital: '',
  password: '',
  confirmPassword: '',
};

const SPECIALIZATION_OPTIONS = specializations.map((value) => ({ label: value, value }));

export default function DoctorRegisterPage() {
  const navigate = useNavigate();
  const { registerDoctor } = useAuth();

  const [form, setForm] = useState(EMPTY);
  const [certificate, setCertificate] = useState(null);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const update = (key) => (value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  };

  const validate = () => {
    const next = {};

    if (!form.fullName.trim()) next.fullName = 'Full name is required.';
    else if (form.fullName.trim().length < 3) next.fullName = 'Enter your full name.';

    if (!form.email.trim()) next.email = 'Email address is required.';
    else if (!EMAIL_PATTERN.test(form.email.trim())) next.email = 'Enter a valid email address.';

    if (!form.mobile.trim()) next.mobile = 'Mobile number is required.';
    else if (!MOBILE_PATTERN.test(form.mobile.trim()))
      next.mobile = 'Enter a valid mobile number.';

    if (!form.registrationNumber.trim())
      next.registrationNumber = 'Medical registration number is required.';
    else if (form.registrationNumber.trim().length < 5)
      next.registrationNumber = 'Enter the full registration number issued by your council.';

    if (!form.specialization) next.specialization = 'Select your specialization.';

    if (!form.hospital.trim()) next.hospital = 'Hospital or clinic name is required.';

    if (!form.password) next.password = 'Password is required.';
    else if (!PASSWORD_PATTERN.test(form.password))
      next.password =
        'Use 8–72 characters with an uppercase letter, a lowercase letter and a number.';

    if (!form.confirmPassword) next.confirmPassword = 'Please confirm your password.';
    else if (form.confirmPassword !== form.password)
      next.confirmPassword = 'Passwords do not match.';

    if (!certificate) next.certificate = 'Select your medical registration certificate.';
    if (!accepted) next.accepted = 'Please confirm the declaration.';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting || !validate()) return;

    setSubmitting(true);
    try {
      await registerDoctor({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        mobileNumber: form.mobile.trim(),
        medicalRegistrationNumber: form.registrationNumber.trim(),
        specialization: form.specialization,
        hospitalName: form.hospital.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
      });

      if (certificate) {
        try {
          await uploadCertificate(certificate);
        } catch {
          // If upload fails, doctor is still registered and can re-upload from pending verification
        }
      }

      toast.success('Application submitted — an administrator will review it shortly.');
      navigate('/doctor/pending-verification', { replace: true });
    } catch (error) {
      const backendErrors = fieldErrorsFrom(error);
      const mapped = {};
      for (const [field, message] of Object.entries(backendErrors)) {
        mapped[FIELD_MAP[field] ?? field] = message;
      }
      const code = error?.response?.data?.code;
      if (code === 'EMAIL_IN_USE') mapped.email = error.response.data.message;
      if (code === 'REGISTRATION_NUMBER_IN_USE') {
        mapped.registrationNumber = error.response.data.message;
      }
      setErrors(mapped);
      toast.error(apiErrorMessage(error, 'Unable to submit your application. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Register as a doctor"
      subtitle="Request access to patient records with a verifiable consent trail."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="link">
            Sign in
          </Link>
          . Registering as a patient?{' '}
          <Link to="/register/patient" className="link">
            Patient registration
          </Link>
        </>
      }
    >
      <div className="mb-6 flex items-start gap-3 rounded-xl2 border border-amber-200 bg-amber-50 px-4 py-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-amber-600">
          <Clock size={17} aria-hidden="true" />
        </span>
        <div className="text-xs leading-relaxed text-amber-800">
          <span className="block text-sm font-semibold text-amber-900">Pending Verification</span>
          Every doctor account is reviewed by an administrator. Until your registration number is
          verified you cannot request or open patient records.
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <Field label="Full name" htmlFor="doctor-name" required error={errors.fullName}>
          <Input
            id="doctor-name"
            type="text"
            autoComplete="name"
            placeholder="e.g. Dr. Rohan Mehta"
            value={form.fullName}
            error={Boolean(errors.fullName)}
            onChange={(event) => update('fullName')(event.target.value)}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Email address" htmlFor="doctor-email" required error={errors.email}>
            <Input
              id="doctor-email"
              type="email"
              autoComplete="email"
              placeholder="you@hospital.com"
              value={form.email}
              error={Boolean(errors.email)}
              onChange={(event) => update('email')(event.target.value)}
            />
          </Field>

          <Field label="Mobile number" htmlFor="doctor-mobile" required error={errors.mobile}>
            <Input
              id="doctor-mobile"
              type="tel"
              autoComplete="tel"
              placeholder="+91 98195 77342"
              value={form.mobile}
              error={Boolean(errors.mobile)}
              onChange={(event) => update('mobile')(event.target.value)}
            />
          </Field>
        </div>

        <Field
          label="Medical registration number"
          htmlFor="doctor-registration"
          required
          hint="Exactly as printed on your council registration certificate."
          error={errors.registrationNumber}
        >
          <Input
            id="doctor-registration"
            type="text"
            placeholder="MCI-2016-44821"
            className="font-mono"
            value={form.registrationNumber}
            error={Boolean(errors.registrationNumber)}
            onChange={(event) => update('registrationNumber')(event.target.value)}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Specialization" htmlFor="doctor-specialization" required error={errors.specialization}>
            <Select
              id="doctor-specialization"
              placeholder="Select a specialization"
              required
              options={SPECIALIZATION_OPTIONS}
              value={form.specialization}
              error={Boolean(errors.specialization)}
              onChange={(event) => update('specialization')(event.target.value)}
            />
          </Field>

          <Field label="Hospital / Clinic name" htmlFor="doctor-hospital" required error={errors.hospital}>
            <Input
              id="doctor-hospital"
              type="text"
              placeholder="Sunrise Multispeciality Hospital"
              value={form.hospital}
              error={Boolean(errors.hospital)}
              onChange={(event) => update('hospital')(event.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Password"
            htmlFor="doctor-password"
            required
            hint="8–72 characters with upper case, lower case and a number."
            error={errors.password}
          >
            <div className="relative">
              <Input
                id="doctor-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Create a password"
                className="pr-10"
                value={form.password}
                error={Boolean(errors.password)}
                onChange={(event) => update('password')(event.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((previous) => !previous)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>

          <Field
            label="Confirm password"
            htmlFor="doctor-confirm"
            required
            error={errors.confirmPassword}
          >
            <div className="relative">
              <Input
                id="doctor-confirm"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Re-enter your password"
                className="pr-10"
                value={form.confirmPassword}
                error={Boolean(errors.confirmPassword)}
                onChange={(event) => update('confirmPassword')(event.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((previous) => !previous)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>
        </div>

        <div className="rounded-xl2 border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-start gap-2.5">
            <Lock size={15} className="mt-px shrink-0 text-teal-600" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-slate-600">
              <strong className="font-semibold text-slate-700">
                Encrypted Certificate Storage:
              </strong>{' '}
              Your certificate will be encrypted with AES-256-GCM and verified with SHA-256 integrity for administrator review.
            </p>
          </div>

          <FileUpload
            id="doctor-certificate"
            label="Medical registration certificate"
            accept=".pdf,.jpg,.jpeg,.png"
            value={certificate}
            onChange={(file) => {
              setCertificate(file);
              setErrors((previous) => ({ ...previous, certificate: undefined }));
            }}
            onRemove={() => setCertificate(null)}
            required
            maxSizeMB={5}
            error={errors.certificate}
            hint="PDF or image, up to 5 MB. Preview only — no upload occurs in this phase."
          />
        </div>

        <div>
          <Checkbox
            id="doctor-declaration"
            label="I declare that the information above is accurate"
            description="Providing false registration details will result in permanent removal."
            checked={accepted}
            onChange={(event) => {
              setAccepted(event.target.checked);
              setErrors((previous) => ({ ...previous, accepted: undefined }));
            }}
          />
          {errors.accepted && (
            <p className="error-text" role="alert">
              <AlertTriangle size={12} aria-hidden="true" />
              {errors.accepted}
            </p>
          )}
        </div>

        <Button
          type="submit"
          variant="accent"
          size="lg"
          fullWidth
          icon={Stethoscope}
          loading={submitting}
        >
          Submit for verification
        </Button>
      </form>

      <div className="mt-6 flex items-start gap-2.5 rounded-xl2 border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <Upload size={15} className="mt-px shrink-0 text-slate-400" aria-hidden="true" />
        <span>
          Your account is created with a <strong className="font-semibold text-slate-700">pending</strong>{' '}
          verification status. You can sign in to track your application, but patient records stay
          locked until an administrator approves it.
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-[11px] text-muted ring-1 ring-inset ring-slate-200">
        <BadgeCheck size={13} className="shrink-0 text-teal-600" aria-hidden="true" />
        Verified doctors are listed in the admin portal under “Verify Doctors”.
      </div>
    </AuthLayout>
  );
}
