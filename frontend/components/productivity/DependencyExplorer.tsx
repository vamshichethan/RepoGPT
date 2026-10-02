'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search } from 'lucide-react';

interface DependencyExplorerProps {
  repoId: number;
}

export function DependencyExplorer({ repoId }: DependencyExplorerProps) {
  const [filePath, setFilePath] = useState('');
  const [data, setData] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!filePath.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const res = await api.productivity.getDependencies(repoId, filePath);
      // The backend returns { dependencies: [...] } but our catch maps to { nodes: [], edges: [] }
      // Handle both shapes
      const deps = (res as unknown as { dependencies?: Record<string, unknown>[] }).dependencies;
      setData(deps ?? []);
    } catch (err) {
      console.error(err);
      setError('Failed to load dependencies. Ensure backend processing is complete.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="glass p-6 rounded-2xl border border-white/10">
        <h2 className="text-xl font-semibold text-white mb-2">Dependency Explorer</h2>
        <p className="text-white/50 text-sm mb-6">
          Enter a file path to discover what files and services it imports or depends on.
        </p>

        <form onSubmit={handleSearch} className="flex gap-3">
          <Input
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            placeholder="e.g., app/services/ingestion_service.py"
            className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-purple-500/50"
            disabled={loading}
          />
          <Button 
            type="submit" 
            disabled={!filePath.trim() || loading}
            className="gradient-bg hover:opacity-90 transition-opacity"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Search className="w-4 h-4 mr-2" />
            )}
            Find Dependencies
          </Button>
        </form>

        {error && (
          <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>

      {data !== null && (
        <div className="glass p-6 rounded-2xl border border-white/10">
          <h3 className="text-lg font-medium text-white mb-4">
            Dependencies {data.length > 0 && <span className="text-white/40 text-sm font-normal ml-2">({data.length} found)</span>}
          </h3>
          {data.length > 0 ? (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
              {data.map((dep, idx) => (
                <div key={idx} className="bg-black/20 rounded-xl p-4 border border-white/5">
                  <pre className="text-white/70 text-sm whitespace-pre-wrap break-all">
                    {JSON.stringify(dep, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-white/40 text-sm italic">No dependencies found for this file path.</p>
          )}
        </div>
      )}
    </div>
  );
}

