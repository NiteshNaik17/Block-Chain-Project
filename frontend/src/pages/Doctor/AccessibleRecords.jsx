import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, FileText, Info, ShieldCheck, FolderOpen } from 'lucide-react';
import PageHeading from '../../components/common/PageHeading';
import Card from '../../components/common/Card';
import Avatar from '../../components/common/Avatar';
import Button from '../../components/common/Button';
import StatusBadge from '../../components/common/StatusBadge';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import DataTable from '../../components/tables/DataTable';
import Pagination from '../../components/tables/Pagination';
import usePatientResource from '../../hooks/usePatientResource';
import { fetchAccessibleRecords, downloadAccessibleRecord } from '../../services/doctorService';
import { formatDate, shortAddress } from '../../utils/format';

const PAGE_SIZE = 10;

/**
 * Records a doctor may genuinely open (Phase 9).
 *
 * A record is listed and downloaded ONLY when an active, unexpired consent held by this doctor
 * is verified live against the on-chain MediConsent smart contract.
 */
export default function AccessibleRecords() {
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const fetcher = useCallback(() => fetchAccessibleRecords({ page, limit: PAGE_SIZE }), [page]);

  const { status, data, error, reload } = usePatientResource(fetcher, [fetcher], {
    fallbackMessage: 'Could not load accessible records.',
  });

  const records = data?.records ?? [];
  const pagination = data?.pagination;
  const explanation = data?.explanation;

  const handleDownload = async (record) => {
    setDownloadingId(record.id);
    try {
      toast('Verifying on-chain permission and decrypting document...', { icon: '🔐' });
      const { filename } = await downloadAccessibleRecord(record.id, record.recordTitle);
      toast.success(`Downloaded: ${filename} (SHA-256 integrity verified)`);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Could not download record.';
      toast.error(msg);
    } finally {
      setDownloadingId(null);
    }
  };

  const columns = [
    {
      key: 'patient',
      header: 'Patient',
      render: (row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.patient?.fullName ?? 'Patient'} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-navy-900">
              {row.patient?.fullName ?? 'Unknown patient'}
            </p>
            <p className="truncate text-xs text-muted">{row.patient?.email ?? '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'title',
      header: 'Record title',
      render: (row) => (
        <div className="flex min-w-0 items-start gap-2">
          <FileText size={14} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
          <p className="truncate text-sm font-medium text-navy-900">{row.recordTitle}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => <span className="text-sm text-slate-600">{row.category ?? '—'}</span>,
    },
    {
      key: 'expiry',
      header: 'Consent expiry',
      render: (row) => (
        <span className="whitespace-nowrap text-sm text-slate-600">
          {row.consentExpiresAt ? formatDate(row.consentExpiresAt) : '—'}
        </span>
      ),
    },
    {
      key: 'authorization',
      header: 'Authorization',
      render: (row) => (
        <StatusBadge status="Blockchain-backed" tone={row.blockchainBacked ? 'success' : 'warning'} />
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="primary"
            size="sm"
            icon={Download}
            loading={downloadingId === row.id}
            onClick={() => handleDownload(row)}
          >
            Download
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setViewing(row)}>
            Details
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeading
        title="Accessible records"
        subtitle="Records backed by an active, blockchain-anchored consent held by you."
        breadcrumb={[{ label: 'Doctor', to: '/doctor/dashboard' }, { label: 'Accessible records' }]}
      />

      <Card className="mb-6" bodyClassName="p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-teal-700" aria-hidden="true" />
          <p className="text-sm text-slate-600">
            {explanation ??
              'Access requires a genuine, unexpired, blockchain-anchored consent. Every download request is verified live against the smart contract before file decryption.'}
          </p>
        </div>
      </Card>

      <Card bodyClassName="p-0">
        {status === 'error' ? (
          <ErrorState
            title="We could not load accessible records"
            message={error}
            onRetry={() => reload()}
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              data={records}
              keyField="id"
              loading={status === 'loading'}
              skeletonRows={4}
              className="rounded-b-xl2"
              empty={
                <EmptyState
                  icon={FolderOpen}
                  title="No accessible records yet"
                  description="When a patient grants on-chain consent for your access requests, their authorized records will appear here for secure viewing and download."
                />
              }
              footer="Live smart-contract verification enforced. Plaintext documents are never cached on disk."
            />
            {status === 'ready' && (
              <Pagination pagination={pagination} onPageChange={setPage} itemLabel="record" />
            )}
          </>
        )}
      </Card>

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.recordTitle}
        description={viewing?.patient?.fullName}
        icon={FileText}
        iconTone="teal"
        size="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <Button
              variant="primary"
              icon={Download}
              loading={downloadingId === viewing?.id}
              onClick={() => handleDownload(viewing)}
            >
              Download Verified Record
            </Button>
            <Button variant="outline" onClick={() => setViewing(null)}>
              Close
            </Button>
          </div>
        }
      >
        {viewing && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Category', value: viewing.category ?? '—' },
                { label: 'Hospital', value: viewing.hospitalName ?? '—' },
                { label: 'Report date', value: viewing.reportDate ? formatDate(viewing.reportDate) : '—' },
                { label: 'Record status', value: viewing.recordStatus ?? '—' },
                { label: 'Consent granted', value: viewing.consentGrantedAt ? formatDate(viewing.consentGrantedAt) : '—' },
                { label: 'Consent expiry', value: viewing.consentExpiresAt ? formatDate(viewing.consentExpiresAt) : '—' },
              ].map((item) => (
                <div key={item.label} className="rounded-lg bg-slate-50 px-3 py-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                    {item.label}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-navy-900">{item.value}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Purpose</p>
              <p className="mt-1 text-sm text-slate-700">{viewing.purpose ?? '—'}</p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                On-chain reference
              </p>
              <p className="mt-1 break-all font-mono text-xs text-slate-600">
                {viewing.transactionReference ?? 'No on-chain reference recorded.'}
              </p>
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-teal-50 px-3 py-2.5 text-xs text-teal-800">
              <Info size={14} className="mt-px shrink-0" aria-hidden="true" />
              <p>
                Document delivery is protected by live on-chain verification and AES-256-GCM encryption.
                Access events are logged to the patient audit trail upon each download.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
