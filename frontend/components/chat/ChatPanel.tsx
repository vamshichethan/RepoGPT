'use client';

import { useEffect, useRef } from 'react';
import { useChat } from '@/hooks/useChat';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ChatPanelProps {
  repoId: number;
}

const SUGGESTED_QUESTIONS = [
  "What does this project do?",
  "Where is authentication implemented?",
  "Which database is used?",
  "What are the main dependencies of this project?",
];

export function ChatPanel({ repoId }: ChatPanelProps) {
  const {
    messages,
    loading,
    streaming,
    streamingContent,
    error,
    initSession,
    sendMessage,
    createNewSession,
  } = useChat({ repoId });

  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize session on mount
  useEffect(() => {
    initSession();
  }, [initSession]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages, streamingContent]);

  const handleSuggestedClick = (question: string) => {
    sendMessage(question);
  };

  return (
    <Card className="glass border-white/5 h-full flex flex-col overflow-hidden shadow-xl rounded-2xl">
      {/* Top Session bar */}
      <div className="px-6 py-3 bg-white/5 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs font-semibold text-white/70">AI Session Active</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={createNewSession}
          className="text-xs text-purple-400 hover:text-purple-300 hover:bg-white/5 py-1 px-3 h-7 rounded-lg"
          disabled={loading || streaming}
        >
          New Chat
        </Button>
      </div>

      {/* Message List area */}
      <ScrollArea ref={scrollRef} className="flex-1 min-h-0 bg-black/10">
        <div className="flex flex-col">
          {messages.length === 0 && !streaming && !loading && (
            /* Welcome and Prompt suggestion panel */
            <div className="px-8 py-16 flex flex-col items-center text-center max-w-lg mx-auto">
              <div className="w-12 h-12 rounded-2xl gradient-bg flex items-center justify-center text-white text-xl mb-6 glow-md">
                💬
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Chat with your Repository</h3>
              <p className="text-sm text-white/40 leading-relaxed mb-8">
                Ask questions about files, functions, DB models, structure, or implementation details.
              </p>
              
              <div className="grid grid-cols-1 gap-2.5 w-full text-left">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSuggestedClick(q)}
                    className="w-full text-xs text-white/70 hover:text-white hover:bg-white/5 border border-white/5 p-3 rounded-xl transition-all duration-200"
                  >
                    💡 {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Render loaded messages */}
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}

          {/* Render active stream content */}
          {streaming && streamingContent && (
            <ChatMessage
              message={{
                role: 'assistant',
                content: streamingContent,
                isStreaming: true,
              }}
            />
          )}

          {/* Render loading state */}
          {loading && (
            <div className="p-8 flex items-center justify-center gap-3 text-white/40 text-xs">
              <div className="w-4 h-4 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
              Initialising session...
            </div>
          )}

          {/* Render error banner */}
          {error && (
            <div className="p-4 mx-6 my-4 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl">
              ⚠️ {error}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input panel at bottom */}
      <div className="p-4 border-t border-white/5 bg-black/20">
        <ChatInput onSend={sendMessage} disabled={loading || streaming} />
      </div>
    </Card>
  );
}
