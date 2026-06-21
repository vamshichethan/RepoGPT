'use client';

import type { Repository } from '@/lib/types';

interface RepoMetadataProps {
  repo: Repository;
}

const MetaItem = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) => (
  <div className="flex items-start gap-3 py-3 border-b border-white/5 last:border-0">
    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0 text-white/40">
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-xs text-white/30 mb-1">{label}</p>
      <div className="text-sm text-white/80">{value}</div>
    </div>
  </div>
);

const TagList = ({ items, colorClass = 'text-white/60 bg-white/5' }: { items: string[]; colorClass?: string }) => (
  <div className="flex flex-wrap gap-1.5">
    {items.length > 0 ? (
      items.map((item) => (
        <span key={item} className={`text-xs px-2 py-0.5 rounded-md ${colorClass}`}>
          {item}
        </span>
      ))
    ) : (
      <span className="text-xs text-white/25">—</span>
    )}
  </div>
);

export function RepoMetadata({ repo }: RepoMetadataProps) {
  return (
    <div className="glass rounded-2xl p-5 animate-fade-in">
      <h3 className="text-sm font-semibold text-white/70 mb-2 flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Repository Metadata
      </h3>

      <div>
        <MetaItem
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
          label="Files Scanned"
          value={
            repo.num_files != null ? (
              <span className="font-mono">{repo.num_files.toLocaleString()}</span>
            ) : (
              '—'
            )
          }
        />

        <MetaItem
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          }
          label="Lines of Code"
          value={
            repo.total_loc != null ? (
              <span className="font-mono">{repo.total_loc.toLocaleString()}</span>
            ) : (
              '—'
            )
          }
        />

        <MetaItem
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
            </svg>
          }
          label="Languages"
          value={<TagList items={repo.primary_languages || []} />}
        />

        <MetaItem
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          }
          label="Frameworks"
          value={
            <TagList
              items={repo.detected_frameworks || []}
              colorClass="text-cyan-400/80 bg-cyan-500/10"
            />
          }
        />

        <MetaItem
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
          }
          label="Databases"
          value={
            <TagList
              items={repo.detected_databases || []}
              colorClass="text-emerald-400/80 bg-emerald-500/10"
            />
          }
        />
      </div>
    </div>
  );
}
