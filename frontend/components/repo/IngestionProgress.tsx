'use client';

import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import type { Repository } from '@/lib/types';
import { cn } from '@/lib/utils';

interface IngestionProgressProps {
  status: Repository['status'];
  statusMessage: string | null;
  progressPercent: number;
}

export function IngestionProgress({
  status,
  statusMessage,
  progressPercent,
}: IngestionProgressProps) {
  const steps = [
    { key: 'cloning',       label: 'Cloning',       desc: 'Cloning repo source files'       },
    { key: 'scanning',      label: 'Scanning',      desc: 'Analyzing files and imports'     },
    { key: 'chunking',      label: 'Chunking',      desc: 'Splitting files into chunks'     },
    { key: 'embedding',     label: 'Embedding',     desc: 'Vectorizing code semantics'      },
    { key: 'summarizing',   label: 'Summarizing',   desc: 'Generating AI summary'           },
    { key: 'architecting',  label: 'Architecting',  desc: 'Mapping system architecture'    },
    { key: 'graph_building',label: '🕸️ Graph',      desc: 'Building knowledge graph'        },
  ];

  // Helper to determine the state of each step
  const getStepState = (stepKey: string) => {
    const statusOrder = ['pending', 'cloning', 'scanning', 'chunking', 'embedding', 'summarizing', 'architecting', 'graph_building', 'ready'];
    const currentIdx = statusOrder.indexOf(status);
    const stepIdx = statusOrder.indexOf(stepKey);

    if (status === 'error') {
      return 'idle';
    }

    if (currentIdx > stepIdx) {
      return 'completed';
    } else if (currentIdx === stepIdx) {
      return 'active';
    } else {
      return 'idle';
    }
  };

  return (
    <Card className="glass border-white/10 rounded-2xl p-6 glow-sm shadow-xl">
      <div className="flex flex-col gap-4">
        {/* Top title */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wide">
              Analyzing Codebase
            </h3>
            <p className="text-xs text-white/50 mt-1">
              {statusMessage || 'Initializing background tasks...'}
            </p>
          </div>
          <span className="text-xs font-mono font-medium text-cyan-400 bg-cyan-400/10 px-2.5 py-1 rounded-full border border-cyan-400/20">
            {progressPercent}%
          </span>
        </div>

        {/* Progress bar */}
        <Progress value={progressPercent} className="h-1.5 bg-white/5 [&>div]:gradient-bg" />

        {/* Steps display */}
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3 mt-4 pt-4 border-t border-white/5">
          {steps.map((step) => {
            const state = getStepState(step.key);

            return (
              <div
                key={step.key}
                className={cn(
                  "flex flex-col gap-1 p-3 rounded-xl border transition-all duration-300",
                  state === 'completed' && "bg-green-500/5 border-green-500/10 text-white/80",
                  state === 'active' && "bg-purple-500/5 border-purple-500/20 text-white shadow-lg shadow-purple-500/5",
                  state === 'idle' && "bg-transparent border-transparent text-white/30"
                )}
              >
                <div className="flex items-center gap-2">
                  {/* Circle check/pulse indicator */}
                  {state === 'completed' && (
                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-green-500/20 border border-green-500/30 text-green-400 text-[10px] font-bold">
                      ✓
                    </span>
                  )}
                  {state === 'active' && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                    </span>
                  )}
                  {state === 'idle' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                  )}

                  <span className="text-xs font-semibold tracking-wide">
                    {step.label}
                  </span>
                </div>
                <span className="text-[10px] text-white/40 leading-normal mt-1 md:hidden lg:inline-block">
                  {step.desc}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
