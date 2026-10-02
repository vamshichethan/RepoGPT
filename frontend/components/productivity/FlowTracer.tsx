'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { FlowTraceResponse } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Play } from 'lucide-react';

interface FlowTracerProps {
  repoId: number;
}

export function FlowTracer({ repoId }: FlowTracerProps) {
  const [sourcePath, setSourcePath] = useState('');
  const [targetPath, setTargetPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FlowTraceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTrace = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!sourcePath.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const data = await api.productivity.getFlowTrace(repoId, sourcePath, targetPath);
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
          Enter a source file path (and optionally a target) to trace the dependency flow between files in the codebase.
        </p>
        
        <form onSubmit={handleTrace} className="flex flex-col sm:flex-row gap-3">
          <Input
            value={sourcePath}
            onChange={(e) => setSourcePath(e.target.value)}
            placeholder="Source file path, e.g. app/main.py"
            className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-purple-500/50"
            disabled={loading}
          />
          <Input
            value={targetPath}
            onChange={(e) => setTargetPath(e.target.value)}
            placeholder="Target file path (optional)"
            className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-purple-500/50"
            disabled={loading}
          />
          <Button 
            type="submit" 
            disabled={!sourcePath.trim() || loading}
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
        <div className="glass p-6 rounded-2xl border border-white/10">
          <h3 className="text-lg font-medium text-white mb-4">Flow Results</h3>
          {result.flows && result.flows.length > 0 ? (
            <div className="space-y-3">
              {result.flows.map((flow, idx) => (
                <div key={idx} className="bg-black/20 rounded-xl p-4 border border-white/5">
                  <pre className="text-white/70 text-sm whitespace-pre-wrap break-all">
                    {JSON.stringify(flow, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-white/40 text-sm italic">No flow path found between these files.</p>
          )}
        </div>
      )}
    </div>
  );
}
