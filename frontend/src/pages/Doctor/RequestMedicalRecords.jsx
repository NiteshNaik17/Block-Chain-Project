import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Info,
  Send,
  ShieldCheck,
  UserSearch,
} from 'lucide-react';
import PageHeading from '../../components/common/PageHeading';
import Card from '../../components/common/Card';
import Avatar from '../../components/common/Avatar';
import Button from '../../components/common/Button';
import SearchBar from '../../components/common/SearchBar';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Modal from '../../components/common/Modal';
import StatusBadge from '../../components/common/StatusBadge';
import { TableSkeleton } from '../../components/common/LoadingSkeleton';
import Field from '../../components/forms/Field';
import { Checkbox, Select, Textarea } from '../../components/forms/FormControls';
import usePatientResource from '../../hooks/usePatientResource';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { apiErrorMessage } from '../../services/api';
import {
  REQUEST_CATEGORIES,
  REQUEST_DURATIONS,
  createAccessRequest,
  fetchPatients,
} from '../../services/doctorService';
import { cn } from '../../utils/format';

const STEPS = ['Find patient', 'Select categories', 'Purpose & duration', 'Review'];

const PURPOSE_MIN = 10;

/**
 * Category-first access request flow.
 *
 * A doctor never sees a patient's record list. The doctor states which record
 * CATEGORIES are needed, why, and for how long; the patient then chooses the
 * actual records they are willing to share. Nothing here creates a consent or
 * writes on-chain - that is Phase 9.
 */
export default function RequestMedicalRecords() {
  const location = useLocation();
  const [step, setStep] = useState(1);

  const [query, setQuery] = useState('');
  const [patient, setPatient] = useState(null);
  const [categories, setCategories] = useState([]);
  const [purpose, setPurpose] = useState('');
  const [duration, setDuration] = useState(String(REQUEST_DURATIONS[1].value));
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const [successOpen, setSuccessOpen] = useState(false);

  const search = useDebouncedValue(query, 350);

  const patientFetcher = useCallback(
    () => fetchPatients({ page: 1, limit: 20, search: search ? search.slice(0, 120) : undefined }),
    [search]
  );

  const {
    status: searchStatus,
    data: searchData,
    error: searchError,
    reload: reloadSearch,
  } = usePatientResource(patientFetcher, [patientFetcher], {
    fallbackMessage: 'Could not search patients.',
  });

  const results = searchData?.patients ?? [];

  // A patient selected on the Patients page is carried in via router state.
  useEffect(() => {
    const incoming = location.state?.patient;
    if (incoming) {
      setPatient(incoming);
      setStep(2);
    }
  }, [location.state]);

  const durationLabel =
    REQUEST_DURATIONS.find((entry) => String(entry.value) === duration)?.label ?? '';

  const toggleCategory = (category) => {
    setCategories((previous) =>
      previous.includes(category)
        ? previous.filter((value) => value !== category)
        : [...previous, category]
    );
  };

  const validateStep = (current) => {
    const next = {};
    if (current === 1 && !patient) next.patient = 'Select a patient to continue.';
    if (current === 2 && categories.length === 0)
      next.categories = 'Select at least one record category to request.';
    if (current === 3) {
      if (purpose.trim().length < PURPOSE_MIN)
        next.purpose = `Describe the purpose in at least ${PURPOSE_MIN} characters.`;
      if (!duration) next.duration = 'Choose how long access should remain valid.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const goNext = () => {
    if (validateStep(step)) setStep((current) => Math.min(current + 1, STEPS.length));
  };

  const goBack = () => {
    setErrors({});
    setStep((current) => Math.max(current - 1, 1));
  };

  const resetForm = () => {
    setSuccessOpen(false);
    setStep(1);
    setQuery('');
    setPatient(null);
    setCategories([]);
    setPurpose('');
    setDuration(String(REQUEST_DURATIONS[1].value));
    setErrors({});
    setSubmitted(null);
  };

  const handleSubmit = async () => {
    if (!patient) {
      setStep(1);
      validateStep(1);
      return;
    }
    if (categories.length === 0) {
      setStep(2);
      validateStep(2);
      return;
    }
    if (purpose.trim().length < PURPOSE_MIN) {
      setStep(3);
      validateStep(3);
      return;
    }

    setSubmitting(true);
    try {
      const { request, message } = await createAccessRequest({
        patientId: patient.id,
        categories,
        purpose: purpose.trim(),
        requestedDuration: Number(duration),
      });
      setSubmitted(request);
      setSuccessOpen(true);
      toast.success(message ?? 'Access request submitted.');
    } catch (requestError) {
      toast.error(apiErrorMessage(requestError, 'Could not submit the request.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeading
        title="Request medical records"
        subtitle="Choose a patient, state the record categories you need, and let the patient decide what to share."
        breadcrumb={[{ label: 'Doctor', to: '/doctor/dashboard' }, { label: 'Request records' }]}
      />

      <Card
        footer={
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" icon={ChevronLeft} onClick={goBack} disabled={step === 1}>
              Back
            </Button>
            {step < STEPS.length ? (
              <Button variant="accent" iconRight={ChevronRight} onClick={goNext}>
                Next
              </Button>
            ) : (
              <Button variant="success" icon={Send} onClick={handleSubmit} loading={submitting}>
                Submit request
              </Button>
            )}
          </div>
        }
      >
        <ol className="mb-6 flex flex-wrap items-center gap-y-3">
          {STEPS.map((label, index) => {
            const stepNumber = index + 1;
            const isActive = step === stepNumber;
            const isComplete = step > stepNumber;
            return (
              <li key={label} className="flex items-center">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold',
                      isComplete
                        ? 'bg-teal-600 text-white'
                        : isActive
                          ? 'bg-navy-900 text-white'
                          : 'bg-slate-100 text-slate-500'
                    )}
                  >
                    {isComplete ? <Check size={16} aria-hidden="true" /> : stepNumber}
                  </span>
                  <span
                    className={cn('text-sm font-medium', isActive ? 'text-navy-900' : 'text-muted')}
                  >
                    {label}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <ChevronRight size={16} className="mx-2 text-slate-300" aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ol>

        {step === 1 && (
          <div className="space-y-4">
            <SearchBar
              id="request-patient-search"
              value={query}
              onChange={setQuery}
              placeholder="Search patients by name or email…"
              className="max-w-xl"
            />

            {errors.patient && (
              <p className="error-text" role="alert">
                <UserSearch size={12} aria-hidden="true" />
                {errors.patient}
              </p>
            )}

            {searchStatus === 'error' ? (
              <ErrorState
                title="We could not search the patient directory"
                message={searchError}
                onRetry={() => reloadSearch()}
              />
            ) : searchStatus === 'loading' ? (
              <TableSkeleton rows={3} columns={2} />
            ) : results.length === 0 ? (
              <EmptyState
                icon={UserSearch}
                title="No matching patients"
                description="Try a different name or email address."
              />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {results.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPatient(entry);
                        setErrors({});
                        setStep(2);
                      }}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                        patient?.id === entry.id
                          ? 'border-teal-300 bg-teal-50/60'
                          : 'border-slate-200 hover:bg-slate-50'
                      )}
                    >
                      <Avatar name={entry.fullName} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-navy-900">
                          {entry.fullName}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {entry.ageBand ?? 'Age band not recorded'}
                          {entry.email ? ` · ${entry.email}` : ''}
                        </span>
                      </span>
                      <ChevronRight size={16} className="text-slate-400" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            {patient ? (
              <>
                <div className="rounded-xl2 border border-slate-200 bg-white p-5">
                  <div className="flex items-start gap-4">
                    <Avatar name={patient.fullName} size="lg" />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-semibold text-navy-900">
                        {patient.fullName}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted">
                        {patient.ageBand ?? 'Age band not recorded'}
                        {patient.email ? ` · ${patient.email}` : ''}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setStep(1)}>
                      Change
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-navy-900">
                    Which record categories do you need?
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Choose the types of document required. {patient.fullName} will pick the actual
                    records to share when reviewing your request.
                  </p>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {REQUEST_CATEGORIES.map((category) => (
                      <div
                        key={category}
                        className={cn(
                          'rounded-lg border p-3 transition-colors',
                          categories.includes(category)
                            ? 'border-teal-300 bg-teal-50/50'
                            : 'border-slate-200'
                        )}
                      >
                        <Checkbox
                          id={`category-${category}`}
                          checked={categories.includes(category)}
                          onChange={() => toggleCategory(category)}
                          label={category}
                        />
                      </div>
                    ))}
                  </div>

                  {errors.categories && (
                    <p className="error-text" role="alert">
                      <FileText size={12} aria-hidden="true" />
                      {errors.categories}
                    </p>
                  )}
                </div>

                <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                  <Info size={14} className="mt-px shrink-0" aria-hidden="true" />
                  <p>
                    This directory never lists a patient's records. No document is shared until the
                    patient approves and selects the records themselves.
                  </p>
                </div>
              </>
            ) : (
              <EmptyState
                icon={UserSearch}
                title="No patient selected"
                description="Go back to step 1 and choose a patient to continue."
                action={
                  <Button variant="outline" icon={ChevronLeft} onClick={() => setStep(1)}>
                    Back to search
                  </Button>
                }
              />
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <Field
              label="Purpose of request"
              htmlFor="request-purpose"
              required
              hint={`Explain why these records are needed. Minimum ${PURPOSE_MIN} characters.`}
              error={errors.purpose}
            >
              <Textarea
                id="request-purpose"
                rows={5}
                value={purpose}
                error={Boolean(errors.purpose)}
                placeholder="e.g. Reviewing cardiac function ahead of a scheduled consultation."
                onChange={(event) => setPurpose(event.target.value)}
              />
            </Field>

            <Field
              label="Requested access duration"
              htmlFor="request-duration"
              required
              hint="The duration the patient should consider. On-chain expiry is applied in Phase 9."
              error={errors.duration}
            >
              <Select
                id="request-duration"
                value={duration}
                error={Boolean(errors.duration)}
                options={REQUEST_DURATIONS.map((entry) => ({
                  label: entry.label,
                  value: String(entry.value),
                }))}
                onChange={(event) => setDuration(event.target.value)}
              />
            </Field>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-xl2 border border-slate-200 bg-white p-4">
              <Avatar name={patient?.fullName} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-navy-900">{patient?.fullName}</p>
                <p className="truncate text-xs text-muted">
                  {patient?.ageBand ?? 'Age band not recorded'}
                </p>
              </div>
              <StatusBadge status="Pending" className="ml-auto" />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Categories requested ({categories.length})
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {categories.map((category) => (
                  <span key={category} className="badge bg-slate-100 text-slate-600">
                    {category}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Purpose</p>
              <p className="mt-1 text-sm text-slate-700">{purpose.trim()}</p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Requested access duration
              </p>
              <p className="mt-1 text-sm text-slate-700">{durationLabel}</p>
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2.5 text-xs text-sky-800">
              <ShieldCheck size={14} className="mt-px shrink-0" aria-hidden="true" />
              <p>
                Submitting records your request. The patient will be notified and chooses which of
                their records to share. No consent or blockchain permission is created here.
              </p>
            </div>
          </div>
        )}
      </Card>

      <Modal
        open={successOpen}
        onClose={resetForm}
        title="Request submitted"
        description="Waiting for the patient's decision"
        icon={CheckCircle2}
        iconTone="emerald"
        size="sm"
        footer={
          <Button variant="accent" onClick={resetForm}>
            Done
          </Button>
        }
      >
        <p className="text-sm text-slate-600">
          Your request was recorded and the patient has been notified. No consent or blockchain
          permission was created — on-chain consent arrives in Phase 9.
        </p>

        {submitted && (
          <div className="mt-4 space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-muted">
            <p className="font-mono text-navy-900">{submitted.id}</p>
            <p>{submitted.patient?.fullName ?? patient?.fullName}</p>
            <p>
              {submitted.requestedCategories?.length ?? categories.length} categor(y/ies) ·{' '}
              {submitted.requestedDuration ?? Number(duration)}-day access requested
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
