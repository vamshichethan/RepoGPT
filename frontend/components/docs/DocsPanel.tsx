'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { DocsResponse, Repository } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Check, Copy, Download, FileText, BookOpen, Code2, Rocket } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';

interface DocsPanelProps {
  repoId: number;
}

type DocTab = 'readme' | 'architecture_doc' | 'api_docs' | 'onboarding';

const tabs: { key: DocTab; label: string; icon: React.ReactNode; filename: string }[] = [
  { key: 'readme', label: 'README', icon: <BookOpen className="w-4 h-4" />, filename: 'README.md' },
  { key: 'architecture_doc', label: 'Architecture', icon: <FileText className="w-4 h-4" />, filename: 'ARCHITECTURE.md' },
  { key: 'api_docs', label: 'API Docs', icon: <Code2 className="w-4 h-4" />, filename: 'API_DOCS.md' },
  { key: 'onboarding', label: 'Onboarding', icon: <Rocket className="w-4 h-4" />, filename: 'ONBOARDING.md' },
];

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="glass border border-white/5 rounded-2xl p-6">
        <div className="flex gap-2 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-9 w-28 bg-white/10 rounded-xl" />
          ))}
        </div>
        <div className="space-y-3">
          <div className="h-5 bg-white/10 rounded w-1/3" />
          <div className="h-4 bg-white/5 rounded w-full" />
          <div className="h-4 bg-white/5 rounded w-5/6" />
          <div className="h-4 bg-white/5 rounded w-4/6" />
          <div className="h-4 bg-white/5 rounded w-full" />
          <div className="h-4 bg-white/5 rounded w-3/4" />
        </div>
      </div>
    </div>
  );
}

interface ActionBarProps {
  content: string;
  filename: string;
}

function ActionBar({ content, filename }: ActionBarProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/60 hover:text-white/90 transition-all duration-200"
      >
        {copied ? (
          <><Check className="w-3.5 h-3.5 text-green-400" /> Copied!</>
        ) : (
          <><Copy className="w-3.5 h-3.5" /> 📋 Copy Markdown</>
        )}
      </button>
      <button
        onClick={handleDownload}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-xs text-purple-300 hover:text-purple-200 transition-all duration-200"
      >
        <Download className="w-3.5 h-3.5" /> ⬇️ Download .md
      </button>
    </div>
  );
}

interface DocsPanelProps {
  repoId: number;
  repo?: Repository | null;
}

export function DocsPanel({ repoId, repo }: DocsPanelProps) {
  const [docs, setDocs] = useState<DocsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DocTab>('readme');

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.docs.getDocs(repoId);
        if (data && (data.readme || data.architecture_doc)) {
          setDocs(data);
          return;
        }
        throw new Error('Empty docs');
      } catch {
        const repoName = repo ? `${repo.owner}/${repo.name}` : `Repository #${repoId}`;
        const tech = repo?.primary_languages?.join(', ') || 'HTML, CSS, JavaScript';
        const overview = repo?.summary_json?.project_purpose || repo?.description || 'Codebase';
        const techStackStr = repo?.summary_json?.tech_stack
          ? Object.entries(repo.summary_json.tech_stack).map(([k, v]) => `${k}: ${v}`).join(', ')
          : tech;
        setDocs({
          readme: `# ${repoName}\n\n${overview}\n\n## Tech Stack\n${techStackStr}\n\n## Structure\n\`\`\`\n${repo?.summary_json?.folder_structure || 'src/'}\n\`\`\``,
          architecture_doc: `# Architecture: ${repoName}\n\n${repo?.architecture_json?.architecture_summary || overview}\n\n${repo?.architecture_json?.mermaid_code ? `\`\`\`mermaid\n${repo.architecture_json.mermaid_code}\n\`\`\`` : ''}`,
          api_docs: `# API & Module Reference\n\n${repo?.architecture_json?.data_flow_description || 'Module structure analyzed from repository files.'}\n\nTotal Files: ${repo?.num_files || 0} | Lines of Code: ${repo?.total_loc || 0}`,
          onboarding: `# Developer Onboarding\n\n### Prerequisites\n- Git 2.30+\n- Modern web browser\n\n### Setup\n\`\`\`bash\ngit clone https://github.com/${repoName}.git\n\`\`\``,
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

  if (!docs) return null;

  const currentTab = tabs.find((t) => t.key === activeTab)!;
  const currentContent: string = docs[activeTab] ?? '';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="glass border border-white/5 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5 pointer-events-none" />
        <div className="relative flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl gradient-bg flex items-center justify-center glow-md shrink-0">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              📄 Auto Documentation
            </h2>
            <p className="text-white/50 text-xs mt-1">
              AI-generated, production-ready docs — export and drop straight into your repo
            </p>
          </div>
        </div>
      </div>

      {/* Tab bar + content */}
      <Card className="glass border-white/5 overflow-hidden shadow-xl">
        {/* Tab Header */}
        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-0 border-b border-white/5 flex-wrap gap-y-3">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-all duration-200 ${
                  activeTab === tab.key
                    ? 'text-white border-purple-400 bg-purple-500/10'
                    : 'text-white/40 border-transparent hover:text-white/70 hover:bg-white/5'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
          <div className="pb-3">
            <ActionBar content={currentContent} filename={currentTab.filename} />
          </div>
        </div>

        {/* Markdown Content */}
        <div className="overflow-y-auto max-h-[70vh] p-6">
          {currentContent ? (
            <div className="prose prose-invert prose-sm max-w-none
              prose-headings:text-white prose-headings:font-bold
              prose-h1:text-xl prose-h1:mb-4
              prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-3 prose-h2:border-b prose-h2:border-white/10 prose-h2:pb-2
              prose-h3:text-base prose-h3:mt-4 prose-h3:mb-2
              prose-p:text-white/75 prose-p:leading-relaxed
              prose-a:text-purple-400 prose-a:no-underline hover:prose-a:text-purple-300 hover:prose-a:underline
              prose-code:text-cyan-300 prose-code:bg-white/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono
              prose-pre:bg-transparent prose-pre:p-0 prose-pre:m-0
              prose-blockquote:border-l-purple-500 prose-blockquote:text-white/60 prose-blockquote:bg-purple-500/5 prose-blockquote:rounded-r-lg prose-blockquote:py-1
              prose-table:text-sm prose-th:text-white prose-th:bg-white/10 prose-td:text-white/70 prose-td:border-white/10 prose-th:border-white/10
              prose-strong:text-white
              prose-li:text-white/75 prose-li:marker:text-purple-400
              prose-hr:border-white/10">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {currentContent}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="text-center py-12 text-white/30 text-sm">
              No content available for this section.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
