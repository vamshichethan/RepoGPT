'use client';

import { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/api';
import type { DependencyGraphResponse } from '@/lib/types';
import { MermaidViewer } from '@/components/summary/MermaidViewer';
import { Loader2 } from 'lucide-react';

interface DependencyExplorerProps {
  repoId: number;
}

export function DependencyExplorer({ repoId }: DependencyExplorerProps) {
  const [data, setData] = useState<DependencyGraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchGraph = async () => {
      try {
        const res = await api.productivity.getDependencies(repoId);
        if (mounted) setData(res);
      } catch (err) {
        console.error(err);
        if (mounted) setError('Failed to load dependency graph. Ensure backend processing is complete.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchGraph();
    return () => { mounted = false; };
  }, [repoId]);

  const mermaidCode = useMemo(() => {
    if (!data || !data.nodes || data.nodes.length === 0) return '';

    let code = 'flowchart LR\n';
    
    // Group nodes by type if desired, or just list them
    data.nodes.forEach((node) => {
      // Escape special characters in names
      const safeName = node.name.replace(/"/g, "'");
      let shape = `["${safeName}"]`;
      if (node.type === 'service') shape = `("${safeName}")`;
      if (node.type === 'db') shape = `[("${safeName}")]`;
      if (node.type === 'external') shape = `> "${safeName}" ]`;
      
      code += `  ${node.id}${shape}\n`;
    });

    data.edges.forEach((edge) => {
      // Use different arrow styles based on relationship
      let arrow = '-->';
      if (edge.relationship_type === 'imports') arrow = '-.->';
      
      const label = edge.relationship_type ? `|${edge.relationship_type}|` : '';
      code += `  ${edge.source_id} ${arrow}${label} ${edge.target_id}\n`;
    });

    return code;
  }, [data]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 glass rounded-2xl border border-white/10 h-[500px]">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin mb-4" />
        <p className="text-white/50 text-sm">Loading dependency graph...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass p-6 rounded-2xl border border-red-500/30 bg-red-500/5">
        <h3 className="text-red-400 font-medium mb-2">Error</h3>
        <p className="text-white/60 text-sm">{error}</p>
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="glass p-12 rounded-2xl border border-white/10 text-center flex flex-col items-center justify-center h-[500px]">
        <p className="text-white/50">No dependency graph data available for this repository.</p>
        <p className="text-white/30 text-sm mt-2">Ensure the ingestion process completed the graph extraction phase.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in h-[calc(100vh-250px)]">
      <div className="glass p-6 rounded-2xl border border-white/10 flex-1 flex flex-col min-h-0">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-white mb-2">Dependency Explorer</h2>
          <p className="text-white/50 text-sm">
            Interactive map of internal components, services, and external dependencies.
          </p>
        </div>
        
        <div className="flex-1 bg-black/40 rounded-xl overflow-hidden border border-white/5 relative">
          {mermaidCode ? (
             <MermaidViewer chartCode={mermaidCode} />
          ) : (
             <div className="absolute inset-0 flex items-center justify-center text-white/30 text-sm">
               Graph is empty.
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
