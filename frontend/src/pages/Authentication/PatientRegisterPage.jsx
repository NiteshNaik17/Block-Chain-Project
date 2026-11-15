import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Eye, EyeOff, ShieldCheck, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import AuthLayout from '../../layouts/AuthLayout';
import Field from '../../components/forms/Field';
import { Checkbox, Input } from '../../components/forms/FormControls';
import Button from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';
import { apiErrorMessage, fieldErrorsFrom } from '../../services/api';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_PATTERN = /^\+?[0-9][0-9\s\-()]{6,19}$/;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/;

/** Backend field name -> form field name. */
const FIELD_MAP = { mobileNumber: 'mobile' };

const EMPTY = {
  fullName: '',
  email: '',
  mobile: '',
  password: '',
  confirmPassword: '',
};

export default function PatientRegisterPage() {
  const navigate = useNavigate();
  const { registerPatient } = useAuth();

  const [form, setForm] = useState(EMPTY);
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

    if (!form.password) next.password = 'Password is required.';
    else if (!PASSWORD_PATTERN.test(form.password))
      next.password =
        'Use 8–72 characters with an uppercase letter, a lowercase letter and a number.';

    if (!form.confirmPassword) next.confirmPassword = 'Please confirm your password.';
    else if (form.confirmPassword !== form.password)
      next.confirmPassword = 'Passwords do not match.';

    if (!accepted) next.accepted = 'Please accept the consent and privacy terms.';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting || !validate()) return;

    setSubmitting(true);
    try {
      await registerPatient({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        mobileNumber: form.mobile.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
      });

      // Registration issues the session cookie straight away, so the new
      // patient is signed in and can continue to their portal.
      toast.success('Patient account created — you are now signed in.');
      navigate('/patient/dashboard', { replace: true });
    } catch (error) {
      const backendErrors = fieldErrorsFrom(error);
      const mapped = {};
      for (const [field, message] of Object.entries(backendErrors)) {
        mapped[FIELD_MAP[field] ?? field] = message;
      }
      if (error?.response?.data?.code === 'EMAIL_IN_USE') {
        mapped.email = error.response.data.message;
      }
      setErrors(mapped);
      toast.error(apiErrorMessage(error, 'Unable to create your account. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const passwordStrength = (() => {
    const value = form.password;
    if (!value) return null;
    let score = 0;
    if (value.length >= 8) score += 1;
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
    if (/\d/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;
    if (score <= 1) return { label: 'Weak', tone: 'bg-red-500', width: 'w-1/4' };
    if (score === 2) return { label: 'Fair', tone: 'bg-amber-500', width: 'w-2/4' };
    if (score === 3) return { label: 'Good', tone: 'bg-teal-500', width: 'w-3/4' };
    return { label: 'Strong', tone: 'bg-emerald-500', width: 'w-full' };
  })();

  return (
    <AuthLayout
      title="Create your patient account"
      subtitle="Store your medical records securely and decide who can access them."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="link">
            Sign in
          </Link>
          . Registering as a clinician?{' '}
          <Link to="/register/doctor" className="link">
            Doctor registration
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <Field label="Full name" htmlFor="patient-name" required error={errors.fullName}>
          <Input
            id="patient-name"
            type="text"
            autoComplete="name"
            placeholder="e.g. Ananya Sharma"
            value={form.fullName}
            error={Boolean(errors.fullName)}
            onChange={(event) => update('fullName')(event.target.value)}
          />
        </Field>

        <Field label="Email address" htmlFor="patient-email" required error={errors.email}>
          <Input
            id="patient-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={form.email}
            error={Boolean(errors.email)}
            onChange={(event) => update('email')(event.target.value)}
          />
        </Field>

        <Field
          label="Mobile number"
          htmlFor="patient-mobile"
          required
          hint="Used for security alerts about record access."
          error={errors.mobile}
        >
          <Input
            id="patient-mobile"
            type="tel"
            autoComplete="tel"
            placeholder="+91 98200 41235"
            value={form.mobile}
            error={Boolean(errors.mobile)}
            onChange={(event) => update('mobile')(event.target.value)}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="patient-password"
          required
          hint="8–72 characters with an uppercase letter, a lowercase letter and a number."
          error={errors.password}
        >
          <div className="relative">
            <Input
              id="patient-password"
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

          {passwordStrength && (
            <div className="mt-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full transition-all duration-200 ${passwordStrength.tone} ${passwordStrength.width}`}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted">
                Password strength: <span className="font-medium">{passwordStrength.label}</span>
              </p>
            </div>
          )}
        </Field>

        <Field
          label="Confirm password"
          htmlFor="patient-confirm"
          required
          error={errors.confirmPassword}
        >
          <div className="relative">
            <Input
              id="patient-confirm"
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

        <div>
          <Checkbox
            id="patient-terms"
            label="I agree to the consent and privacy terms"
            description="You will always be asked before any doctor can access a record."
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

        <Button type="submit" variant="accent" size="lg" fullWidth icon={UserPlus} loading={submitting}>
          Create patient account
        </Button>
      </form>

      <div className="mt-6 flex items-start gap-2.5 rounded-xl2 border border-teal-200 bg-teal-50 px-4 py-3 text-xs text-teal-900">
        <ShieldCheck size={15} className="mt-px shrink-0 text-teal-700" aria-hidden="true" />
        <span>
          Your password is hashed with bcrypt before it is stored and is never saved or returned in
          plain text. Signing in issues a signed JWT in an HttpOnly cookie.
        </span>
      </div>
    </AuthLayout>
  );
}
