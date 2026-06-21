'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { Repository } from '@/lib/types';

export function useRepository() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRepositories = useCallback(async () => {
    try {
      const data = await api.repositories.list();
      setRepositories(Array.isArray(data) ? data : []);
    } catch (err) {
      setError('Failed to load repositories');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRepositories();
  }, [fetchRepositories]);

  const addRepository = useCallback(async (github_url: string): Promise<Repository> => {
    const repo = await api.repositories.create(github_url);
    if (repo.id) {
      setRepositories((prev) => {
        const filtered = prev.filter((r) => r.id !== repo.id);
        return [repo, ...filtered];
      });
    }
    return repo;
  }, []);

  const removeRepository = useCallback(async (id: number) => {
    await api.repositories.delete(id);
    setRepositories((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const refreshRepositories = useCallback(() => {
    setLoading(true);
    fetchRepositories();
  }, [fetchRepositories]);

  return {
    repositories,
    loading,
    error,
    addRepository,
    removeRepository,
    refreshRepositories,
  };
}
