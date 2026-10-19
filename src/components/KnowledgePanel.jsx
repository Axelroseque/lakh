import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { Card, ErrorNote, SectionTitle, Spinner } from './ui.jsx';
import { Link } from '../lib/router.js';
import { api } from '../lib/api.js';
import { relTime, safeUrl } from '../lib/format.js';
import { useAsync } from '../lib/useAsync.js';

export const SISTEM = ['SIPP', 'CCTVbase', 'Sekarbanyu', 'Jaringan', 'Server', 'Hardware'];
const TAG_TONES = ['text-primary', 'text-secondary', 'text-tertiary-container'];
const SEVERITY_TONE = { High: 'text-error', Medium: 'text-primary-fixed', Low: 'text-secondary' };

function Case({ k }) {
  const link = safeUrl(k.evidenUrl);
  return (
    <article className="bg-surface-container rounded-lg p-space-sm space-y-2 hover:bg-surface-container-high transition-colors">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-label text-label-lg font-bold text-on-surface leading-snug">{k.judul}</h3>
        <span className="font-label text-label-sm text-outline shrink-0">{relTime(k.timestamp)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {(k.tags || []).slice(0, 4).map((t, i) => (
          <span key={t} className={'px-1.5 py-0.5 rounded bg-surface-container-lowest font-label text-label-sm ' + TAG_TONES[i % TAG_TONES.length]}>#{t}</span>
        ))}
        {k.severity && <span className={'font-label text-label-sm ml-auto ' + (SEVERITY_TONE[k.severity] || 'text-outline')}>{k.severity}</span>}
      </div>
      <p className="text-body-sm text-on-surface-variant leading-relaxed line-clamp-3 whitespace-pre-line">{k.solusi}</p>
      <div className="flex items-center justify-between pt-1 font-label text-label-sm text-outline">
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-secondary hover:underline">
            <Icon name="link" size={14} /> Drive Eviden Linked
          </a>
        ) : (
          <span className="flex items-center gap-1"><Icon name="verified" size={14} /> {k.id}</span>
        )}
        <span>{k.verifiedBy ? 'Solved by ' + k.verifiedBy : k.sistem}</span>
      </div>
    </article>
  );
}

export default function KnowledgePanel({ initialQuery = '' }) {
  const [q, setQ] = useState(initialQuery);
  const [dq, setDq] = useState(initialQuery.trim());
  const [tag, setTag] = useState('All');

  useEffect(() => { setQ(initialQuery); setDq(initialQuery.trim()); }, [initialQuery]);
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const t = tag === 'All' ? '' : tag;
  const { data, error, loading, reload } = useAsync(
    () => (dq ? api.kbSearch(dq, t) : api.kbList({ tag: t, limit: 20 })),
    [dq, tag]
  );
  const items = data ? data.items.slice(0, 6) : [];

  return (
    <Card className="xl:col-span-5 p-space-lg space-y-space-md">
      <SectionTitle icon="book" tone="text-secondary" title="Recent Problem Solving" subtitle="Knowledge base & technical logs" right={loading && data ? <Spinner /> : null} />

      <div className="relative w-full">
        <Icon name="search" size={18} className="absolute left-3 top-2.5 text-outline pointer-events-none" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Cari solusi error code, modul, query..."
          aria-label="Cari problem solve"
          className="w-full bg-surface-container-lowest text-on-surface text-body-sm rounded-lg pl-9 pr-3 py-2 placeholder:text-outline/60 focus:outline-none focus:ring-1 focus:ring-secondary"
        />
      </div>

      <div className="flex flex-wrap gap-1.5 pt-0.5" role="group" aria-label="Filter sistem">
        {['All', ...SISTEM].map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setTag(s)}
            aria-pressed={tag === s}
            className={'px-2.5 py-1 rounded font-label text-label-sm transition-colors ' + (tag === s
              ? 'bg-primary-container text-on-primary font-semibold'
              : 'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high')}
          >
            {s === 'All' ? 'All' : '#' + s}
          </button>
        ))}
      </div>

      <ErrorNote error={error} onRetry={reload} />
      <div className="space-y-space-sm">
        {loading && !data && <div className="flex items-center gap-2 text-outline text-body-sm p-3"><Spinner /> Memuat...</div>}
        {data && items.length === 0 && (
          <div className="rounded-lg bg-surface-container text-outline text-body-sm p-4 text-center">
            {dq ? `Tidak ada hasil untuk "${dq}".` : 'Belum ada catatan problem solve.'}
          </div>
        )}
        {items.map(k => <Case key={k.id} k={k} />)}
        {data && data.total > items.length && (
          <div className="text-center font-label text-label-sm text-outline">Menampilkan {items.length} dari {data.total} catatan</div>
        )}
      </div>

      <Link to="/problem-solve" className="w-full py-2.5 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface font-label text-label-lg flex items-center justify-center gap-2 transition-colors">
        <Icon name="add" /> Catat Problem Solve Baru
      </Link>
    </Card>
  );
}
