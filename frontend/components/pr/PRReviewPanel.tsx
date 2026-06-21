'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { PRReviewResponse, BugReport, SecurityIssue, CodeSmell, ComplexityItem } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Wand2, RotateCcw, Bug, ShieldAlert, Flame, BarChart3, ClipboardCheck, Lock } from 'lucide-react';

interface PRReviewPanelProps {
  repoId: number;
}

type Severity = 'Critical' | 'High' | 'Medium' | 'Low';

function severityColors(s: Severity) {
  switch (s) {
    case 'Critical': return { border: 'border-l-red-500', badge: 'bg-red-500/20 text-red-300 border-red-500/40', dot: 'bg-red-500' };
    case 'High':     return { border: 'border-l-orange-500', badge: 'bg-orange-500/20 text-orange-300 border-orange-500/40', dot: 'bg-orange-500' };
    case 'Medium':   return { border: 'border-l-yellow-500', badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40', dot: 'bg-yellow-500' };
    case 'Low':      return { border: 'border-l-blue-500', badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40', dot: 'bg-blue-500' };
  }
}

function riskColors(r: 'Low' | 'Medium' | 'High') {
  switch (r) {
    case 'High':   return 'bg-red-500/20 text-red-300 border-red-500/40';
    case 'Medium': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
    case 'Low':    return 'bg-green-500/20 text-green-300 border-green-500/40';
  }
}

function scoreColor(score: number) {
  if (score >= 80) return { ring: 'ring-green-500', text: 'text-green-400', bg: 'bg-green-500/10' };
  if (score >= 60) return { ring: 'ring-yellow-500', text: 'text-yellow-400', bg: 'bg-yellow-500/10' };
  return { ring: 'ring-red-500', text: 'text-red-400', bg: 'bg-red-500/10' };
}

function approvalConfig(rec: PRReviewResponse['approval_recommendation']) {
  switch (rec) {
    case 'Approve':               return { label: '✅ Approve', cls: 'bg-green-500/20 text-green-300 border-green-500/40' };
    case 'Approve with Changes':  return { label: '⚡ Approve with Changes', cls: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' };
    case 'Request Changes':       return { label: '🚫 Request Changes', cls: 'bg-red-500/20 text-red-300 border-red-500/40' };
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function BugCard({ bug }: { bug: BugReport }) {
  const c = severityColors(bug.severity);
  return (
    <Card className={`glass border-white/5 border-l-4 ${c.border} p-4 hover:border-white/10 transition-all duration-300`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <code className="text-xs bg-white/10 text-cyan-300 px-2 py-0.5 rounded font-mono break-all">{bug.file}</code>
        <Badge className={`${c.badge} border text-xs shrink-0`}>{bug.severity}</Badge>
      </div>
      {bug.line_hint && (
        <p className="text-[11px] text-white/40 mb-1 font-mono">Line: {bug.line_hint}</p>
      )}
      <p className="text-sm text-white/80 leading-relaxed">{bug.description}</p>
    </Card>
  );
}

function SecurityCard({ issue }: { issue: SecurityIssue }) {
  const c = severityColors(issue.severity);
  return (
    <Card className={`glass border-white/5 border-l-4 ${c.border} p-4 hover:border-white/10 transition-all duration-300`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-orange-400 shrink-0" />
          <code className="text-xs bg-white/10 text-cyan-300 px-2 py-0.5 rounded font-mono break-all">{issue.file}</code>
        </div>
        <Badge className={`${c.badge} border text-xs shrink-0`}>{issue.severity}</Badge>
      </div>
      <p className="text-sm text-white/80 leading-relaxed mb-2">{issue.description}</p>
      {issue.recommendation && (
        <p className="text-xs text-green-300/70 leading-relaxed border-t border-white/5 pt-2 mt-2">
          💡 {issue.recommendation}
        </p>
      )}
    </Card>
  );
}

function SmellCard({ smell }: { smell: CodeSmell }) {
  return (
    <Card className="glass border-white/5 border-l-4 border-l-purple-500 p-4 hover:border-white/10 transition-all duration-300">
      <div className="flex items-start justify-between gap-2 mb-2">
        <code className="text-xs bg-white/10 text-cyan-300 px-2 py-0.5 rounded font-mono break-all">{smell.file}</code>
        <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/40 border text-xs shrink-0">{smell.smell_type}</Badge>
      </div>
      <p className="text-sm text-white/80 leading-relaxed mb-2">{smell.description}</p>
      <p className="text-xs text-purple-300/70 leading-relaxed">💡 {smell.suggestion}</p>
    </Card>
  );
}

function ComplexityTable({ items }: { items: ComplexityItem[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/5">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-white/5 text-white/40 uppercase tracking-wider">
            <th className="px-3 py-2.5 text-left font-semibold">File</th>
            <th className="px-3 py-2.5 text-left font-semibold">Function</th>
            <th className="px-3 py-2.5 text-center font-semibold">Old CC</th>
            <th className="px-3 py-2.5 text-center font-semibold">New CC</th>
            <th className="px-3 py-2.5 text-center font-semibold">Risk</th>
            <th className="px-3 py-2.5 text-left font-semibold">Recommendation</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {items.map((row, i) => {
            const increased = row.new_complexity > row.previous_complexity;
            return (
              <tr key={i} className="hover:bg-white/3 transition-colors duration-200">
                <td className="px-3 py-2.5">
                  <code className="text-cyan-300/80 font-mono text-[11px] break-all">{row.file}</code>
                </td>
                <td className="px-3 py-2.5 text-white/70 font-mono text-[11px]">{row.function_name}</td>
                <td className="px-3 py-2.5 text-center text-white/50">{row.previous_complexity}</td>
                <td className={`px-3 py-2.5 text-center font-bold ${increased ? 'text-red-400' : 'text-green-400'}`}>
                  {row.new_complexity} {increased ? '↑' : '↓'}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <Badge className={`${riskColors(row.risk)} border text-[10px]`}>{row.risk}</Badge>
                </td>
                <td className="px-3 py-2.5 text-white/60 max-w-xs">{row.recommendation}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SectionHeader({ icon, title, count }: { icon: React.ReactNode; title: string; count: number }) {
  return (
    <h3 className="text-sm font-semibold text-white/40 tracking-wider uppercase mb-3 flex items-center gap-2">
      {icon} {title}
      <span className="ml-1 px-1.5 py-0.5 rounded-md bg-white/10 text-white/40 text-[10px] font-bold">{count}</span>
    </h3>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PRReviewPanel({ repoId }: PRReviewPanelProps) {
  const [diff, setDiff] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PRReviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!diff.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.prReview.submitReview(repoId, diff);
      setResult(data);
    } catch {
      setError('Failed to analyze pull request. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setDiff('');
    setError(null);
  };

  // ── Input State ────────────────────────────────────────────────────────────
  if (!result) {
    return (
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="glass border border-white/5 rounded-2xl p-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 via-transparent to-orange-500/5 pointer-events-none" />
          <div className="relative flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl gradient-bg flex items-center justify-center glow-md shrink-0">
              <Wand2 className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">🔍 AI Pull Request Review</h2>
              <p className="text-white/50 text-sm mt-1">
                Paste your git diff below for an instant AI-powered code review
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <Card className="glass border-white/5 p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-white/40 uppercase tracking-wider block mb-2">
                Git Diff
              </label>
              <textarea
                value={diff}
                onChange={(e) => setDiff(e.target.value)}
                placeholder={`Paste your git diff here (output of 'git diff main..feature-branch')…`}
                rows={20}
                disabled={loading}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm font-mono text-white/80 placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/30 resize-y transition-all duration-200 disabled:opacity-50 leading-relaxed"
              />
            </div>

            {error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                ⚠️ {error}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!diff.trim() || loading}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl gradient-bg text-white text-sm font-semibold shadow-lg glow-md hover:opacity-90 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4" />
                )}
                {loading ? 'Analyzing…' : 'Analyze Pull Request'}
              </button>
            </div>
          </form>
        </Card>
      </div>
    );
  }

  // ── Results State ──────────────────────────────────────────────────────────
  const sc = scoreColor(result.overall_score);
  const maintSc = scoreColor(result.maintainability_score);
  const approval = approvalConfig(result.approval_recommendation);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Score Banner */}
      <Card className="glass border-white/5 p-6 shadow-xl">
        <div className="flex flex-wrap items-center gap-6">
          {/* Overall score */}
          <div className={`w-20 h-20 rounded-full ring-4 ${sc.ring} ${sc.bg} flex flex-col items-center justify-center shrink-0`}>
            <span className={`text-2xl font-black ${sc.text}`}>{result.overall_score}</span>
            <span className="text-[10px] text-white/40">/100</span>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-white/40 uppercase tracking-wider font-semibold">Overall Quality Score</p>
            {/* Maintainability */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/50">Maintainability:</span>
              <span className={`text-sm font-bold ${maintSc.text}`}>{result.maintainability_score}/100</span>
            </div>
          </div>

          {/* Approval */}
          <div className="ml-auto">
            <Badge className={`${approval.cls} border text-sm font-semibold px-4 py-1.5`}>
              {approval.label}
            </Badge>
          </div>

          {/* Reset button */}
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/50 hover:text-white/80 transition-all duration-200"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Review another diff
          </button>
        </div>
      </Card>

      {/* Summary */}
      <Card className="glass border-white/5 p-6 shadow-xl">
        <h3 className="text-sm font-semibold text-white/40 tracking-wider uppercase mb-3">📊 Summary</h3>
        <p className="text-sm text-white/80 leading-relaxed">{result.summary}</p>
      </Card>

      {/* Bugs */}
      {result.bugs?.length > 0 && (
        <div>
          <SectionHeader icon={<Bug className="w-4 h-4 text-red-400" />} title="Bugs" count={result.bugs.length} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.bugs.map((bug, i) => <BugCard key={i} bug={bug} />)}
          </div>
        </div>
      )}

      {/* Security Issues */}
      {result.security_issues?.length > 0 && (
        <div>
          <SectionHeader icon={<ShieldAlert className="w-4 h-4 text-orange-400" />} title="Security Issues" count={result.security_issues.length} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.security_issues.map((issue, i) => <SecurityCard key={i} issue={issue} />)}
          </div>
        </div>
      )}

      {/* Code Smells */}
      {result.code_smells?.length > 0 && (
        <div>
          <SectionHeader icon={<Flame className="w-4 h-4 text-purple-400" />} title="Code Smells" count={result.code_smells.length} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.code_smells.map((smell, i) => <SmellCard key={i} smell={smell} />)}
          </div>
        </div>
      )}

      {/* Complexity Analysis */}
      {result.complexity_analysis?.length > 0 && (
        <div>
          <SectionHeader icon={<BarChart3 className="w-4 h-4 text-cyan-400" />} title="Complexity Analysis" count={result.complexity_analysis.length} />
          <ComplexityTable items={result.complexity_analysis} />
        </div>
      )}

      {/* Testing Recommendations */}
      {result.testing_recommendations?.length > 0 && (
        <Card className="glass border-white/5 p-6 shadow-xl">
          <SectionHeader icon={<ClipboardCheck className="w-4 h-4 text-green-400" />} title="Testing Recommendations" count={result.testing_recommendations.length} />
          <ol className="space-y-3">
            {result.testing_recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-white/80 leading-relaxed">
                <span className="shrink-0 w-6 h-6 rounded-lg bg-green-500/15 border border-green-500/25 flex items-center justify-center text-green-400 text-xs font-bold">
                  {i + 1}
                </span>
                <span>{rec}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
