'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Repository } from '@/lib/types';

interface RepoSubmitFormProps {
  onSubmit: (url: string) => Promise<Repository>;
}

const GITHUB_URL_REGEX = /^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+(\/.*)?$/;

export function RepoSubmitForm({ onSubmit }: RepoSubmitFormProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = (value: string): string | null => {
    if (!value.trim()) return 'Please enter a GitHub URL';
    if (!GITHUB_URL_REGEX.test(value.trim())) {
      return 'Please enter a valid GitHub repository URL (e.g. https://github.com/owner/repo)';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate(url);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const cleanUrl = url.trim().replace(/\/$/, '');
      await onSubmit(cleanUrl);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to submit repository. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex gap-2 p-1.5 glass-strong rounded-2xl">
        <div className="flex-1 relative">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <input
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (error) setError(null);
            }}
            placeholder="https://github.com/owner/repo"
            className="w-full bg-transparent pl-10 pr-4 py-3 text-white placeholder:text-white/30 text-sm focus:outline-none"
            disabled={loading}
          />
        </div>
        <Button
          type="submit"
          disabled={loading || !url.trim()}
          className="gradient-bg hover:opacity-90 text-white font-medium px-6 py-3 rounded-xl shrink-0 transition-all duration-200 disabled:opacity-50 glow-sm border-0"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analyzing…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              Analyze Repo
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </span>
          )}
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 glass border border-red-500/30 rounded-xl px-4 py-3 animate-fade-in">
          <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <p className="text-center text-xs text-white/25">
        Supports any public GitHub repository · Powered by GPT-4o
      </p>
    </form>
  );
}
