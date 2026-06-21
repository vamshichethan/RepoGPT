'use client';

import { Card } from '@/components/ui/card';

interface FolderTreeProps {
  structure: string;
}

export function FolderTree({ structure }: FolderTreeProps) {
  // Preprocess lines to make directory names stand out
  const lines = structure.split('\n');

  return (
    <Card className="glass border-white/5 bg-black/40 p-5 font-mono text-xs overflow-x-auto leading-relaxed max-h-[400px] scrollbar-thin">
      <pre className="text-white/80">
        {lines.map((line, idx) => {
          // Check if line contains folders vs files
          const isDir = line.endsWith('/') || line.includes('/') || line.includes('📁');
          const isKeyFile = line.toLowerCase().includes('package.json') || 
                            line.toLowerCase().includes('requirements.txt') ||
                            line.toLowerCase().includes('readme.md');

          let colorClass = 'text-white/70';
          if (isDir) {
            colorClass = 'text-purple-400 font-medium';
          } else if (isKeyFile) {
            colorClass = 'text-cyan-400 font-medium';
          }

          return (
            <span key={idx} className={colorClass}>
              {line}
              {'\n'}
            </span>
          );
        })}
      </pre>
    </Card>
  );
}
