'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import type { IngestionStatus } from '@/lib/types';

const TERMINAL_STATUSES = ['ready', 'error'];
const POLL_INTERVAL_MS = 2000;

export function useIngestionStatus(repoId: number | null) {
  const [status, setStatus] = useState<IngestionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const fetchStatus = useCallback(async (id: number) => {
    try {
      const data = await api.repositories.getStatus(id);
      setStatus(data);
      if (TERMINAL_STATUSES.includes(data.status)) {
        stopPolling();
      }
    } catch (err) {
      setError('Failed to fetch status');
      console.error(err);
      stopPolling();
    } finally {
      setLoading(false);
    }
  }, [stopPolling]);

  useEffect(() => {
    if (!repoId) return;

    setLoading(true);
    fetchStatus(repoId);

    intervalRef.current = setInterval(() => {
      fetchStatus(repoId);
    }, POLL_INTERVAL_MS);

    return () => stopPolling();
  }, [repoId, fetchStatus, stopPolling]);

  const isTerminal = status ? TERMINAL_STATUSES.includes(status.status) : false;

  return { status, loading, error, isTerminal };
}
