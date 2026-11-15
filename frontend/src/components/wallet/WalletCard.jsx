import { AlertCircle, CheckCircle2, Link2, RefreshCw, ShieldCheck, Unplug, Wallet } from 'lucide-react';
import Button from '../common/Button';
import StatusBadge from '../common/StatusBadge';
import { useWallet, HARDHAT_CHAIN_ID } from '../../context/WalletContext';
import { cn, shortAddress } from '../../utils/format';

/**
 * Wallet connection & signature verification panel (Phase 9).
 */
export default function WalletCard({ className, compact = false }) {
  const {
    address,
    connected,
    connecting,
    verified,
    verifying,
    userWallet,
    chainId,
    chainName,
    isCorrectNetwork,
    connect,
    verifyWallet,
    disconnect,
    switchNetwork,
  } = useWallet();

  return (
    <div className={cn('rounded-xl2 border border-slate-200 bg-white p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-50 text-navy-800">
            <Wallet size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-navy-900">Ethereum Wallet</p>
            <p className="text-xs text-muted">
              Signs on-chain consent grants, revokes, and cryptographic permissions
            </p>
          </div>
        </div>

        {connected ? (
          verified ? (
            <StatusBadge status="Verified & Linked" tone="success" />
          ) : (
            <StatusBadge status="Signature Needed" tone="warning" />
          )
        ) : (
          <StatusBadge status="Not Connected" tone="neutral" />
        )}
      </div>

      <dl className={cn('mt-4 grid gap-3 sm:grid-cols-2', compact && 'sm:grid-cols-1')}>
        <div className="rounded-lg bg-slate-50 px-3 py-2.5">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">
            MetaMask Account
          </dt>
          <dd className="mt-0.5 font-mono text-xs text-navy-900">
            {address ? shortAddress(address, 10, 6) : 'Not connected'}
          </dd>
        </div>

        <div className="rounded-lg bg-slate-50 px-3 py-2.5">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">Network</dt>
          <dd className="mt-0.5 flex items-center gap-1.5 text-xs text-navy-900">
            {chainName} · ID {chainId || HARDHAT_CHAIN_ID}
            {connected && !isCorrectNetwork && (
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                Wrong Network
              </span>
            )}
          </dd>
        </div>
      </dl>

      {/* Account Verification Details */}
      {userWallet && (
        <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-emerald-700" aria-hidden="true" />
            Account Linked: <span className="font-mono font-medium">{shortAddress(userWallet, 8, 4)}</span>
          </span>
          {verified && <span className="font-semibold text-emerald-700">✓ Active</span>}
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!connected ? (
          <Button variant="primary" size="sm" icon={Link2} loading={connecting} onClick={connect}>
            Connect MetaMask
          </Button>
        ) : (
          <>
            {!isCorrectNetwork && (
              <Button variant="warning" size="sm" icon={RefreshCw} onClick={switchNetwork}>
                Switch to Hardhat (31337)
              </Button>
            )}

            {!verified && (
              <Button
                variant="primary"
                size="sm"
                icon={CheckCircle2}
                loading={verifying}
                onClick={verifyWallet}
              >
                Verify Wallet Ownership
              </Button>
            )}

            <Button variant="outline" size="sm" icon={Unplug} onClick={disconnect}>
              Disconnect
            </Button>
          </>
        )}

        <span className="text-xs text-muted">
          Local chain (31337). No real ETH or cryptocurrency is ever used.
        </span>
      </div>

      {connected && !verified && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertCircle size={14} className="mt-px shrink-0" aria-hidden="true" />
          Wallet connected but not verified with your account. Click <strong>Verify Wallet Ownership</strong> to sign a one-time verification message in MetaMask.
        </p>
      )}
    </div>
  );
}
