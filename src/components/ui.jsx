import Icon from './Icon.jsx';

/** High-end Glassmorphism Card with semi-transparent dark blurred background, thin white border, and soft outer shadows */
export function Card({ className = '', children, ...rest }) {
  return (
    <div
      className={'relative backdrop-blur-xl bg-[#0c1017]/80 rounded-2xl border border-white/[0.08] shadow-[0_16px_40px_-10px_rgba(0,0,0,0.6)] transition-all duration-200 hover:border-white/[0.14] ' + className}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Distinct smaller translucent box inside cards to contain sub-elements and prevent text overlap */
export function SubBox({ className = '', children, ...rest }) {
  return (
    <div
      className={'bg-black/35 backdrop-blur-sm border border-white/[0.05] rounded-xl p-3 shadow-inner ' + className}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ icon, tone = 'text-primary-container', title, subtitle, right }) {
  return (
    <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
      <div className="flex items-center gap-3 min-w-0">
        <div className={'w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] shadow-[0_0_15px_rgba(255,56,76,0.12)] flex items-center justify-center shrink-0 ' + tone}>
          <Icon name={icon} size={20} />
        </div>
        <div className="min-w-0">
          <h2 className="text-headline-md text-on-surface font-extrabold tracking-tight truncate">{title}</h2>
          {subtitle && <span className="font-label text-label-sm text-outline block truncate">{subtitle}</span>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function Pill({ children, className = '' }) {
  return (
    <span className={'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-label text-label-sm border border-white/[0.08] backdrop-blur-sm ' + className}>
      {children}
    </span>
  );
}

export function Spinner({ className = '' }) {
  return (
    <span
      className={'inline-block w-4 h-4 rounded-full border-2 border-white/20 border-t-primary-container animate-spin ' + className}
      role="status"
      aria-label="Memuat"
    />
  );
}

export function ErrorNote({ error, onRetry, className = '' }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className={'flex items-start gap-2.5 rounded-xl bg-error-container/30 border border-error/30 text-on-error-container px-3.5 py-2.5 text-body-sm backdrop-blur-md ' + className}
    >
      <Icon name="error" size={18} className="mt-0.5 text-error shrink-0" />
      <span className="flex-1 font-medium">{error.message || String(error)}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="underline underline-offset-2 font-bold hover:text-white transition-colors">
          Coba lagi
        </button>
      )}
    </div>
  );
}

export function Btn({ variant = 'neutral', icon, children, className = '', ...rest }) {
  const styles = {
    primary: 'bg-gradient-to-r from-[#ff4757] to-[#ff2b40] text-white font-bold shadow-[0_0_20px_rgba(255,43,64,0.35)] hover:shadow-[0_0_28px_rgba(255,43,64,0.55)] border border-rose-400/30 hover:brightness-110',
    blue: 'bg-secondary/15 text-secondary hover:bg-secondary/25 border border-secondary/30 shadow-[0_0_15px_rgba(56,189,248,0.15)] font-semibold',
    neutral: 'bg-white/[0.05] text-on-surface hover:bg-white/[0.1] border border-white/[0.08] hover:border-white/20 backdrop-blur-md shadow-sm font-semibold',
    ghost: 'bg-transparent text-on-surface-variant hover:text-on-surface hover:bg-white/[0.05]'
  }[variant];
  return (
    <button
      type="button"
      className={'inline-flex items-center justify-center gap-1.5 px-space-md py-2 rounded-xl font-label text-label-lg transition-all active:scale-[.98] disabled:opacity-50 disabled:active:scale-100 cursor-pointer ' + styles + ' ' + className}
      {...rest}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

const STATUS_STYLE = {
  'Terjadwal': ['schedule', 'bg-white/[0.04] text-on-surface-variant border-white/10'],
  'Menunggu Eviden': ['warning', 'bg-rose-500/20 text-[#ff4d5a] border-rose-500/40 font-bold shadow-[0_0_12px_rgba(255,77,90,0.3)] animate-pulse'],
  'Terunggah': ['attach', 'bg-sky-500/15 text-sky-400 border-sky-400/30 font-semibold'],
  'Selesai': ['check_circle', 'bg-emerald-500/15 text-emerald-400 border-emerald-400/30 font-semibold'],
  'Diabaikan': ['block', 'bg-white/[0.02] text-outline border-white/5'],
  'Draf': ['edit_note', 'bg-rose-500/10 text-primary border-rose-500/20']
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
  'Menunggu Eviden': 'bg-primary-container shadow-[0_0_8px_rgba(255,56,76,0.6)]',
  'Terunggah': 'bg-secondary shadow-[0_0_8px_rgba(56,189,248,0.5)]',
  'Selesai': 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]',
  'Diabaikan': 'bg-white/10',
  'Draf': 'bg-primary'
};
