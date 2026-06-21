'use client';

import { Card } from '@/components/ui/card';

interface TechStackCardProps {
  techStack: Record<string, string>;
}

export function TechStackCard({ techStack }: TechStackCardProps) {
  const items = [
    { key: 'frontend', label: 'Frontend', emoji: '💻' },
    { key: 'backend', label: 'Backend', emoji: '⚙️' },
    { key: 'database', label: 'Database', emoji: '🗄️' },
    { key: 'cache', label: 'Caching', emoji: '⚡' },
    { key: 'authentication', label: 'Auth / Security', emoji: '🔒' },
    { key: 'cloud', label: 'Deployment / Cloud', emoji: '☁️' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {items.map((item) => {
        const val = techStack[item.key] || techStack[item.label.toLowerCase()] || 'N/A';
        return (
          <Card
            key={item.key}
            className="glass border-white/5 p-4 flex flex-col justify-between hover-lift group"
          >
            <div className="flex items-center gap-2">
              <span className="text-xl group-hover:scale-110 transition-transform duration-200">
                {item.emoji}
              </span>
              <span className="text-xs font-semibold text-white/40 tracking-wider uppercase">
                {item.label}
              </span>
            </div>
            <p className="text-sm font-semibold text-white mt-3 truncate" title={val}>
              {val}
            </p>
          </Card>
        );
      })}
    </div>
  );
}
