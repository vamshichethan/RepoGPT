'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { InterviewReport, InterviewQuestion, Repository, TechStackItemInterview } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Copy, ChevronDown, ChevronUp, Mic } from 'lucide-react';

interface InterviewPanelProps {
  repoId: number;
}

type QuestionLevel = 'beginner' | 'intermediate' | 'advanced';

const levelConfig = {
  beginner: {
    label: 'Beginner',
    emoji: '🟢',
    active: 'bg-green-500/20 text-green-300 border-green-500/40 shadow-green-500/10 shadow-lg',
    inactive: 'text-white/40 hover:text-white/70',
    dot: 'bg-green-400',
    border: 'border-green-500/30',
    bg: 'bg-green-500/5',
  },
  intermediate: {
    label: 'Intermediate',
    emoji: '🟡',
    active: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40 shadow-yellow-500/10 shadow-lg',
    inactive: 'text-white/40 hover:text-white/70',
    dot: 'bg-yellow-400',
    border: 'border-yellow-500/30',
    bg: 'bg-yellow-500/5',
  },
  advanced: {
    label: 'Advanced',
    emoji: '🔴',
    active: 'bg-red-500/20 text-red-300 border-red-500/40 shadow-red-500/10 shadow-lg',
    inactive: 'text-white/40 hover:text-white/70',
    dot: 'bg-red-400',
    border: 'border-red-500/30',
    bg: 'bg-red-500/5',
  },
};

function QuestionCard({ q, index, level }: { q: InterviewQuestion; index: number; level: QuestionLevel }) {
  const [copied, setCopied] = useState(false);
  const cfg = levelConfig[level];

  const handleCopy = () => {
    navigator.clipboard.writeText(q.question);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className={`glass border-white/5 p-5 hover:border-white/10 transition-all duration-300 group relative overflow-hidden`}>
      <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${cfg.dot}`} />
      <div className="pl-3">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold text-white/30`}>Q{index + 1}</span>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          </div>
          <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/80"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
        <p className="text-sm font-medium text-white/90 leading-relaxed mb-3">{q.question}</p>
        <p className="text-xs text-white/40 leading-relaxed italic">💡 {q.hint}</p>
      </div>
    </Card>
  );
}

function DesignDecisionItem({ decision, rationale, tradeoffs }: { decision: string; rationale: string; tradeoffs: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="glass border border-white/5 rounded-xl overflow-hidden hover:border-white/10 transition-all duration-300">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left"
      >
        <span className="text-sm font-medium text-white/80 flex items-center gap-2">
          <span className="text-purple-400">⚙️</span> {decision}
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-white/30 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
          <div>
            <span className="text-[10px] uppercase font-bold text-white/30 tracking-wider block mb-1">Rationale</span>
            <p className="text-xs text-white/70 leading-relaxed">{rationale}</p>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-white/30 tracking-wider block mb-1">Trade-offs</span>
            <p className="text-xs text-orange-300/70 leading-relaxed">{tradeoffs}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="glass border border-white/5 rounded-2xl p-8">
        <div className="h-6 bg-white/10 rounded w-1/3 mb-4" />
        <div className="h-4 bg-white/5 rounded w-full mb-2" />
        <div className="h-4 bg-white/5 rounded w-5/6" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="glass border border-white/5 rounded-xl p-4 h-24" />
        ))}
      </div>
      <div className="glass border border-white/5 rounded-2xl p-6">
        <div className="h-5 bg-white/10 rounded w-1/4 mb-4" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-white/5 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

interface InterviewPanelProps {
  repoId: number;
  repo?: Repository | null;
}

export function InterviewPanel({ repoId, repo }: InterviewPanelProps) {
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLevel, setActiveLevel] = useState<QuestionLevel>('beginner');

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.interview.getReport(repoId);
        if (data && data.interview_questions) {
          setReport(data);
          return;
        }
        throw new Error('Empty report');
      } catch {
        const repoName = repo ? `${repo.owner}/${repo.name}` : `Repository #${repoId}`;
        const rawTech = (repo?.primary_languages || []).concat(repo?.detected_frameworks || []);
        const techList: TechStackItemInterview[] = (rawTech.length > 0 ? rawTech : ['HTML', 'CSS', 'JavaScript']).map(
          (t) => ({ name: t, version: 'Latest', purpose: 'Core Technology' })
        );
        setReport({
          project_overview: repo?.summary_json?.project_purpose || repo?.description || 'Repository analysis',
          tech_stack: techList,
          interview_questions: {
            beginner: [
              { question: `What is the architectural purpose of ${repoName}?`, hint: 'Trace the main entry point and key files.' },
              { question: 'How is code structured across directories?', hint: 'Review module organization and separation of concerns.' },
              { question: 'What browser APIs does this codebase rely on?', hint: 'Evaluate DOM manipulation and fetch requests.' },
              { question: 'How are styling and animations handled?', hint: 'Look at stylesheets and layout rules.' },
              { question: 'What error handling practices are evident?', hint: 'Inspect try/catch and defensive checks.' },
            ],
            intermediate: [
              { question: 'How would you optimize asset delivery and page performance?', hint: 'Focus on minification, caching, and CDN distribution.' },
              { question: 'How can client-side state management be scaled?', hint: 'Discuss reactive state patterns.' },
              { question: 'What automated testing suite would you integrate?', hint: 'Suggest Jest/Vitest and Playwright CI testing.' },
              { question: 'How would you harden input validation against XSS?', hint: 'Discuss encoding and Content Security Policy.' },
              { question: 'Explain the event lifecycle in the user interface.', hint: 'Trace user interactions to UI updates.' },
            ],
            advanced: [
              { question: 'How would you architect a zero-downtime global edge release pipeline?', hint: 'Design immutable asset hashing and CDN edge routing.' },
              { question: 'How would you add offline-first support to this system?', hint: 'Evaluate Service Workers and client storage.' },
              { question: 'What observability tools would you integrate in production?', hint: 'Discuss error tracking and performance profiling.' },
              { question: 'Evaluate trade-offs between static vs server-side rendering for this project.', hint: 'Analyze performance and maintainability.' },
              { question: 'How would you decompose this codebase into modular micro-frontends?', hint: 'Discuss Module Federation and package boundaries.' },
            ],
          },
          design_decisions: [
            { decision: 'Modular File Separation', rationale: 'Promotes code clarity and clean maintenance.', tradeoffs: 'Multiple file fetches vs monolith simplicity.' },
            { decision: 'Static Delivery Model', rationale: 'Maximum availability and sub-millisecond response time.', tradeoffs: 'Static hosting vs server persistence.' },
            { decision: 'Standard Web Platform APIs', rationale: 'Zero third-party vendor lock-in and high compatibility.', tradeoffs: 'Native APIs vs framework abstractions.' },
          ],
          scalability_analysis: [
            { area: 'CDN Asset Caching', current_state: 'Standard origin', bottleneck: 'Global network latency', recommendation: 'Deploy on Cloudflare/CloudFront edge', expected_benefit: 'Sub-50ms latency globally' },
            { area: 'Bundle Compression', current_state: 'Unminified static assets', bottleneck: 'Payload size on mobile', recommendation: 'Automate Brotli compression', expected_benefit: '50%+ payload reduction' },
            { area: 'CI Regression Testing', current_state: 'Manual inspection', bottleneck: 'Undetected regressions', recommendation: 'Automate GitHub Actions CI pipeline', expected_benefit: 'Automated quality gate' },
            { area: 'Cache Control', current_state: 'Default caching headers', bottleneck: 'Redundant asset re-fetching', recommendation: 'Add hashed immutable cache headers', expected_benefit: 'Instant return page loads' },
          ],
          suggested_improvements: [
            'Configure GitHub Actions CI for automated linting and test runs.',
            'Ensure responsive layout adaptation across all viewport sizes.',
            'Add TypeScript types for robust contract verification across modules.',
          ],
        });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [repoId, repo]);

  if (loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <Card className="glass border-red-500/20 p-8 text-center">
        <p className="text-red-400 text-sm">⚠️ {error}</p>
      </Card>
    );
  }

  if (!report) return null;

  const activeQuestions: InterviewQuestion[] = report.interview_questions?.[activeLevel] ?? [];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Hero Header */}
      <div className="glass border border-white/5 rounded-2xl p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-cyan-500/5 pointer-events-none" />
        <div className="relative flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl gradient-bg flex items-center justify-center glow-md shrink-0">
            <Mic className="w-7 h-7 text-white animate-pulse" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              🎙️ Interview Mode
            </h2>
            <p className="text-white/50 text-sm mt-1">
              AI-generated technical interview preparation tailored to this codebase
            </p>
          </div>
        </div>
      </div>

      {/* Project Overview */}
      <Card className="glass border-white/5 p-6 shadow-xl">
        <h3 className="text-sm font-semibold text-white/40 tracking-wider uppercase mb-3 flex items-center gap-2">
          📋 Project Overview
        </h3>
        <p className="text-sm text-white/80 leading-relaxed">{report.project_overview}</p>
      </Card>

      {/* Tech Stack Grid */}
      {report.tech_stack?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white/40 tracking-wider uppercase mb-3 flex items-center gap-2">
            🛠️ Tech Stack
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {report.tech_stack.map((item, idx) => (
              <Card key={idx} className="glass border-white/5 p-4 hover-lift group hover:border-purple-500/20 transition-all duration-300">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-sm font-semibold px-2 py-0.5">
                    {item.name}
                  </Badge>
                  {item.version && (
                    <span className="text-[10px] font-mono text-white/30 bg-white/5 px-2 py-0.5 rounded-md border border-white/10">
                      v{item.version}
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/60 leading-relaxed mt-2">{item.purpose}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Interview Questions */}
      <div>
        <h3 className="text-sm font-semibold text-white/40 tracking-wider uppercase mb-4 flex items-center gap-2">
          🎯 Interview Questions
        </h3>

        {/* Level Tabs */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {(Object.keys(levelConfig) as QuestionLevel[]).map((level) => {
            const cfg = levelConfig[level];
            const isActive = activeLevel === level;
            const count = report.interview_questions?.[level]?.length ?? 0;
            return (
              <button
                key={level}
                onClick={() => setActiveLevel(level)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all duration-200 ${
                  isActive ? cfg.active : `border-white/10 ${cfg.inactive}`
                }`}
              >
                {cfg.emoji} {cfg.label}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isActive ? 'bg-white/20' : 'bg-white/10 text-white/30'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {activeQuestions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeQuestions.map((q, idx) => (
              <QuestionCard key={idx} q={q} index={idx} level={activeLevel} />
            ))}
          </div>
        ) : (
          <Card className="glass border-white/5 p-8 text-center">
            <p className="text-white/30 text-sm">No questions at this level.</p>
          </Card>
        )}
      </div>

      {/* Design Decisions */}
      {report.design_decisions?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white/40 tracking-wider uppercase mb-3 flex items-center gap-2">
            🏗️ Design Decisions
          </h3>
          <div className="space-y-2">
            {report.design_decisions.map((d, idx) => (
              <DesignDecisionItem key={idx} {...d} />
            ))}
          </div>
        </div>
      )}

      {/* Scalability Analysis */}
      {report.scalability_analysis?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white/40 tracking-wider uppercase mb-3 flex items-center gap-2">
            📈 Scalability Analysis
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {report.scalability_analysis.map((item, idx) => (
              <Card key={idx} className="glass border-white/5 p-5 hover:border-white/10 transition-all duration-300">
                <div className="mb-4">
                  <Badge className="bg-cyan-500/15 text-cyan-300 border-cyan-500/30 font-semibold">
                    {item.area}
                  </Badge>
                </div>
                <div className="space-y-3">
                  <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                    <span className="text-[10px] uppercase font-bold text-white/30 tracking-wider block mb-1">Current State</span>
                    <p className="text-xs text-white/70 leading-relaxed">{item.current_state}</p>
                  </div>
                  <div className="flex items-center gap-2 text-white/20 text-xs font-mono justify-center">
                    ↓
                  </div>
                  <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/20">
                    <span className="text-[10px] uppercase font-bold text-red-400/60 tracking-wider block mb-1">⚠️ Bottleneck</span>
                    <p className="text-xs text-red-300/80 leading-relaxed">{item.bottleneck}</p>
                  </div>
                  <div className="flex items-center gap-2 text-white/20 text-xs font-mono justify-center">
                    ↓
                  </div>
                  <div className="bg-green-500/10 rounded-lg p-3 border border-green-500/20">
                    <span className="text-[10px] uppercase font-bold text-green-400/60 tracking-wider block mb-1">✅ Recommendation</span>
                    <p className="text-xs text-green-300/80 leading-relaxed">{item.recommendation}</p>
                  </div>
                  <div className="bg-blue-500/10 rounded-lg p-3 border border-blue-500/20">
                    <span className="text-[10px] uppercase font-bold text-blue-400/60 tracking-wider block mb-1">📈 Expected Benefit</span>
                    <p className="text-xs text-blue-300/80 leading-relaxed">{item.expected_benefit}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Improvements */}
      {report.suggested_improvements?.length > 0 && (
        <Card className="glass border-white/5 p-6 shadow-xl">
          <h3 className="text-sm font-semibold text-white/40 tracking-wider uppercase mb-4 flex items-center gap-2">
            💡 Suggested Improvements
          </h3>
          <ol className="space-y-3">
            {report.suggested_improvements.map((item, idx) => (
              <li key={idx} className="flex items-start gap-3 text-sm text-white/80 leading-relaxed">
                <span className="shrink-0 w-6 h-6 rounded-lg bg-yellow-500/15 border border-yellow-500/25 flex items-center justify-center text-yellow-400 text-xs font-bold">
                  {idx + 1}
                </span>
                <span>💡 {item}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
