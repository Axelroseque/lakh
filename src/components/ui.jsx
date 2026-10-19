import Icon from './Icon.jsx';

export function Card({ className = '', children, ...rest }) {
  return <div className={'bg-surface-container-low rounded-xl shadow-lg ' + className} {...rest}>{children}</div>;
}

export function SectionTitle({ icon, tone = 'text-primary-container', title, subtitle, right }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-space-sm min-w-0">
        <div className={'w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0 ' + tone}>
          <Icon name={icon} size={20} />
        </div>
        <div className="min-w-0">
          <h2 className="text-headline-md text-on-surface font-bold tracking-tight truncate">{title}</h2>
          {subtitle && <span className="font-label text-label-sm text-outline">{subtitle}</span>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function Pill({ children, className = '' }) {
  return <span className={'inline-flex items-center gap-1 px-2 py-0.5 rounded font-label text-label-sm ' + className}>{children}</span>;
}

export function Spinner({ className = '' }) {
  return <span className={'inline-block w-4 h-4 rounded-full border-2 border-outline/40 border-t-secondary animate-spin ' + className} role="status" aria-label="Memuat" />;
}

export function ErrorNote({ error, onRetry, className = '' }) {
  if (!error) return null;
  return (
    <div role="alert" className={'flex items-start gap-2 rounded-lg bg-error-container/40 text-on-error-container px-3 py-2 text-body-sm ' + className}>
      <Icon name="error" size={16} className="mt-0.5" />
      <span className="flex-1">{error.message || String(error)}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="underline underline-offset-2 font-semibold">Coba lagi</button>
      )}
    </div>
  );
}

export function Btn({ variant = 'neutral', icon, children, className = '', ...rest }) {
  const styles = {
    primary: 'bg-primary-container text-on-primary hover:bg-primary-container/90 shadow-md',
    blue: 'bg-secondary-container text-on-secondary-container hover:bg-secondary-container/90',
    neutral: 'bg-surface-container-high text-on-surface hover:bg-surface-bright',
    ghost: 'bg-surface-container text-on-surface hover:bg-surface-container-high'
  }[variant];
  return (
    <button
      type="button"
      className={'inline-flex items-center justify-center gap-1.5 px-space-md py-2 rounded-lg font-label text-label-lg transition-all active:scale-[.98] disabled:opacity-50 disabled:active:scale-100 ' + styles + ' ' + className}
      {...rest}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

const STATUS_STYLE = {
  'Terjadwal': ['schedule', 'bg-surface-container-high text-on-surface-variant'],
  'Menunggu Eviden': ['warning', 'bg-primary-container text-on-primary font-semibold animate-pulse'],
  'Terunggah': ['attach', 'bg-surface-container-high text-secondary'],
  'Selesai': ['check_circle', 'bg-surface-container-high text-secondary'],
  'Diabaikan': ['block', 'bg-surface-container-high text-outline'],
  'Draf': ['edit_note', 'bg-surface-container-high text-primary']
};

export function StatusBadge({ status, label }) {
  const [icon, cls] = STATUS_STYLE[status] || STATUS_STYLE.Terjadwal;
  return (
    <Pill className={cls}>
      <Icon name={icon} size={14} /> {label || status}
    </Pill>
  );
}

export const STATUS_COLOR = {
  'Terjadwal': 'bg-outline/60',
  'Menunggu Eviden': 'bg-primary-container',
  'Terunggah': 'bg-secondary',
  'Selesai': 'bg-tertiary-container',
  'Diabaikan': 'bg-surface-variant',
  'Draf': 'bg-primary'
};
