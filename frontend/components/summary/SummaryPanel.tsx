'use client';

import type { Summary } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { TechStackCard } from './TechStackCard';
import { FolderTree } from './FolderTree';
import { ModuleList } from './ModuleList';
import { DependencyTable } from './DependencyTable';

interface SummaryPanelProps {
  summary: Summary;
}

export function SummaryPanel({ summary }: SummaryPanelProps) {
  return (
    <div className="space-y-6">
      {/* 1. Project Purpose */}
      <Card className="glass border-white/5 p-6 shadow-xl">
        <h3 className="text-sm font-semibold text-white/40 tracking-wider uppercase mb-3">
          Project Purpose
        </h3>
        <p className="text-sm text-white/80 leading-relaxed">
          {summary.project_purpose || 'No description provided.'}
        </p>
      </Card>

      {/* 2. Tech Stack */}
      <div>
        <h3 className="text-sm font-semibold text-white/40 tracking-wider uppercase mb-3">
          Tech Stack
        </h3>
        <TechStackCard techStack={summary.tech_stack || {}} />
      </div>

      {/* 3. Folder Structure & Major Modules Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-semibold text-white/40 tracking-wider uppercase mb-3">
            Folder Structure
          </h3>
          <FolderTree structure={summary.folder_structure || ''} />
        </div>

        <div>
          <h3 className="text-sm font-semibold text-white/40 tracking-wider uppercase mb-3">
            Major Modules
          </h3>
          <ModuleList modules={summary.modules || []} />
        </div>
      </div>

      {/* 4. Dependencies */}
      <div>
        <h3 className="text-sm font-semibold text-white/40 tracking-wider uppercase mb-3">
          Key Dependencies
        </h3>
        <DependencyTable dependencies={summary.dependencies || []} />
      </div>
    </div>
  );
}
