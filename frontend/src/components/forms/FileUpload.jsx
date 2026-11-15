import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Image as ImageIcon, Trash2, Upload } from 'lucide-react';
import { cn, formatFileSize } from '../../utils/format';
import Field from './Field';

const DEFAULT_ACCEPT = '.pdf,.jpg,.jpeg,.png';
const DEFAULT_MAX_MB = 10;

/**
 * Drag-and-drop file picker with local preview.
 * Phase 2 keeps the selected File in component state only — no upload happens.
 */
export default function FileUpload({
  id = 'file-upload',
  label,
  accept = DEFAULT_ACCEPT,
  value = null,
  onChange,
  onRemove,
  hint,
  error,
  required = false,
  maxSizeMB = DEFAULT_MAX_MB,
  capture,
  className,
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState('');

  const previewUrl = useMemo(() => {
    if (!value || !value.type?.startsWith('image/')) return null;
    return URL.createObjectURL(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const accepted = accept.split(',').map((item) => item.trim().toLowerCase());

  const validate = (file) => {
    const extension = `.${file.name.split('.').pop()?.toLowerCase()}`;
    const typeOk = accepted.includes(extension) || accepted.includes(file.type?.toLowerCase());
    if (!typeOk) return `Unsupported file type. Allowed: ${accept.replaceAll('.', '').toUpperCase()}`;
    if (file.size > maxSizeMB * 1024 * 1024) return `File is too large. Maximum size is ${maxSizeMB} MB.`;
    return '';
  };

  const handleFile = (file) => {
    if (!file) return;
    const message = validate(file);
    setLocalError(message);
    if (message) return;
    onChange?.(file);
  };

  const clear = () => {
    setLocalError('');
    if (inputRef.current) inputRef.current.value = '';
    onRemove ? onRemove() : onChange?.(null);
  };

  const shownError = error || localError;

  return (
    <Field label={label} htmlFor={id} hint={value ? undefined : hint} error={shownError} required={required} className={className}>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        capture={capture}
        className="sr-only"
        onChange={(event) => handleFile(event.target.files?.[0])}
      />

      {!value ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            handleFile(event.dataTransfer.files?.[0]);
          }}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-2 rounded-xl2 border-2 border-dashed px-6 py-8 text-center transition-colors',
            dragging ? 'border-teal-400 bg-teal-50/60' : 'border-slate-300 bg-slate-50/60 hover:border-teal-400 hover:bg-teal-50/40',
            shownError && 'border-red-300 bg-red-50/40'
          )}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-navy-700 shadow-card">
            <Upload size={18} aria-hidden="true" />
          </span>
          <span className="text-sm font-medium text-navy-900">
            Click to choose a file or drag it here
          </span>
          <span className="text-xs text-muted">
            {accept.replaceAll('.', '').toUpperCase()} · up to {maxSizeMB} MB
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-3 rounded-xl2 border border-slate-200 bg-white p-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-500">
            {previewUrl ? (
              <img src={previewUrl} alt="Selected file preview" className="h-full w-full object-cover" />
            ) : value.type?.startsWith('image/') ? (
              <ImageIcon size={20} />
            ) : (
              <FileText size={20} />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-navy-900">{value.name}</p>
            <p className="text-xs text-muted">{formatFileSize(value.size)}</p>
          </div>

          <button
            type="button"
            onClick={clear}
            className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
            aria-label="Remove selected file"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}

      {!value && (
        <p className="hint">
          Files are encrypted with AES-256-GCM before they leave your device storage.
        </p>
      )}
    </Field>
  );
}
