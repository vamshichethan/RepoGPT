'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ModuleInfo } from '@/lib/types';

interface ModuleListProps {
  modules: ModuleInfo[];
}

export function ModuleList({ modules }: ModuleListProps) {
  if (!modules || modules.length === 0) {
    return <p className="text-sm text-white/40">No major modules identified.</p>;
  }

  return (
    <div className="space-y-4">
      {modules.map((mod, idx) => (
        <Card
          key={idx}
          className="glass border-white/5 p-5 hover-lift transition-all duration-200"
        >
          <div className="flex flex-col gap-3">
            {/* Module Name */}
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-white tracking-wide">
                📦 {mod.name}
              </h4>
            </div>

            {/* Description */}
            <p className="text-xs text-white/60 leading-relaxed">
              {mod.description}
            </p>

            {/* Key Files badges */}
            {mod.key_files && mod.key_files.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {mod.key_files.map((file) => (
                  <Badge
                    key={file}
                    variant="outline"
                    className="bg-white/5 hover:bg-white/10 text-white/50 text-[10px] py-0.5 px-2 font-mono border-white/5 truncate max-w-xs"
                    title={file}
                  >
                    📄 {file.split('/').pop()}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
