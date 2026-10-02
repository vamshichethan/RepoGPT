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

  useEffect(() => {
    if (!repoId) return;

    let ignore = false;

    const poll = async () => {
      try {
        const data = await api.repositories.getStatus(repoId);
        if (!ignore) {
          setStatus(data);
          setError(null);
          setLoading(false);
          if (TERMINAL_STATUSES.includes(data.status)) {
            stopPolling();
          }
        }
      } catch (err) {
        if (!ignore) {
          setError('Failed to fetch status');
          console.error(err);
          setLoading(false);
          stopPolling();
        }
      }
    };

    poll();

    intervalRef.current = setInterval(() => {
      poll();
    }, POLL_INTERVAL_MS);

    return () => {
      ignore = true;
      stopPolling();
    };
  }, [repoId, stopPolling]);

  const isTerminal = status ? TERMINAL_STATUSES.includes(status.status) : false;

  return { status, loading, error, isTerminal };
}
