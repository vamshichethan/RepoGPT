'use client';

import type { Message, ChatSource } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ChatMessageProps {
  message: Partial<Message> & { isStreaming?: boolean };
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isStreaming = message.isStreaming;

  // Simple parser to format markdown-like text and code blocks
  const renderContent = (text: string) => {
    if (!text) return null;

    // Split text by code blocks: ```lang\ncode\n```
    const parts = text.split(/(```[\s\S]*?```)/g);

    return parts.map((part, idx) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        // Code Block
        const lines = part.slice(3, -3).trim().split('\n');
        const firstLine = lines[0] || '';
        const hasLang = /^[a-zA-Z0-9_-]+$/.test(firstLine);
        const language = hasLang ? firstLine : '';
        const code = hasLang ? lines.slice(1).join('\n') : lines.join('\n');

        return (
          <div key={idx} className="my-3 rounded-xl overflow-hidden border border-white/5 bg-black/40 shadow-inner max-w-full font-mono text-xs">
            {language && (
              <div className="bg-white/5 px-4 py-2 text-[10px] font-bold text-white/40 border-b border-white/5 flex items-center justify-between uppercase tracking-wider">
                <span>{language}</span>
                <span className="normal-case font-normal text-white/20 select-none">Code block</span>
              </div>
            )}
            <pre className="p-4 overflow-x-auto leading-relaxed scrollbar-thin text-purple-300">
              <code>{code}</code>
            </pre>
          </div>
        );
      } else {
        // Plain Text with simple markdown formatting (inline code `code` and bold **text**)
        const textLines = part.split('\n');
        return textLines.map((line, lIdx) => {
          if (!line.trim() && lIdx > 0) return <div key={`empty-${lIdx}`} className="h-2" />;

          // Process inline code `code`
          const inlineParts = line.split(/(`[^`]+`)/g);

          return (
            <p key={lIdx} className="leading-relaxed mb-1 text-sm text-white/80">
              {inlineParts.map((subPart, sIdx) => {
                if (subPart.startsWith('`') && subPart.endsWith('`')) {
                  return (
                    <code key={sIdx} className="font-mono text-xs bg-white/10 px-1.5 py-0.5 rounded text-cyan-300 border border-white/5">
                      {subPart.slice(1, -1)}
                    </code>
                  );
                }

                // Process bold **text**
                const boldParts = subPart.split(/(\*\*[^*]+\*\*)/g);
                return boldParts.map((bPart, bIdx) => {
                  if (bPart.startsWith('**') && bPart.endsWith('**')) {
                    return (
                      <strong key={bIdx} className="font-semibold text-white">
                        {bPart.slice(2, -2)}
                      </strong>
                    );
                  }
                  return bPart;
                });
              })}
            </p>
          );
        });
      }
    });
  };

  return (
    <div
      className={cn(
        "flex w-full gap-4 py-4 px-6 border-b border-white/[0.03] animate-fade-in",
        isUser ? "bg-white/[0.01]" : "bg-transparent"
      )}
    >
      {/* Role Avatar Icon */}
      <div
        className={cn(
          "w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 select-none shadow-md",
          isUser
            ? "bg-purple-600/20 text-purple-400 border border-purple-500/20"
            : "gradient-bg text-white glow-sm"
        )}
      >
        {isUser ? 'U' : 'AI'}
      </div>

      {/* Message content panel */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-bold tracking-wide text-white/90">
            {isUser ? 'You' : 'RepoGPT'}
          </span>
          <span className="text-[10px] text-white/30">
            {message.created_at ? new Date(message.created_at).toLocaleTimeString() : 'Just now'}
          </span>
        </div>

        {/* Content body */}
        <div className="relative break-words select-text">
          {renderContent(message.content || '')}
          
          {/* Streaming blinking cursor */}
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 ml-1 bg-purple-500 animate-pulse-glow vertical-middle" />
          )}
        </div>

        {/* Sources citations */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-4 pt-3 border-t border-white/5 flex flex-col gap-2">
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">
              Cited Sources ({message.sources.length})
            </span>
            <div className="flex flex-wrap gap-2">
              {message.sources.map((src: ChatSource, sIdx: number) => (
                <Badge
                  key={sIdx}
                  variant="outline"
                  className="bg-white/5 text-[10px] py-1 px-2.5 font-mono border-white/5 text-cyan-400 max-w-xs truncate hover:bg-white/10 transition-colors"
                  title={`${src.file_path} (Chunk ${src.chunk_index}) - Score: ${Math.round(src.relevance_score * 100)}%`}
                >
                  📄 {src.file_path.split('/').pop()}
                  <span className="text-white/20 ml-1.5 font-sans">
                    {Math.round(src.relevance_score * 100)}%
                  </span>
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
