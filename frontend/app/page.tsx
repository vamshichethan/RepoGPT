'use client';

import { useRouter } from 'next/navigation';
import { useRepository } from '@/hooks/useRepository';
import { RepoSubmitForm } from '@/components/repo/RepoSubmitForm';
import { RepoCard } from '@/components/repo/RepoCard';

const FLOATING_SYMBOLS = [
  { symbol: '{...}', delay: '0s', x: '10%', y: '20%', size: 'text-2xl' },
  { symbol: '</>', delay: '1s', x: '85%', y: '15%', size: 'text-3xl' },
  { symbol: 'git', delay: '2s', x: '75%', y: '60%', size: 'text-xl' },
  { symbol: '()', delay: '0.5s', x: '5%', y: '70%', size: 'text-4xl' },
  { symbol: '#!', delay: '1.5s', x: '90%', y: '80%', size: 'text-2xl' },
  { symbol: '→', delay: '3s', x: '50%', y: '85%', size: 'text-3xl' },
  { symbol: '[]', delay: '2.5s', x: '20%', y: '88%', size: 'text-xl' },
];

const FEATURES = [
  {
    icon: '🔍',
    title: 'Smart Ingestion',
    description:
      'Clone any public GitHub repository, scan all files, chunk and embed code semantically for precise retrieval.',
  },
  {
    icon: '🧠',
    title: 'AI Summary',
    description:
      'Get instant GPT-4o powered summaries: project purpose, tech stack, folder structure, modules, and dependencies.',
  },
  {
    icon: '💬',
    title: 'Repo Chat',
    description:
      'Ask natural language questions about any codebase. Get answers grounded in actual source files with citations.',
  },
];

export default function HomePage() {
  const router = useRouter();
  const { repositories, loading, addRepository } = useRepository();

  const handleSubmit = async (url: string) => {
    const repo = await addRepository(url);
    if (repo?.id) {
      router.push(`/repo/${repo.id}`);
    }
    return repo;
  };

  return (
    <div className="relative min-h-screen mesh-gradient overflow-hidden">
      {/* Floating code symbols */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {FLOATING_SYMBOLS.map((item, i) => (
          <div
            key={i}
            className="absolute font-mono text-white/5 animate-float select-none"
            style={{
              left: item.x,
              top: item.y,
              animationDelay: item.delay,
              fontSize: item.size === 'text-4xl' ? '2.25rem' : item.size === 'text-3xl' ? '1.875rem' : item.size === 'text-2xl' ? '1.5rem' : '1.25rem',
              animationDuration: `${6 + i}s`,
            }}
          >
            {item.symbol}
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg gradient-bg flex items-center justify-center text-white font-bold text-sm glow-sm">
            R
          </div>
          <span className="font-semibold text-white tracking-tight">RepoGPT</span>
        </div>
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-white/50 hover:text-white/90 transition-colors duration-200 glass px-3 py-1.5 rounded-lg"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
          GitHub
        </a>
      </header>

      {/* Hero Section */}
      <main className="relative z-10">
        <section className="flex flex-col items-center justify-center px-6 pt-24 pb-16 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 glass px-3 py-1.5 rounded-full text-xs text-purple-300 mb-8 animate-fade-in">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            Powered by GPT-4o · Instant Analysis
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6 animate-slide-up">
            Understand Any{' '}
            <span className="gradient-text">GitHub Repo</span>
            <br />
            in Minutes
          </h1>

          {/* Subtitle */}
          <p className="text-lg sm:text-xl text-white/50 max-w-2xl mb-10 leading-relaxed animate-slide-up" style={{ animationDelay: '0.1s' }}>
            AI-powered codebase analysis powered by GPT-4o. Clone, analyze, and chat with any
            repository — instantly understand architecture, modules, and dependencies.
          </p>

          {/* Form */}
          <div className="w-full max-w-2xl animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <RepoSubmitForm onSubmit={handleSubmit} />
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-20 w-full max-w-4xl animate-slide-up" style={{ animationDelay: '0.3s' }}>
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="glass rounded-2xl p-6 text-left hover-lift group"
              >
                <div className="text-2xl mb-3 group-hover:scale-110 transition-transform duration-200">{f.icon}</div>
                <h3 className="font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-white/50 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Repository List */}
        {(repositories.length > 0 || loading) && (
          <section className="px-6 pb-20 max-w-6xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-xl font-semibold text-white">Recent Repositories</h2>
              <span className="glass px-2 py-0.5 rounded-full text-xs text-white/50">
                {repositories.length}
              </span>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="glass rounded-2xl p-5 h-40 animate-pulse">
                    <div className="h-4 bg-white/5 rounded w-2/3 mb-3" />
                    <div className="h-3 bg-white/5 rounded w-1/2 mb-6" />
                    <div className="h-3 bg-white/5 rounded w-full mb-2" />
                    <div className="h-3 bg-white/5 rounded w-3/4" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {repositories.map((repo) => (
                  <RepoCard key={repo.id} repo={repo} />
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
