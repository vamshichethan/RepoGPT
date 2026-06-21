'use client';

import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface MermaidViewerProps {
  chartCode: string;
}

export function MermaidViewer({ chartCode }: MermaidViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    // Initialize mermaid inside useEffect to ensure it runs client-side only
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      themeVariables: {
        background: '#0a0a0f',
        primaryColor: '#7c3aed',
        primaryTextColor: '#ffffff',
        primaryBorderColor: '#8b5cf6',
        lineColor: '#4b5563',
        secondaryColor: '#0ea5e9',
        tertiaryColor: '#10b981',
      },
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: 'basis',
      },
    });

    const renderDiagram = async () => {
      if (!chartCode) return;
      const cleanCode = chartCode.trim();
      const uniqueId = `mermaid-${Math.floor(Math.random() * 1000000)}`;

      try {
        setError(false);
        const { svg: renderedSvg } = await mermaid.render(uniqueId, cleanCode);
        setSvg(renderedSvg);
      } catch (err) {
        console.error('Mermaid render error:', err);
        setError(true);
        // Clean up any stray error elements created by mermaid
        const badEl = document.getElementById(`d${uniqueId}`);
        if (badEl) badEl.remove();
      }
    };

    renderDiagram();
  }, [chartCode]);

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl">
        <p className="font-semibold mb-2">⚠️ Diagram Rendering Failed</p>
        <p className="text-white/40 mb-3 text-[11px]">
          There was a syntax error or compilation failure in the Mermaid code. You can view the raw code below:
        </p>
        <pre className="p-3 bg-black/40 text-[10px] overflow-auto max-h-[200px] font-mono rounded-lg border border-white/5 select-text">
          {chartCode}
        </pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full overflow-auto p-6 bg-black/40 border border-white/5 rounded-2xl flex items-center justify-center min-h-[350px] scrollbar-thin shadow-inner"
      dangerouslySetInnerHTML={{
        __html: svg || `
          <div class="text-white/40 text-xs flex gap-2.5 items-center select-none">
            <div class="w-4 h-4 border-2 border-t-transparent border-purple-500 rounded-full animate-spin"></div>
            Generating visual architecture layout...
          </div>
        `,
      }}
    />
  );
}
