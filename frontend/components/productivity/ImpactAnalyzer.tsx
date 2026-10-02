'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { ImpactAnalysisResponse } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, AlertTriangle, CheckCircle, ShieldAlert, FileWarning } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ImpactAnalyzerProps {
  repoId: number;
}

export function ImpactAnalyzer({ repoId }: ImpactAnalyzerProps) {
  const [filePath, setFilePath] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImpactAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!filePath.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const data = await api.productivity.getImpactAnalysis(repoId, filePath);
      setResult(data);
    } catch (err) {
      console.error(err);
      setError('Failed to analyze impact. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'critical': return 'text-red-500 bg-red-500/10 border-red-500/30';
      case 'high': return 'text-orange-500 bg-orange-500/10 border-orange-500/30';
      case 'medium': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30';
      case 'low': return 'text-green-500 bg-green-500/10 border-green-500/30';
      default: return 'text-white/70 bg-white/5 border-white/10';
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="glass p-6 rounded-2xl border border-white/10">
        <h2 className="text-xl font-semibold text-white mb-2">Impact Analyzer</h2>
        <p className="text-white/50 text-sm mb-6">
          Enter a file path or component name to analyze the potential blast radius of making changes to it.
        </p>
        
        <form onSubmit={handleAnalyze} className="flex gap-3">
          <Input
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            placeholder="e.g., app/database.py or src/utils/auth.ts"
            className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-purple-500/50"
            disabled={loading}
          />
          <Button 
            type="submit" 
            disabled={!filePath.trim() || loading}
            className="bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30 transition-all"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <AlertTriangle className="w-4 h-4 mr-2" />
            )}
            Analyze Impact
          </Button>
        </form>

        {error && (
          <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-3">
            <FileWarning className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}
      </div>

      {result && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
          {/* Risk Overview */}
          <div className="glass p-6 rounded-2xl border border-white/10 col-span-1 md:col-span-2 lg:col-span-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-4 rounded-full ${getRiskColor(result.risk_level).replace('text-', 'bg-').replace('/10', '/20')}`}>
                <ShieldAlert className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider mb-1">Overall Risk Level</h3>
                <div className="flex items-center gap-3">
                  <span className={`text-2xl font-bold ${getRiskColor(result.risk_level).split(' ')[0]}`}>
                    {result.risk_level}
                  </span>
                  <Badge variant="outline" className="border-white/10 text-white/70">
                    Score: {result.risk_score}/100
                  </Badge>
                </div>
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-white/50 text-sm max-w-xs">
                This score indicates the potential for unintended side-effects across the codebase.
              </p>
            </div>
          </div>

          {/* Affected Files */}
          <div className="glass p-6 rounded-2xl border border-white/10 flex flex-col">
            <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
              <FileWarning className="w-5 h-5 text-orange-400" />
              Affected Files
            </h3>
            <div className="flex-1 bg-black/20 rounded-xl p-4 border border-white/5 overflow-y-auto max-h-[300px]">
              {result.affected_files.length > 0 ? (
                <ul className="space-y-2">
                  {result.affected_files.map((file, i) => (
                    <li key={i} className="text-sm text-white/70 flex items-start gap-2 break-all">
                      <span className="text-orange-500/50 mt-0.5">•</span>
                      {file}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-white/40 text-sm italic">No dependent files found.</p>
              )}
            </div>
          </div>

          {/* Affected Features */}
          <div className="glass p-6 rounded-2xl border border-white/10 flex flex-col">
            <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-blue-400" />
              Affected Features
            </h3>
            <div className="flex-1 bg-black/20 rounded-xl p-4 border border-white/5 overflow-y-auto max-h-[300px]">
              {result.affected_features.length > 0 ? (
                <ul className="space-y-2">
                  {result.affected_features.map((feature, i) => (
                    <li key={i} className="text-sm text-white/70 flex items-start gap-2">
                      <span className="text-blue-500/50 mt-0.5">•</span>
                      {feature}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-white/40 text-sm italic">No specific business features identified.</p>
              )}
            </div>
          </div>

          {/* Recommendations */}
          <div className="glass p-6 rounded-2xl border border-white/10 flex flex-col">
            <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-green-400" />
              Testing Recommendations
            </h3>
            <div className="flex-1 bg-black/20 rounded-xl p-4 border border-white/5 overflow-y-auto max-h-[300px]">
              {result.testing_recommendations.length > 0 ? (
                <ul className="space-y-3">
                  {result.testing_recommendations.map((rec, i) => (
                    <li key={i} className="text-sm text-white/70 flex items-start gap-2">
                      <span className="text-green-500/50 mt-0.5 font-bold">{i + 1}.</span>
                      {rec}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-white/40 text-sm italic">No specific testing recommendations.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
