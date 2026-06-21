'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow height function
  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  };

  useEffect(() => {
    adjustHeight();
  }, [content]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || disabled) return;
    onSend(content.trim());
    setContent('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-end">
      <div className="relative flex-1 rounded-2xl border border-white/10 bg-white/5 focus-within:border-purple-500/50 focus-within:bg-white/[0.08] transition-all duration-200">
        <textarea
          ref={textareaRef}
          rows={1}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything about the codebase..."
          className="w-full resize-none bg-transparent py-3.5 px-4 pr-12 text-sm text-white placeholder-white/40 focus:outline-none scrollbar-none leading-relaxed max-h-[200px]"
          disabled={disabled}
        />
        {/* Helper send indicator */}
        <div className="absolute right-3 bottom-3 text-[10px] text-white/20 select-none hidden sm:block">
          Enter to send
        </div>
      </div>

      <Button
        type="submit"
        disabled={!content.trim() || disabled}
        className="h-[46px] w-[46px] rounded-xl gradient-bg hover:opacity-90 flex items-center justify-center glow-sm shadow-md transition-all duration-200 shrink-0"
      >
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      </Button>
    </form>
  );
}
