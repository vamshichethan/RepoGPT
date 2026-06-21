'use client';

import dynamic from 'next/dynamic';
import type { Architecture } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

// Dynamically import MermaidViewer to prevent Next.js SSR document reference errors
const MermaidViewer = dynamic(
  () => import('./MermaidViewer').then((m) => m.MermaidViewer),
  { ssr: false }
);

interface ArchitecturePanelProps {
  architecture: Architecture;
}

export function ArchitecturePanel({ architecture }: ArchitecturePanelProps) {
  const stackItems = Object.entries(architecture.tech_stack_breakdown || {});

  return (
    <div className="space-y-6">
      {/* 1. Architecture Summary */}
      <Card className="glass border-white/5 p-6 shadow-xl">
        <h3 className="text-sm font-semibold text-white/40 tracking-wider uppercase mb-3 flex items-center gap-2">
          🏛️ Architecture Summary
        </h3>
        <p className="text-sm text-white/80 leading-relaxed">
          {architecture.architecture_summary || 'No summary generated.'}
        </p>
      </Card>

      {/* 2. Visual Diagram */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-white/40 tracking-wider uppercase flex items-center gap-2">
          📊 High-Level Flow Diagram
        </h3>
        {architecture.mermaid_code ? (
          <MermaidViewer chartCode={architecture.mermaid_code} />
        ) : (
          <Card className="glass border-white/5 p-8 text-center text-white/30 text-xs">
            No diagram code generated.
          </Card>
        )}
      </div>

      {/* 3. Tech Stack Breakdown */}
      {stackItems.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-white/40 tracking-wider uppercase flex items-center gap-2">
            🛠️ Component Breakdown
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {stackItems.map(([layer, tech]) => (
              <Card key={layer} className="glass border-white/5 p-4 hover-lift group">
                <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider block">
                  {layer}
                </span>
                <span className="text-sm font-semibold text-purple-400 mt-2 block truncate" title={tech}>
                  {tech}
                </span>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 4. Service Dependencies */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-white/40 tracking-wider uppercase flex items-center gap-2">
            🔗 Service Dependencies
          </h3>
          <Card className="glass border-white/5 p-5 shadow-xl">
            <ScrollArea className="max-h-[350px]">
              {architecture.service_dependencies && architecture.service_dependencies.length > 0 ? (
                <div className="space-y-4">
                  {architecture.service_dependencies.map((dep, idx) => (
                    <div key={idx} className="border-b border-white/5 pb-3 last:border-b-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5 text-xs font-mono font-medium">
                        <span className="text-purple-400">{dep.service}</span>
                        <span className="text-white/20">→</span>
                        <span className="text-cyan-400">{dep.depends_on}</span>
                      </div>
                      <p className="text-xs text-white/60 leading-relaxed">
                        {dep.description}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/30 text-center py-6">
                  No service dependencies defined.
                </p>
              )}
            </ScrollArea>
          </Card>
        </div>

        {/* 5. Data Flow Description */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-white/40 tracking-wider uppercase flex items-center gap-2">
            🔄 System Data Flow
          </h3>
          <Card className="glass border-white/5 p-5 shadow-xl max-h-[390px] overflow-y-auto leading-relaxed scrollbar-thin">
            {architecture.data_flow_description ? (
              <div className="text-xs text-white/70 space-y-3">
                {architecture.data_flow_description.split('\n').map((line, idx) => {
                  const trimmed = line.trim();
                  if (!trimmed) return null;
                  
                  // Check if it looks like a bullet or numbered list item
                  const isListItem = trimmed.startsWith('-') || trimmed.startsWith('*') || /^\d+\./.test(trimmed);
                  
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "leading-relaxed",
                        isListItem ? "pl-4 relative before:absolute before:left-0 before:top-1.5 before:w-1.5 before:h-1.5 before:bg-cyan-500 before:rounded-full" : "font-semibold text-white text-sm mt-3 first:mt-0"
                      )}
                    >
                      {isListItem ? trimmed.replace(/^[-*\d.]\s*/, '') : trimmed}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-white/30 text-center py-6">
                No data flow description generated.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
