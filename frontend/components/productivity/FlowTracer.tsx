'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { FlowTraceResponse } from '@/lib/types';
import { MermaidViewer } from '@/components/summary/MermaidViewer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Play } from 'lucide-react';

interface FlowTracerProps {
  repoId: number;
}

export function FlowTracer({ repoId }: FlowTracerProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FlowTraceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTrace = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const data = await api.productivity.getFlowTrace(repoId, query);
      setResult(data);
    } catch (err) {
      console.error(err);
      setError('Failed to generate flow trace. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="glass p-6 rounded-2xl border border-white/10">
        <h2 className="text-xl font-semibold text-white mb-2">Code Flow Tracer</h2>
        <p className="text-white/50 text-sm mb-6">
          Describe a functionality or business logic (e.g., &ldquo;How does user login work?&rdquo;) to trace its execution flow across the codebase.
        </p>
        
        <form onSubmit={handleTrace} className="flex gap-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g., How is the repository ingested?"
            className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-purple-500/50"
            disabled={loading}
          />
          <Button 
            type="submit" 
            disabled={!query.trim() || loading}
            className="gradient-bg hover:opacity-90 transition-opacity"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Trace Flow
          </Button>
        </form>

        {error && (
          <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>

      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass p-6 rounded-2xl border border-white/10 flex flex-col">
            <h3 className="text-lg font-medium text-white mb-4">Step-by-Step Explanation</h3>
            <div className="prose prose-invert max-w-none text-white/70 text-sm flex-1 overflow-y-auto pr-2">
              {result.text_explanation.split('\n').map((paragraph, idx) => (
                <p key={idx} className="mb-3">{paragraph}</p>
              ))}
            </div>
          </div>
          
          <div className="glass p-6 rounded-2xl border border-white/10 flex flex-col min-h-[400px]">
            <h3 className="text-lg font-medium text-white mb-4">Execution Graph</h3>
            <div className="flex-1 bg-black/40 rounded-xl overflow-hidden border border-white/5">
              <MermaidViewer chartCode={result.mermaid_code} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
