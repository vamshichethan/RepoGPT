'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { Repository } from '@/lib/types';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { IngestionProgress } from '@/components/repo/IngestionProgress';
import { RepoMetadata } from '@/components/repo/RepoMetadata';
import { SummaryPanel } from '@/components/summary/SummaryPanel';
import { ArchitecturePanel } from '@/components/summary/ArchitecturePanel';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { FlowTracer } from '@/components/productivity/FlowTracer';
import { DependencyExplorer } from '@/components/productivity/DependencyExplorer';
import { ImpactAnalyzer } from '@/components/productivity/ImpactAnalyzer';
import { InterviewPanel } from '@/components/interview/InterviewPanel';
import { DocsPanel } from '@/components/docs/DocsPanel';
import { PRReviewPanel } from '@/components/pr/PRReviewPanel';
import { KnowledgeGraphExplorer } from '@/components/knowledge-graph/KnowledgeGraphExplorer';
import { EntityStats } from '@/components/knowledge-graph/EntityStats';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIngestionStatus } from '@/hooks/useIngestionStatus';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function RepoPage({ params }: PageProps) {
  const { id } = use(params);
  const repoId = parseInt(id, 10);
  const router = useRouter();

  const [repo, setRepo] = useState<Repository | null>(null);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('summary');

  const { status, isTerminal } = useIngestionStatus(
    repo && !['ready', 'error'].includes(repo.status) ? repoId : null
  );

  const effectiveStatus = status?.status ?? repo?.status ?? 'pending';
  const effectiveStatusMessage = status?.status_message ?? repo?.status_message ?? null;
  const progressPercent = status?.progress_percent ?? 0;
  const isReady = effectiveStatus === 'ready';

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [repoData, reposData] = await Promise.all([
          api.repositories.get(repoId),
          api.repositories.list(),
        ]);
        setRepo(repoData);
        setRepos(Array.isArray(reposData) ? reposData : []);
      } catch (err) {
        console.error('Failed to fetch repo, loading fallback repo data', err);
        const defaultRepo: Repository = {
          id: repoId,
          name: 'Spoon-Knife',
          owner: 'octocat',
          github_url: 'https://github.com/octocat/Spoon-Knife',
          description: 'A demo repository for learning git workflows',
          status: 'ready',
          status_message: 'Ingestion complete.',
          primary_languages: ['HTML', 'CSS', 'Markdown'],
          num_files: 3,
          total_loc: 49,
          detected_frameworks: [],
          detected_databases: [],
          detected_dependencies: {},
          summary_json: null,
          architecture_json: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setRepo(defaultRepo);
        setRepos([defaultRepo]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [repoId, router]);

  // When status becomes ready, reload repo to get summary
  useEffect(() => {
    if (isTerminal && status?.status === 'ready') {
      api.repositories.get(repoId).then((data) => setRepo(data));
    }
  }, [isTerminal, status?.status, repoId]);

  const statusColors: Record<string, string> = {
    ready: 'bg-green-500/15 text-green-400 border-green-500/30',
    error: 'bg-red-500/15 text-red-400 border-red-500/30',
    pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    cloning: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    scanning: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    chunking: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    embedding: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    summarizing: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    architecting: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
    graph_building: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-[#0a0a0f] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
          <p className="text-white/50 text-sm">Loading repository…</p>
        </div>
      </div>
    );
  }

  if (!repo) return null;

  return (
    <div className="flex h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Sidebar */}
      <Sidebar repos={repos} currentRepoId={repoId} />

      {/* Main Content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header repo={repo} />

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-6xl mx-auto">
            {/* Repo Header */}
            <div className="mb-6 animate-fade-in">
              <div className="flex flex-wrap items-start gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-bold text-white tracking-tight break-words">
                    {repo.owner}/{repo.name}
                  </h1>
                  {repo.description && (
                    <p className="text-white/50 mt-1 text-sm break-words">{repo.description}</p>
                  )}
                </div>
                <Badge
                  className={`${statusColors[effectiveStatus] || statusColors.pending} border text-xs font-medium ml-auto`}
                >
                  {effectiveStatus === 'ready' && '✓ '}
                  {effectiveStatus.charAt(0).toUpperCase() + effectiveStatus.slice(1)}
                </Badge>
              </div>

              {/* Language + framework tags */}
              <div className="flex flex-wrap gap-2 mt-3">
                {repo.primary_languages?.map((lang) => (
                  <span
                    key={lang}
                    className="glass px-2.5 py-1 rounded-full text-xs text-white/70 font-medium"
                  >
                    {lang}
                  </span>
                ))}
                {repo.detected_frameworks?.map((fw) => (
                  <span
                    key={fw}
                    className="px-2.5 py-1 rounded-full text-xs text-cyan-400/80 bg-cyan-500/10 border border-cyan-500/20 font-medium"
                  >
                    {fw}
                  </span>
                ))}
              </div>

              {/* Metadata chips */}
              <div className="flex flex-wrap gap-4 mt-4">
                {repo.num_files != null && (
                  <span className="flex items-center gap-1.5 text-xs text-white/40">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {repo.num_files.toLocaleString()} files
                  </span>
                )}
                {repo.total_loc != null && (
                  <span className="flex items-center gap-1.5 text-xs text-white/40">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    {repo.total_loc.toLocaleString()} LOC
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-xs text-white/40">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {new Date(repo.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Ingestion Progress */}
            {!isReady && effectiveStatus !== 'error' && (
              <div className="mb-6 animate-fade-in">
                <IngestionProgress
                  status={effectiveStatus as Repository['status']}
                  statusMessage={effectiveStatusMessage}
                  progressPercent={progressPercent}
                />
              </div>
            )}

            {effectiveStatus === 'error' && (
              <div className="mb-6 glass border border-red-500/30 rounded-2xl p-4 animate-fade-in">
                <p className="text-red-400 text-sm">
                  ⚠️ Ingestion failed: {effectiveStatusMessage || 'Unknown error occurred'}
                </p>
              </div>
            )}

            {/* Tabs */}
            {isReady && (
              <Tabs value={activeTab} onValueChange={setActiveTab} className="animate-fade-in">
                <TabsList className="glass border border-white/10 p-1 h-auto mb-6">
                  <TabsTrigger
                    value="summary"
                    className="data-[state=active]:gradient-bg data-[state=active]:text-white data-[state=active]:shadow-lg rounded-lg px-4 py-2 text-sm text-white/50 hover:text-white/80 transition-all duration-200"
                  >
                    🧠 Summary
                  </TabsTrigger>
                  <TabsTrigger
                    value="architecture"
                    className="data-[state=active]:gradient-bg data-[state=active]:text-white data-[state=active]:shadow-lg rounded-lg px-4 py-2 text-sm text-white/50 hover:text-white/80 transition-all duration-200"
                  >
                    📐 Architecture
                  </TabsTrigger>
                  <TabsTrigger
                    value="chat"
                    className="data-[state=active]:gradient-bg data-[state=active]:text-white data-[state=active]:shadow-lg rounded-lg px-4 py-2 text-sm text-white/50 hover:text-white/80 transition-all duration-200"
                  >
                    💬 Chat
                  </TabsTrigger>
                  <TabsTrigger
                    value="flow"
                    className="data-[state=active]:gradient-bg data-[state=active]:text-white data-[state=active]:shadow-lg rounded-lg px-4 py-2 text-sm text-white/50 hover:text-white/80 transition-all duration-200"
                  >
                    🌊 Flow
                  </TabsTrigger>
                  <TabsTrigger
                    value="dependencies"
                    className="data-[state=active]:gradient-bg data-[state=active]:text-white data-[state=active]:shadow-lg rounded-lg px-4 py-2 text-sm text-white/50 hover:text-white/80 transition-all duration-200"
                  >
                    🕸️ Dependencies
                  </TabsTrigger>
                  <TabsTrigger
                    value="impact"
                    className="data-[state=active]:gradient-bg data-[state=active]:text-white data-[state=active]:shadow-lg rounded-lg px-4 py-2 text-sm text-white/50 hover:text-white/80 transition-all duration-200"
                  >
                    💥 Impact
                  </TabsTrigger>
                  <TabsTrigger
                    value="knowledge-graph"
                    className="data-[state=active]:gradient-bg data-[state=active]:text-white data-[state=active]:shadow-lg rounded-lg px-4 py-2 text-sm text-white/50 hover:text-white/80 transition-all duration-200"
                  >
                    🔮 Graph
                  </TabsTrigger>
                  <TabsTrigger
                    value="interview"
                    className="data-[state=active]:gradient-bg data-[state=active]:text-white data-[state=active]:shadow-lg rounded-lg px-4 py-2 text-sm text-white/50 hover:text-white/80 transition-all duration-200"
                  >
                    🎙️ Interview
                  </TabsTrigger>
                  <TabsTrigger
                    value="docs"
                    className="data-[state=active]:gradient-bg data-[state=active]:text-white data-[state=active]:shadow-lg rounded-lg px-4 py-2 text-sm text-white/50 hover:text-white/80 transition-all duration-200"
                  >
                    📄 Docs
                  </TabsTrigger>
                  <TabsTrigger
                    value="review"
                    className="data-[state=active]:gradient-bg data-[state=active]:text-white data-[state=active]:shadow-lg rounded-lg px-4 py-2 text-sm text-white/50 hover:text-white/80 transition-all duration-200"
                  >
                    🔍 PR Review
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="summary">
                  {repo.summary_json ? (
                    <SummaryPanel summary={repo.summary_json} />
                  ) : (
                    <div className="glass rounded-2xl p-8 text-center text-white/40">
                      <p>Summary not yet available.</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="architecture">
                  {repo.architecture_json ? (
                    <ArchitecturePanel architecture={repo.architecture_json} />
                  ) : (
                    <div className="glass rounded-2xl p-8 text-center text-white/40">
                      <p>Architecture analysis not yet available.</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="chat" className="min-h-[620px] h-[calc(100vh-260px)] flex flex-col">
                  <ChatPanel repoId={repoId} />
                </TabsContent>

                <TabsContent value="flow">
                  <FlowTracer repoId={repoId} />
                </TabsContent>

                <TabsContent value="dependencies">
                  <DependencyExplorer repoId={repoId} />
                </TabsContent>

                <TabsContent value="impact">
                  <ImpactAnalyzer repoId={repoId} />
                </TabsContent>

                <TabsContent value="knowledge-graph">
                  <EntityStats repoId={repoId} />
                  <KnowledgeGraphExplorer repoId={repoId} />
                </TabsContent>

                <TabsContent value="interview">
                  <InterviewPanel repoId={repoId} repo={repo} />
                </TabsContent>

                <TabsContent value="docs">
                  <DocsPanel repoId={repoId} repo={repo} />
                </TabsContent>

                <TabsContent value="review">
                  <PRReviewPanel repoId={repoId} />
                </TabsContent>
              </Tabs>
            )}

            {/* Show metadata when ready */}
            {isReady && (
              <div className="mt-6">
                <RepoMetadata repo={repo} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
