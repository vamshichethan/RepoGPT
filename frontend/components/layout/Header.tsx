'use client';

import type { Repository } from '@/lib/types';

interface HeaderProps {
  repo: Repository;
}

export function Header({ repo }: HeaderProps) {
  return (
    <header className="h-16 border-b border-white/5 bg-[#0a0a0f]/60 backdrop-blur-md px-6 flex items-center justify-between shrink-0">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm text-white/50 min-w-0">
        <span className="hover:text-white/80 transition-colors shrink-0">Repositories</span>
        <span className="text-white/20 shrink-0">/</span>
        <span className="text-white/80 font-medium shrink-0">{repo.owner}</span>
        <span className="text-white/20 shrink-0">/</span>
        <span className="text-white font-semibold truncate max-w-sm">{repo.name}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <a
          href={repo.github_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-white/60 hover:text-white/90 transition-colors duration-200 glass px-3 py-1.5 rounded-lg border border-white/10"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
          View GitHub
        </a>
      </div>
    </header>
  );
}
