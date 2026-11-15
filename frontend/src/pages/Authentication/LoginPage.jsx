import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Info, LogIn, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import AuthLayout from '../../layouts/AuthLayout';
import Field from '../../components/forms/Field';
import { Checkbox, Input } from '../../components/forms/FormControls';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import { useAuth } from '../../context/AuthContext';
import { apiErrorMessage, fieldErrorsFrom } from '../../services/api';
import { roleHomePath } from '../../utils/roles';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const update = (key) => (value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  };

  const validate = () => {
    const next = {};
    if (!form.email.trim()) next.email = 'Email address is required.';
    else if (!EMAIL_PATTERN.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (!form.password) next.password = 'Password is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting || !validate()) return;

    setSubmitting(true);
    try {
      const signedIn = await login({ email: form.email.trim(), password: form.password });

      // The redirect target comes from the role the backend reported, not from
      // anything the browser supplied. A pending doctor lands on their status page.
      toast.success('Signed in successfully.');
      navigate(roleHomePath(signedIn), { replace: true });
    } catch (error) {
      const fieldErrors = fieldErrorsFrom(error);
      if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);
      toast.error(apiErrorMessage(error, 'Unable to sign in. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to manage your medical records and consent decisions."
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link to="/register/patient" className="link">
            Register as a patient
          </Link>{' '}
          or{' '}
          <Link to="/register/doctor" className="link">
            as a doctor
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <Field label="Email address" htmlFor="login-email" required error={errors.email}>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={form.email}
            error={Boolean(errors.email)}
            onChange={(event) => update('email')(event.target.value)}
          />
        </Field>

        <Field label="Password" htmlFor="login-password" required error={errors.password}>
          <div className="relative">
            <Input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter your password"
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
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Checkbox
            id="remember-me"
            label="Remember me"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          <button type="button" onClick={() => setForgotOpen(true)} className="link text-sm">
            Forgot password?
          </button>
        </div>

        <Button type="submit" variant="primary" size="lg" fullWidth icon={LogIn} loading={submitting}>
          Sign in
        </Button>
      </form>

      <div className="mt-5 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-muted">
        <ShieldCheck size={13} className="shrink-0 text-teal-600" aria-hidden="true" />
        Passwords are hashed with bcrypt and the session is issued as a signed JWT in an HttpOnly
        cookie — it is never stored in JavaScript or localStorage.
      </div>

      <Modal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        title="Password recovery"
        description="Not available yet."
        icon={Info}
        iconTone="amber"
        size="sm"
        footer={
          <Button variant="outline" onClick={() => setForgotOpen(false)}>
            Close
          </Button>
        }
      >
        <p className="text-sm leading-relaxed text-slate-600">
          Password recovery requires email delivery and a verification-token service, neither of
          which exists yet. Nothing is sent when you use this link — the real reset flow is planned
          for a later phase.
        </p>
      </Modal>
    </AuthLayout>
  );
}
