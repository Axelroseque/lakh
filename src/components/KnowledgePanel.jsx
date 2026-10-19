import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { Card, ErrorNote, SectionTitle, Spinner } from './ui.jsx';
import { Link } from '../lib/router.js';
import { api } from '../lib/api.js';
import { relTime, safeUrl } from '../lib/format.js';
import { useAsync } from '../lib/useAsync.js';

export const SISTEM = ['SIPP', 'CCTVbase', 'Sekarbanyu', 'Jaringan', 'Server', 'Hardware'];
const TAG_TONES = ['text-[#ff5c6a]', 'text-sky-400', 'text-violet-400'];
const SEVERITY_TONE = { High: 'text-rose-400 font-bold', Medium: 'text-amber-400 font-semibold', Low: 'text-sky-400' };

function Case({ k }) {
  const link = safeUrl(k.evidenUrl);
  return (
    <article className="bg-black/35 backdrop-blur-sm border border-white/[0.06] rounded-xl p-3.5 space-y-2 hover:bg-black/55 hover:border-white/[0.12] transition-all">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-label text-sm font-bold text-white leading-snug">{k.judul}</h3>
        <span className="font-mono text-[11px] text-slate-400 shrink-0">{relTime(k.timestamp)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {(k.tags || []).slice(0, 4).map((t, i) => (
          <span key={t} className={'px-2 py-0.5 rounded-full bg-black/60 border border-white/[0.06] font-mono text-[11px] ' + TAG_TONES[i % TAG_TONES.length]}>
            #{t}
          </span>
        ))}
        {k.severity && (
          <span className={'font-label text-xs ml-auto ' + (SEVERITY_TONE[k.severity] || 'text-slate-400')}>
            {k.severity}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-300 leading-relaxed line-clamp-3 whitespace-pre-line">{k.solusi}</p>
      <div className="flex items-center justify-between pt-1 font-label text-xs text-slate-400 border-t border-white/[0.04]">
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sky-400 hover:text-white transition-colors">
            <Icon name="link" size={14} /> Drive Eviden Linked
          </a>
        ) : (
          <span className="flex items-center gap-1 font-mono text-[11px]"><Icon name="verified" size={14} className="text-[#ff4d5a]" /> {k.id}</span>
        )}
        <span className="font-medium text-slate-300">{k.verifiedBy ? 'Solved by ' + k.verifiedBy : k.sistem}</span>
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
      <SectionTitle
        icon="book"
        tone="text-sky-400"
        title="Recent Problem Solving"
        subtitle="Knowledge base &amp; technical logs"
        right={loading && data ? <Spinner /> : null}
      />

      <div className="relative w-full">
        <Icon name="search" size={18} className="absolute left-3.5 top-3 text-slate-400 pointer-events-none" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Cari solusi error code, modul, query..."
          aria-label="Cari problem solve"
          className="w-full bg-black/45 text-white text-xs rounded-xl pl-10 pr-3.5 py-2.5 border border-white/[0.08] placeholder:text-slate-500 focus:outline-none focus:border-[#ff384c] focus:ring-1 focus:ring-[#ff384c]/50 transition-all shadow-inner"
        />
      </div>

      <div className="flex flex-wrap gap-1.5 pt-0.5" role="group" aria-label="Filter sistem">
        {['All', ...SISTEM].map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setTag(s)}
            aria-pressed={tag === s}
            className={'px-3 py-1 rounded-full font-label text-xs transition-all ' + (tag === s
              ? 'bg-gradient-to-r from-[#ff384c] to-[#ff5263] text-white font-bold shadow-[0_0_12px_rgba(255,56,76,0.35)] border border-rose-400/30'
              : 'bg-white/[0.04] border border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.08]')}
          >
            {s === 'All' ? 'All' : '#' + s}
          </button>
        ))}
      </div>

      <ErrorNote error={error} onRetry={reload} />
      <div className="space-y-2.5">
        {loading && !data && (
          <div className="flex items-center gap-2 text-slate-400 text-xs p-4 bg-black/20 rounded-xl border border-white/[0.04]">
            <Spinner /> Memuat catatan problem solve...
          </div>
        )}
        {data && items.length === 0 && (
          <div className="rounded-xl bg-black/30 border border-white/[0.05] text-slate-400 text-xs p-6 text-center">
            {dq ? `Tidak ada hasil untuk "${dq}".` : 'Belum ada catatan problem solve.'}
          </div>
        )}
        {items.map(k => <Case key={k.id} k={k} />)}
        {data && data.total > items.length && (
          <div className="pt-2 text-center">
            <Link to="/problem-solve" className="font-label text-xs text-sky-400 hover:text-white hover:underline">
              Lihat seluruh {data.total} problem solve →
            </Link>
          </div>
        )}
      </div>
    </Card>
  );
}
