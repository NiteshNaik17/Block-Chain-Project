import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info, Send, ShieldCheck, UserSearch } from 'lucide-react';
import PageHeading from '../../components/common/PageHeading';
import Card from '../../components/common/Card';
import Avatar from '../../components/common/Avatar';
import Button from '../../components/common/Button';
import SearchBar from '../../components/common/SearchBar';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Modal from '../../components/common/Modal';
import Pagination from '../../components/tables/Pagination';
import { TableSkeleton } from '../../components/common/LoadingSkeleton';
import usePatientResource from '../../hooks/usePatientResource';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { fetchPatients } from '../../services/doctorService';
import { formatDate } from '../../utils/format';

const PAGE_SIZE = 9;

/** Non-clinical identifying details only - never a clinical field. */
function PatientDetails({ patient }) {
  const rows = [
    { label: 'Full name', value: patient.fullName },
    { label: 'Email', value: patient.email ?? 'Not recorded', mono: false },
    { label: 'Age band', value: patient.ageBand ?? 'Not recorded' },
    {
      label: 'Registered',
      value: patient.registeredAt ? formatDate(patient.registeredAt) : '—',
    },
  ];

  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="rounded-lg bg-slate-50 px-3 py-2.5">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{row.label}</dt>
          <dd className="mt-0.5 text-sm font-medium text-navy-900">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Privacy-preserving patient lookup.
 * The directory returns identifying information only - never documents,
 * diagnoses or any clinical detail. Selecting a patient carries them into the
 * request form; the patient then decides what to share.
 */
export default function Patients() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState(null);

  const search = useDebouncedValue(query, 350);

  const onSearch = (value) => {
    setQuery(value);
    setPage(1);
  };

  const fetcher = useCallback(
    () => fetchPatients({ page, limit: PAGE_SIZE, search: search ? search.slice(0, 120) : undefined }),
    [page, search]
  );

  const { status, data, error, reload } = usePatientResource(fetcher, [fetcher], {
    fallbackMessage: 'Could not load the patient directory.',
  });

  const patients = data?.patients ?? [];
  const pagination = data?.pagination;

  const handleSelect = (patient) => {
    navigate('/doctor/request-records', { state: { patient } });
  };

  return (
    <>
      <PageHeading
        title="Find a patient"
        subtitle="Locate a patient to send a record request."
        breadcrumb={[{ label: 'Doctor', to: '/doctor/dashboard' }, { label: 'Patients' }]}
      />

      <div className="mb-6 flex items-start gap-3 rounded-xl2 border border-teal-200 bg-teal-50/70 p-4 text-sm text-teal-900">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-teal-700" aria-hidden="true" />
        <p>
          You can search for a patient by name or email. Documents and clinical data stay hidden
          until the patient grants consent for a specific request.
        </p>
      </div>

      <Card bodyClassName="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchBar
            id="patient-search"
            value={query}
            onChange={onSearch}
            placeholder="Search by patient name or email…"
            className="sm:max-w-md sm:flex-1"
          />
          <span className="text-sm text-muted sm:ml-auto">
            {pagination ? `${pagination.total} patient(s)` : 'Directory'}
          </span>
        </div>
      </Card>

      {status === 'error' ? (
        <Card className="mt-6" bodyClassName="p-0">
          <ErrorState
            title="We could not load the patient directory"
            message={error}
            onRetry={() => reload()}
          />
        </Card>
      ) : status === 'loading' ? (
        <Card className="mt-6" bodyClassName="p-0">
          <TableSkeleton rows={4} columns={3} />
        </Card>
      ) : patients.length === 0 ? (
        <Card className="mt-6">
          <EmptyState
            icon={UserSearch}
            title="No matching patients"
            description="Try a different name or email address."
          />
        </Card>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {patients.map((patient) => (
              <Card key={patient.id} hover bodyClassName="flex h-full flex-col p-5">
                <div className="flex items-start gap-3">
                  <Avatar name={patient.fullName} size="lg" />
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-navy-900">
                      {patient.fullName}
                    </h3>
                    {patient.email && (
                      <p className="mt-0.5 truncate text-xs text-muted">{patient.email}</p>
                    )}
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-xs text-muted">Age band</dt>
                    <dd className="mt-0.5 text-sm font-medium text-navy-900">
                      {patient.ageBand ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Registered</dt>
                    <dd className="mt-0.5 text-sm font-medium text-navy-900">
                      {patient.registeredAt ? formatDate(patient.registeredAt) : '—'}
                    </dd>
                  </div>
                </dl>

                <div className="mt-5 flex flex-wrap gap-2 pt-1">
                  <Button variant="accent" size="sm" icon={Send} onClick={() => handleSelect(patient)}>
                    Select patient
                  </Button>
                  <Button variant="outline" size="sm" icon={UserSearch} onClick={() => setPreview(patient)}>
                    View details
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          <Card className="mt-4" bodyClassName="p-0">
            <Pagination pagination={pagination} onPageChange={setPage} itemLabel="patient" />
          </Card>
        </>
      )}

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.fullName}
        description="Identifying information only"
        icon={UserSearch}
        iconTone="teal"
        footer={
          <>
            <Button variant="outline" onClick={() => setPreview(null)}>
              Close
            </Button>
            <Button
              variant="accent"
              icon={Send}
              onClick={() => {
                const current = preview;
                setPreview(null);
                if (current) handleSelect(current);
              }}
            >
              Select this patient
            </Button>
          </>
        }
      >
        {preview && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar name={preview.fullName} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-navy-900">{preview.fullName}</p>
                {preview.email && <p className="truncate text-xs text-muted">{preview.email}</p>}
              </div>
            </div>

            <PatientDetails patient={preview} />

            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              <Info size={14} className="mt-px shrink-0" aria-hidden="true" />
              <p>
                Consent is required for any record access. No medical documents or clinical details
                are exposed in this directory.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
