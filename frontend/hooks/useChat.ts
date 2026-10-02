'use client';

import { useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import type { Message, ChatSession } from '@/lib/types';

interface UseChatOptions {
  repoId: number;
}

export function useChat({ repoId }: UseChatOptions) {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const initSession = useCallback(async () => {
    try {
      setLoading(true);
      // Try to get existing sessions first
      const sessions = await api.chat.getSessions(repoId);
      if (sessions && sessions.length > 0) {
        const latestSession = sessions[0];
        setSession(latestSession);
        const msgs = await api.chat.getMessages(latestSession.id);
        setMessages(Array.isArray(msgs) ? msgs : []);
      } else {
        // Create a new session
        const newSession = await api.chat.createSession(repoId);
        setSession(newSession);
        setMessages([]);
      }
    } catch (err) {
      setError('Failed to initialize chat session');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  const createNewSession = useCallback(async () => {
    try {
      setLoading(true);
      const newSession = await api.chat.createSession(repoId);
      setSession(newSession);
      setMessages([]);
      setError(null);
    } catch (err) {
      setError('Failed to create new session');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || streaming) return;

      let currentSession = session;
      if (!currentSession) {
        try {
          currentSession = await api.chat.createSession(repoId);
          setSession(currentSession);
        } catch (err) {
          setError('Failed to create session');
          console.error(err);
          return;
        }
      }

      // Optimistically add user message
      const userMessage: Message = {
        id: Date.now(),
        session_id: currentSession.id,
        role: 'user',
        content,
        sources: [],
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setStreaming(true);
      setStreamingContent('');
      setError(null);

      abortRef.current = new AbortController();

      try {
        const response = await fetch(
          `/api/sessions/${currentSession.id}/messages`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
            signal: abortRef.current.signal,
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';
        
        // Handle SSE streaming
        if (contentType.includes('text/event-stream') || contentType.includes('text/plain')) {
          const reader = response.body?.getReader();
          if (!reader) throw new Error('No response body');

          const decoder = new TextDecoder();
          let fullContent = '';
          let sources: Message['sources'] = [];

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') break;
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.content) {
                    fullContent += parsed.content;
                    setStreamingContent(fullContent);
                  }
                  if (parsed.sources) {
                    sources = parsed.sources;
                  }
                  if (parsed.done) {
                    break;
                  }
                } catch {
                  // Plain text chunk
                  fullContent += data;
                  setStreamingContent(fullContent);
                }
              }
            }
          }

          // Add final assistant message
          const assistantMessage: Message = {
            id: Date.now() + 1,
            session_id: currentSession.id,
            role: 'assistant',
            content: fullContent,
            sources,
            created_at: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
        } else {
          // JSON response
          const data = await response.json();
          const assistantMessage: Message = {
            id: data.id || Date.now() + 1,
            session_id: currentSession.id,
            role: 'assistant',
            content: data.content || data.message || '',
            sources: data.sources || [],
            created_at: data.created_at || new Date().toISOString(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError('Failed to send message. Please try again.');
          // Remove the optimistic user message on error
          setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
          console.error(err);
        }
      } finally {
        setStreaming(false);
        setStreamingContent('');
        abortRef.current = null;
      }
    },
    [session, streaming, repoId]
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    session,
    messages,
    loading,
    streaming,
    streamingContent,
    error,
    initSession,
    sendMessage,
    createNewSession,
    stopStreaming,
  };
}
