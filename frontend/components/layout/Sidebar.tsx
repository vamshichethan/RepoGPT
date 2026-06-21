'use client';

import Link from 'next/link';
import type { Repository } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SidebarProps {
  repos: Repository[];
  currentRepoId?: number;
}

export function Sidebar({ repos, currentRepoId }: SidebarProps) {
  return (
    <aside className="w-[280px] h-screen bg-[#07070a]/90 border-r border-white/5 flex flex-col backdrop-blur-md shrink-0">
      {/* Brand Logo */}
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
          <div className="w-8 h-8 rounded-lg gradient-bg flex items-center justify-center text-white font-bold text-sm glow-sm">
            R
          </div>
          <span className="font-semibold text-white tracking-tight">RepoGPT</span>
        </Link>
      </div>

      {/* Action / Add New */}
      <div className="p-4">
        <Link
          href="/"
          className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 text-sm font-medium text-white/90 transition-all duration-200"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Ingest New Repo
        </Link>
      </div>

      {/* Repos List */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-6 py-2">
          <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">
            Repositories ({repos.length})
          </span>
        </div>

        <ScrollArea className="flex-1 px-3">
          <div className="space-y-1 py-2">
            {repos.length === 0 ? (
              <p className="text-xs text-white/30 text-center py-8">No repositories ingested yet.</p>
            ) : (
              repos.map((repo) => {
                const isActive = repo.id === currentRepoId;
                const statusDot: Record<string, string> = {
                  ready: 'bg-green-500',
                  error: 'bg-red-500',
                  pending: 'bg-yellow-500 animate-pulse',
                  cloning: 'bg-blue-500 animate-pulse',
                  scanning: 'bg-blue-500 animate-pulse',
                  chunking: 'bg-purple-500 animate-pulse',
                  embedding: 'bg-purple-500 animate-pulse',
                  summarizing: 'bg-cyan-500/80 animate-pulse',
                };

                return (
                  <Link
                    key={repo.id}
                    href={`/repo/${repo.id}`}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group text-sm",
                      isActive
                        ? "bg-white/10 border border-white/10 text-white font-medium shadow-md shadow-black/20"
                        : "hover:bg-white/5 text-white/60 hover:text-white/90 border border-transparent"
                    )}
                  >
                    {/* Status indicator dot */}
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full",
                        statusDot[repo.status] || 'bg-white/20'
                      )}
                    />
                    
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">{repo.name}</p>
                      <p className="truncate text-[11px] text-white/30 group-hover:text-white/40">
                        {repo.owner}
                      </p>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-white/5 bg-black/20 text-center">
        <span className="text-[11px] text-white/30">RepoGPT Phase 1 MVP</span>
      </div>
    </aside>
  );
}
