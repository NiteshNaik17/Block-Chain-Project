import { AlertTriangle, CheckCircle2, LogOut, ShieldOff } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';

const PRESETS = {
  danger: { icon: AlertTriangle, iconTone: 'red', confirmVariant: 'danger' },
  warning: { icon: AlertTriangle, iconTone: 'amber', confirmVariant: 'accent' },
  success: { icon: CheckCircle2, iconTone: 'emerald', confirmVariant: 'success' },
  revoke: { icon: ShieldOff, iconTone: 'red', confirmVariant: 'danger' },
  logout: { icon: LogOut, iconTone: 'navy', confirmVariant: 'primary' },
};

/** Yes/no confirmation dialog built on top of Modal. */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading = false,
}) {
  const preset = PRESETS[tone] ?? PRESETS.danger;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={message}
      icon={preset.icon}
      iconTone={preset.iconTone}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={preset.confirmVariant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
