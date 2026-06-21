'use client';

import type { DependencyInfo } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DependencyTableProps {
  dependencies: DependencyInfo[];
}

export function DependencyTable({ dependencies }: DependencyTableProps) {
  if (!dependencies || dependencies.length === 0) {
    return <p className="text-sm text-white/40">No key dependencies analyzed.</p>;
  }

  return (
    <div className="glass border border-white/5 rounded-2xl overflow-hidden shadow-xl">
      <ScrollArea className="max-h-[350px]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white/5 border-b border-white/5 text-[10px] uppercase font-bold tracking-wider text-white/40">
              <th className="py-3 px-4">Dependency</th>
              <th className="py-3 px-4">Version</th>
              <th className="py-3 px-4">Purpose</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-xs text-white/80">
            {dependencies.map((dep, idx) => (
              <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                <td className="py-3.5 px-4 font-mono font-medium text-purple-400">
                  {dep.name}
                </td>
                <td className="py-3.5 px-4 font-mono text-white/50">
                  {dep.version}
                </td>
                <td className="py-3.5 px-4 text-white/70 leading-relaxed">
                  {dep.purpose}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}
