'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface EntityStatsProps {
  repoId: number;
}

const ENTITY_CONFIG: Record<string, { emoji: string; label: string; color: string }> = {
  file:     { emoji: '📄', label: 'Files',     color: 'text-blue-400'   },
  class:    { emoji: '🏛️', label: 'Classes',   color: 'text-purple-400' },
  function: { emoji: '⚡', label: 'Functions', color: 'text-green-400'  },
  api:      { emoji: '🔗', label: 'APIs',      color: 'text-orange-400' },
  table:    { emoji: '🗃️', label: 'Tables',    color: 'text-red-400'    },
  service:  { emoji: '☁️', label: 'Services',  color: 'text-yellow-400' },
};

export function EntityStats({ repoId }: EntityStatsProps) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.knowledgeGraph.getEntityCounts(repoId)
      .then((data) => {
        setCounts(data.counts || {});
        setTotal(data.total || 0);
      })
      .catch(() => {/* non-fatal */})
      .finally(() => setLoading(false));
  }, [repoId]);

  if (loading || total === 0) return null;

  return (
    <div className="glass border border-white/10 rounded-2xl px-5 py-4 mb-4 animate-fade-in">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="text-white/40 text-xs font-medium uppercase tracking-wider">Graph Entities</span>
        {Object.entries(ENTITY_CONFIG).map(([type, cfg]) => {
          const count = counts[type];
          if (!count) return null;
          return (
            <div key={type} className="flex items-center gap-1.5">
              <span className="text-base leading-none">{cfg.emoji}</span>
              <span className={`text-sm font-semibold ${cfg.color}`}>{count.toLocaleString()}</span>
              <span className="text-white/30 text-xs">{cfg.label}</span>
            </div>
          );
        })}
        <span className="ml-auto text-white/25 text-xs">{total.toLocaleString()} total nodes</span>
      </div>
    </div>
  );
}
