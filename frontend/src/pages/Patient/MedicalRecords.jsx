import { useCallback, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Download,
  Eye,
  FileText,
  Info,
  Lock,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import PageHeading from '../../components/common/PageHeading';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import SearchBar from '../../components/common/SearchBar';
import FilterDropdown from '../../components/common/FilterDropdown';
import Modal from '../../components/common/Modal';
import DataTable from '../../components/tables/DataTable';
import Pagination from '../../components/tables/Pagination';
import Field from '../../components/forms/Field';
import FileUpload from '../../components/forms/FileUpload';
import { Input, Select, Textarea } from '../../components/forms/FormControls';
import usePatientResource from '../../hooks/usePatientResource';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import {
  RECORD_CATEGORIES,
  ENCRYPTION_STATUS_LABELS,
  ENCRYPTION_STATUS_TONES,
  INTEGRITY_STATUS_LABELS,
  INTEGRITY_STATUS_TONES,
  RECORD_STATUS_LABELS,
  RECORD_STATUS_TONES,
  fetchRecords,
  uploadMedicalRecord,
  downloadMedicalRecord,
} from '../../services/patientService';
import { formatDate, formatFileSize } from '../../utils/format';

const PAGE_SIZE = 10;

const RECORD_STATUS_OPTIONS = [
  { label: 'Active', value: 'active' },
  { label: 'Archived', value: 'archived' },
];

const SORT_OPTIONS = [
  { label: 'Newest report date', value: 'reportDate:desc' },
  { label: 'Oldest report date', value: 'reportDate:asc' },
  { label: 'Recently uploaded', value: 'createdAt:desc' },
  { label: 'Oldest upload', value: 'createdAt:asc' },
];

const EMPTY_FORM = {
  title: '',
  category: '',
  hospital: '',
  doctor: '',
  reportDate: '',
  description: '',
  file: null,
};

const UPLOAD_FORM_ID = 'upload-record-form';

export default function MedicalRecords() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState('reportDate:desc');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [formErrors, setFormErrors] = useState({});

  const [previewRecord, setPreviewRecord] = useState(null);

  const debouncedSearch = useDebouncedValue(search);
  const [sortBy, sortOrder] = sort.split(':');

  const fetcher = useCallback(
    () =>
      fetchRecords({
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch.trim() || undefined,
        category: category === 'all' ? undefined : category,
        status: status === 'all' ? undefined : status,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        sortBy,
        sortOrder,
      }),
    [page, debouncedSearch, category, status, dateFrom, dateTo, sortBy, sortOrder]
  );

  const { status: loadStatus, data, error, reload } = usePatientResource(fetcher, [fetcher], {
    fallbackMessage: 'Could not load your medical records.',
  });

  const records = data?.records ?? [];
  const pagination = data?.pagination;

  const handleDownload = async (record) => {
    if (!record || downloadingId) return;
    setDownloadingId(record.id);
    try {
      await downloadMedicalRecord(record.id, record.fileName || `${record.recordTitle}.pdf`);
      toast.success(`Downloaded: ${record.recordTitle}`);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Could not download document.';
      toast.error(msg);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleUploadSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const errors = {};
    const trimmedTitle = form.title.trim();
    if (!trimmedTitle) {
      errors.title = 'Record title is required.';
    } else if (trimmedTitle.length < 3) {
      errors.title = 'Record title must be at least 3 characters.';
    }

    if (!form.category) {
      errors.category = 'Please select a category.';
    }

    const trimmedHospital = form.hospital.trim();
    if (!trimmedHospital) {
      errors.hospital = 'Hospital or clinic name is required.';
    }

    if (!form.reportDate) {
      errors.reportDate = 'Report date is required.';
    }

    if (!form.file) {
      errors.file = 'Please select a medical document to upload.';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSubmitting(true);
    setFormErrors({});

    try {
      const formData = new FormData();
      formData.append('recordTitle', trimmedTitle);
      formData.append('category', form.category);
      formData.append('hospitalName', trimmedHospital);
      if (form.doctor.trim()) formData.append('doctorName', form.doctor.trim());
      formData.append('reportDate', form.reportDate);
      if (form.description.trim()) formData.append('description', form.description.trim());
      formData.append('file', form.file);

      await uploadMedicalRecord(formData);
      toast.success('Medical document encrypted with AES-256-GCM and stored securely.');
      setUploadOpen(false);
      setForm(EMPTY_FORM);
      reload();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to upload medical record.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Changing any filter always returns the patient to the first page.
  const onSearch = (value) => {
    setSearch(value);
    setPage(1);
  };
  const onCategory = (value) => {
    setCategory(value);
    setPage(1);
  };
  const onStatus = (value) => {
    setStatus(value);
    setPage(1);
  };
  const onSort = (value) => {
    setSort(value);
    setPage(1);
  };

  const setField = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));

  const columns = useMemo(
    () => [
      {
        key: 'recordTitle',
        header: 'Record Title',
        render: (record) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-navy-900">{record.recordTitle}</p>
            <p className="text-xs text-muted">
              {record.mimeType ?? 'Unknown type'} · {formatFileSize(record.fileSize)}
            </p>
          </div>
        ),
      },
      {
        key: 'category',
        header: 'Category',
        render: (record) => (
          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
            {record.category}
          </span>
        ),
      },
      {
        key: 'hospitalName',
        header: 'Hospital / Clinic',
        render: (record) => <span className="text-sm">{record.hospitalName ?? '—'}</span>,
      },
      {
        key: 'doctorName',
        header: 'Doctor',
        render: (record) => <span className="text-sm">{record.doctorName ?? '—'}</span>,
      },
      {
        key: 'reportDate',
        header: 'Report Date',
        render: (record) => formatDate(record.reportDate),
      },
      {
        key: 'uploadedAt',
        header: 'Upload Date',
        render: (record) => formatDate(record.uploadedAt),
      },
      {
        key: 'encryptionStatus',
        header: 'Encryption',
        render: (record) => (
          <StatusBadge
            status={record.encryptionStatus}
            tone={ENCRYPTION_STATUS_TONES[record.encryptionStatus]}
          >
            {ENCRYPTION_STATUS_LABELS[record.encryptionStatus] ?? record.encryptionStatus}
          </StatusBadge>
        ),
      },
      {
        key: 'integrityStatus',
        header: 'Integrity',
        render: (record) => (
          <StatusBadge
            status={record.integrityStatus}
            tone={INTEGRITY_STATUS_TONES[record.integrityStatus]}
          >
            {INTEGRITY_STATUS_LABELS[record.integrityStatus] ?? record.integrityStatus}
          </StatusBadge>
        ),
      },
      {
        key: 'recordStatus',
        header: 'Status',
        render: (record) => (
          <StatusBadge status={record.recordStatus} tone={RECORD_STATUS_TONES[record.recordStatus]}>
            {RECORD_STATUS_LABELS[record.recordStatus] ?? record.recordStatus}
          </StatusBadge>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        align: 'right',
        render: (record) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              icon={Eye}
              aria-label={`View details for ${record.recordTitle}`}
              title="View record metadata"
              onClick={() => setPreviewRecord(record)}
            />
            <Button
              variant="ghost"
              size="sm"
              icon={Download}
              loading={downloadingId === record.id}
              disabled={Boolean(downloadingId)}
              aria-label={`Download ${record.recordTitle}`}
              title="Download decrypted document"
              onClick={() => handleDownload(record)}
            />
          </div>
        ),
      },
    ],
    [downloadingId]
  );

  return (
    <div className="space-y-6">
      <PageHeading
        title="Medical Records"
        subtitle="The medical documents stored against your account. Access is always controlled by you."
        actions={
          <Button
            variant="accent"
            icon={Upload}
            onClick={() => {
              setFormErrors({});
              setForm(EMPTY_FORM);
              setUploadOpen(true);
            }}
          >
            Upload Medical Record
          </Button>
        }
      />

      <div className="flex items-start gap-3 rounded-xl2 border border-teal-200 bg-teal-50 px-4 py-3.5">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-teal-700" aria-hidden="true" />
        <p className="text-sm text-teal-900">
          <span className="font-semibold">AES-256-GCM Zero-Knowledge Storage:</span> Every medical document is encrypted in memory before disk write with a unique 12-byte IV. Plaintext never touches disk, and SHA-256 integrity is re-verified before streaming on download.
        </p>
      </div>

      <Card bodyClassName="p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <SearchBar
            id="records-search"
            value={search}
            onChange={onSearch}
            placeholder="Search by record title or hospital…"
            className="xl:max-w-sm xl:flex-1"
          />

          <div className="flex flex-wrap items-center gap-2">
            <FilterDropdown
              id="records-category"
              label="Category"
              value={category}
              onChange={onCategory}
              allLabel="All categories"
              options={RECORD_CATEGORIES.map((item) => ({ label: item, value: item }))}
            />
            <FilterDropdown
              id="records-status"
              label="Status"
              value={status}
              onChange={onStatus}
              allLabel="All statuses"
              options={RECORD_STATUS_OPTIONS}
            />
            <FilterDropdown
              id="records-sort"
              label="Sort records"
              value={sort}
              onChange={onSort}
              allLabel={null}
              icon={null}
              options={SORT_OPTIONS}
            />

            <div className="flex items-center gap-2">
              <input
                type="date"
                className="input w-auto py-2 text-sm"
                aria-label="Report date from"
                value={dateFrom}
                onChange={(event) => {
                  setDateFrom(event.target.value);
                  setPage(1);
                }}
              />
              <span className="text-xs text-muted">to</span>
              <input
                type="date"
                className="input w-auto py-2 text-sm"
                aria-label="Report date to"
                value={dateTo}
                onChange={(event) => {
                  setDateTo(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="All Records"
        subtitle={pagination ? `${pagination.total} record(s)` : 'Your records'}
        bodyClassName="p-0"
      >
        {loadStatus === 'error' ? (
          <ErrorState
            title="We could not load your medical records"
            message={error}
            onRetry={() => reload()}
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              data={records}
              keyField="id"
              loading={loadStatus === 'loading'}
              skeletonRows={6}
              empty={
                <EmptyState
                  icon={FileText}
                  title="No medical records found"
                  description={
                    search || category !== 'all' || status !== 'all' || dateFrom || dateTo
                      ? 'No records match your search and filters. Try clearing them.'
                      : 'Secure uploads open in Phase 8, so your vault is empty for now.'
                  }
                />
              }
            />
            {loadStatus === 'ready' && (
              <Pagination pagination={pagination} onPageChange={setPage} itemLabel="record" />
            )}
          </>
        )}
      </Card>

      {/* Upload Modal */}
      <Modal
        open={uploadOpen}
        onClose={() => !submitting && setUploadOpen(false)}
        title="Upload Medical Record"
        description="Encrypted with AES-256-GCM and verified with SHA-256 integrity."
        icon={Upload}
        iconTone="teal"
        size="lg"
        footer={
          <>
            <Button variant="outline" disabled={submitting} onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form={UPLOAD_FORM_ID}
              variant="accent"
              icon={Upload}
              loading={submitting}
            >
              {submitting ? 'Encrypting & uploading…' : 'Upload record'}
            </Button>
          </>
        }
      >
        <div className="mb-4 flex items-start gap-3 rounded-xl2 border border-teal-200 bg-teal-50 px-4 py-3">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-teal-700" aria-hidden="true" />
          <p className="text-xs text-teal-900">
            Plaintext never touches persistent disk. Your file will be hashed with SHA-256, encrypted with AES-256-GCM using a unique IV, and stored in a private directory.
          </p>
        </div>

        <form id={UPLOAD_FORM_ID} onSubmit={handleUploadSubmit} className="space-y-4">
          <Field label="Record Title" htmlFor="record-title" error={formErrors.title} required>
            <Input
              id="record-title"
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
              disabled={submitting}
              placeholder="e.g. Complete Blood Count Report"
            />
          </Field>

          <Field label="Category" htmlFor="record-category" error={formErrors.category} required>
            <Select
              id="record-category"
              value={form.category}
              onChange={(event) => setField('category', event.target.value)}
              disabled={submitting}
              placeholder="Select a category"
              options={RECORD_CATEGORIES.map((item) => ({ label: item, value: item }))}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Hospital / Clinic" htmlFor="record-hospital" error={formErrors.hospital} required>
              <Input
                id="record-hospital"
                value={form.hospital}
                onChange={(e) => setField('hospital', e.target.value)}
                disabled={submitting}
                placeholder="e.g. Sunrise Multispeciality Hospital"
              />
            </Field>
            <Field label="Doctor Name" htmlFor="record-doctor" optional>
              <Input
                id="record-doctor"
                value={form.doctor}
                onChange={(e) => setField('doctor', e.target.value)}
                disabled={submitting}
                placeholder="e.g. Dr. Rohan Mehta"
              />
            </Field>
          </div>

          <Field label="Report Date" htmlFor="record-date" error={formErrors.reportDate} required>
            <Input
              id="record-date"
              type="date"
              value={form.reportDate}
              onChange={(e) => setField('reportDate', e.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field label="Description" htmlFor="record-description" optional>
            <Textarea
              id="record-description"
              rows={3}
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              disabled={submitting}
              placeholder="Optional notes or summary..."
            />
          </Field>

          <FileUpload
            id="record-file"
            label="Medical Document"
            accept=".pdf,.jpg,.jpeg,.png"
            maxSizeMB={10}
            value={form.file}
            onChange={(file) => setField('file', file)}
            onRemove={() => setField('file', null)}
            error={formErrors.file}
            hint="Accepted formats: PDF, JPG, PNG up to 10 MB."
            required
          />
        </form>
      </Modal>

      {/* Record metadata preview */}
      <Modal
        open={Boolean(previewRecord)}
        onClose={() => setPreviewRecord(null)}
        title={previewRecord?.recordTitle}
        description="Record metadata"
        icon={FileText}
        iconTone="navy"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setPreviewRecord(null)}>
              Close
            </Button>
            <Button
              variant="primary"
              icon={Download}
              loading={previewRecord ? downloadingId === previewRecord.id : false}
              disabled={Boolean(downloadingId)}
              title="Download decrypted document"
              onClick={() => handleDownload(previewRecord)}
            >
              Download Document
            </Button>
          </>
        }
      >
        {previewRecord && (
          <div className="space-y-4">
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ['Category', previewRecord.category],
                ['Hospital / Clinic', previewRecord.hospitalName ?? '—'],
                ['Doctor', previewRecord.doctorName ?? '—'],
                ['Report date', formatDate(previewRecord.reportDate)],
                ['Uploaded', formatDate(previewRecord.uploadedAt)],
                ['File type', previewRecord.mimeType ?? 'Unknown'],
                ['File size', formatFileSize(previewRecord.fileSize)],
                ['Original File', previewRecord.fileName ?? '—'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-slate-50 px-3 py-2.5">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">
                    {label}
                  </dt>
                  <dd className="mt-0.5 break-words text-sm text-navy-900">{value}</dd>
                </div>
              ))}
            </dl>

            {previewRecord.description && (
              <p className="text-sm text-muted">{previewRecord.description}</p>
            )}

            <div className="rounded-xl2 border border-slate-200 p-4">
              <p className="text-sm font-semibold text-navy-900">Security verification</p>
              <div className="mt-3 space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm text-slate-700">
                    <ShieldCheck size={15} className="text-teal-600" aria-hidden="true" />
                    Encryption
                  </span>
                  <StatusBadge
                    status={previewRecord.encryptionStatus}
                    tone={ENCRYPTION_STATUS_TONES[previewRecord.encryptionStatus]}
                  >
                    {ENCRYPTION_STATUS_LABELS[previewRecord.encryptionStatus] ??
                      previewRecord.encryptionStatus}
                  </StatusBadge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm text-slate-700">
                    <ShieldCheck size={15} className="text-teal-600" aria-hidden="true" />
                    Integrity Hash
                  </span>
                  <StatusBadge
                    status={previewRecord.integrityStatus}
                    tone={INTEGRITY_STATUS_TONES[previewRecord.integrityStatus]}
                  >
                    {INTEGRITY_STATUS_LABELS[previewRecord.integrityStatus] ??
                      previewRecord.integrityStatus}
                  </StatusBadge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm text-slate-700">
                    <ShieldCheck size={15} className="text-teal-600" aria-hidden="true" />
                    Record status
                  </span>
                  <StatusBadge
                    status={previewRecord.recordStatus}
                    tone={RECORD_STATUS_TONES[previewRecord.recordStatus]}
                  >
                    {RECORD_STATUS_LABELS[previewRecord.recordStatus] ?? previewRecord.recordStatus}
                  </StatusBadge>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted">
                Storage uses AES-256-GCM. Decryption and SHA-256 integrity validation occur in memory during secure download.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
