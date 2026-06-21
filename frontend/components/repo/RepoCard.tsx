'use client';

import Link from 'next/link';
import type { Repository } from '@/lib/types';

interface RepoCardProps {
  repo: Repository;
}

const STATUS_CONFIG: Record<
  string,
  { color: string; dot: string; label: string }
> = {
  ready: {
    color: 'bg-green-500/10 text-green-400 border-green-500/25',
    dot: 'bg-green-400',
    label: 'Ready',
  },
  error: {
    color: 'bg-red-500/10 text-red-400 border-red-500/25',
    dot: 'bg-red-400',
    label: 'Error',
  },
  pending: {
    color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/25',
    dot: 'bg-yellow-400 animate-pulse',
    label: 'Pending',
  },
  cloning: {
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
    dot: 'bg-blue-400 animate-pulse',
    label: 'Cloning',
  },
  scanning: {
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
    dot: 'bg-blue-400 animate-pulse',
    label: 'Scanning',
  },
  chunking: {
    color: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
    dot: 'bg-amber-400 animate-pulse',
    label: 'Chunking',
  },
  embedding: {
    color: 'bg-purple-500/10 text-purple-400 border-purple-500/25',
    dot: 'bg-purple-400 animate-pulse',
    label: 'Embedding',
  },
  summarizing: {
    color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/25',
    dot: 'bg-cyan-400 animate-pulse',
    label: 'Summarizing',
  },
};

const LANG_COLORS: Record<string, string> = {
  Python: 'text-blue-400',
  TypeScript: 'text-sky-400',
  JavaScript: 'text-yellow-400',
  Go: 'text-cyan-400',
  Rust: 'text-orange-400',
  Java: 'text-red-400',
  'C++': 'text-pink-400',
  C: 'text-purple-400',
  Ruby: 'text-rose-400',
  PHP: 'text-indigo-400',
};

export function RepoCard({ repo }: RepoCardProps) {
  const statusConf = STATUS_CONFIG[repo.status] || STATUS_CONFIG.pending;

  return (
    <Link href={`/repo/${repo.id}`} className="block group">
      <div className="glass rounded-2xl p-5 hover-lift group-hover:border-white/20 transition-all duration-300 h-full">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-xs text-white/40 mb-0.5 truncate">{repo.owner}</p>
            <h3 className="font-semibold text-white text-sm truncate group-hover:text-purple-300 transition-colors duration-200">
              {repo.name}
            </h3>
          </div>
          <span
            className={`shrink-0 flex items-center gap-1.5 text-xs border px-2 py-1 rounded-full ${statusConf.color}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${statusConf.dot}`} />
            {statusConf.label}
          </span>
        </div>

        {/* Description */}
        {repo.description && (
          <p className="text-xs text-white/40 mb-3 line-clamp-2 leading-relaxed">
            {repo.description}
          </p>
        )}

        {/* Language tags */}
        {repo.primary_languages?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {repo.primary_languages.slice(0, 3).map((lang) => (
              <span
                key={lang}
                className={`text-xs ${LANG_COLORS[lang] || 'text-white/50'} bg-white/5 px-2 py-0.5 rounded-md`}
              >
                {lang}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-white/30 mt-auto pt-2 border-t border-white/5">
          <span>{repo.num_files != null ? `${repo.num_files.toLocaleString()} files` : '—'}</span>
          <span>{new Date(repo.created_at).toLocaleDateString()}</span>
        </div>
      </div>
    </Link>
  );
}
