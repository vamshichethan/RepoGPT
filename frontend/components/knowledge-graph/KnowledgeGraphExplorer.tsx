'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import type { KnowledgeGraphResponse } from '@/lib/types';
import { Search, X, ZoomIn, ZoomOut, Maximize2, RefreshCw, Filter } from 'lucide-react';

// ---------------------------------------------------------------------------
// Node type config
// ---------------------------------------------------------------------------

const NODE_CONFIG: Record<string, { color: string; glow: string; emoji: string; label: string }> = {
  file:     { color: '#3b82f6', glow: '#3b82f680', emoji: '📄', label: 'File'     },
  class:    { color: '#a855f7', glow: '#a855f780', emoji: '🏛️', label: 'Class'    },
  function: { color: '#22c55e', glow: '#22c55e80', emoji: '⚡', label: 'Function' },
  api:      { color: '#f97316', glow: '#f9731680', emoji: '🔗', label: 'API'      },
  table:    { color: '#ef4444', glow: '#ef444480', emoji: '🗃️', label: 'Table'    },
  service:  { color: '#eab308', glow: '#eab30880', emoji: '☁️', label: 'Service'  },
};

const REL_COLORS: Record<string, string> = {
  IMPORTS:       '#3b82f6',
  CALLS:         '#22c55e',
  DEFINED_IN:    '#a855f7',
  HANDLED_BY:    '#f97316',
  READS:         '#06b6d4',
  WRITES:        '#ef4444',
  CALLS_SERVICE: '#eab308',
  USES:          '#ec4899',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GraphNode {
  id: string;
  type: string;
  name: string;
  file_path?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
}

function getEndpointId(endpoint: string | GraphNode): string {
  return typeof endpoint === 'string' ? endpoint : endpoint.id;
}

interface KnowledgeGraphExplorerProps {
  repoId: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KnowledgeGraphExplorer({ repoId }: KnowledgeGraphExplorerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  const [entityCounts, setEntityCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set(Object.keys(NODE_CONFIG)));
  const [showFilters, setShowFilters] = useState(false);

  // Canvas transform state
  const transform = useRef({ x: 0, y: 0, scale: 1 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const hoveredNode = useRef<GraphNode | null>(null);

  // Simulation state
  const simNodes = useRef<GraphNode[]>([]);
  const simLinks = useRef<GraphLink[]>([]);
  const simRunning = useRef(false);

  // ---------------------------------------------------------------------------
  // Canvas drawing
  // ---------------------------------------------------------------------------

  const drawGraph = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background grid
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    const gridSize = 50 * transform.current.scale;
    const offsetX = transform.current.x % gridSize;
    const offsetY = transform.current.y % gridSize;
    for (let x = offsetX; x < W; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = offsetY; y < H; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(transform.current.x + W / 2, transform.current.y + H / 2);
    ctx.scale(transform.current.scale, transform.current.scale);

    const nodes = simNodes.current;
    const links = simLinks.current;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    const visTypes = visibleTypes;
    const highlighted = highlightedNodes;
    const hasHighlight = highlighted.size > 0;

    // Draw edges
    for (const link of links) {
      const srcId = getEndpointId(link.source);
      const tgtId = getEndpointId(link.target);
      const src = nodeMap.get(srcId);
      const tgt = nodeMap.get(tgtId);
      if (!src || !tgt) continue;
      if (!visTypes.has(src.type) || !visTypes.has(tgt.type)) continue;

      const isHighlighted = hasHighlight && (highlighted.has(srcId) || highlighted.has(tgtId));
      const alpha = hasHighlight ? (isHighlighted ? 0.9 : 0.08) : 0.3;
      const color = REL_COLORS[link.type] || '#ffffff';

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = isHighlighted ? 2 : 1;

      // Arrow line
      const dx = (tgt.x ?? 0) - (src.x ?? 0);
      const dy = (tgt.y ?? 0) - (src.y ?? 0);
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const nodeR = 8;
      const startX = (src.x ?? 0) + (dx / dist) * nodeR;
      const startY = (src.y ?? 0) + (dy / dist) * nodeR;
      const endX = (tgt.x ?? 0) - (dx / dist) * (nodeR + 5);
      const endY = (tgt.y ?? 0) - (dy / dist) * (nodeR + 5);

      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Arrowhead
      const angle = Math.atan2(dy, dx);
      ctx.beginPath();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - 8 * Math.cos(angle - 0.4), endY - 8 * Math.sin(angle - 0.4));
      ctx.lineTo(endX - 8 * Math.cos(angle + 0.4), endY - 8 * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fill();
    }

    ctx.globalAlpha = 1;

    // Draw nodes
    for (const node of nodes) {
      if (!visTypes.has(node.type)) continue;
      const cfg = NODE_CONFIG[node.type] || NODE_CONFIG.file;
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const r = 8;

      const isSelected = selectedNode?.id === node.id;
      const isHighlighted = hasHighlight ? highlighted.has(node.id) : true;
      const isHovered = hoveredNode.current?.id === node.id;
      const alpha = isHighlighted ? 1 : 0.2;

      ctx.globalAlpha = alpha;

      // Glow
      if (isSelected || isHovered) {
        const grad = ctx.createRadialGradient(x, y, r, x, y, r * 3);
        grad.addColorStop(0, cfg.glow);
        grad.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(x, y, r * 3, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = cfg.color;
      ctx.fill();

      // Border
      ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      // Label (only when zoomed in enough or selected/hovered)
      if (transform.current.scale > 0.6 || isSelected || isHovered) {
        ctx.font = `${isSelected ? 'bold ' : ''}${Math.max(9, 11 / transform.current.scale)}px Inter, sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        const label = node.name.length > 20 ? node.name.slice(0, 18) + '…' : node.name;
        ctx.fillText(label, x, y + r + 13);
      }
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }, [visibleTypes, highlightedNodes, selectedNode]);

  // ---------------------------------------------------------------------------
  // Force-directed simulation (simple spring physics)
  // ---------------------------------------------------------------------------

  const runSimulation = useCallback(() => {
    simRunning.current = true;
    let alpha = 1;

    const tick = () => {
      if (!simRunning.current || alpha < 0.001) {
        simRunning.current = false;
        return;
      }

      const nodes = simNodes.current;
      const links = simLinks.current;
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));

      // Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = (b.x ?? 0) - (a.x ?? 0);
          const dy = (b.y ?? 0) - (a.y ?? 0);
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (alpha * 800) / (dist * dist);
          a.vx! -= (dx / dist) * force;
          a.vy! -= (dy / dist) * force;
          b.vx! += (dx / dist) * force;
          b.vy! += (dy / dist) * force;
        }
      }

      // Attraction (spring)
      for (const link of links) {
        const src = nodeMap.get(getEndpointId(link.source));
        const tgt = nodeMap.get(getEndpointId(link.target));
        if (!src || !tgt) continue;
        const dx = (tgt.x ?? 0) - (src.x ?? 0);
        const dy = (tgt.y ?? 0) - (src.y ?? 0);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 80) * alpha * 0.1;
        src.vx! += (dx / dist) * force;
        src.vy! += (dy / dist) * force;
        tgt.vx! -= (dx / dist) * force;
        tgt.vy! -= (dy / dist) * force;
      }

      // Center gravity
      for (const n of nodes) {
        n.vx! += -(n.x ?? 0) * alpha * 0.02;
        n.vy! += -(n.y ?? 0) * alpha * 0.02;
      }

      // Integrate
      for (const n of nodes) {
        if (n.fx !== undefined && n.fx !== null) { n.x = n.fx; n.vx = 0; }
        else { n.x = (n.x ?? 0) + (n.vx! *= 0.85); }
        if (n.fy !== undefined && n.fy !== null) { n.y = n.fy; n.vy = 0; }
        else { n.y = (n.y ?? 0) + (n.vy! *= 0.85); }
      }

      alpha *= 0.99;
      drawGraph();
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
  }, [drawGraph]);

  // ---------------------------------------------------------------------------
  // Load data
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data: KnowledgeGraphResponse = await api.knowledgeGraph.getGraph(repoId, 400);
        if (!mounted) return;
        if (!data.nodes) throw new Error('No graph data returned');

        const nodes: GraphNode[] = data.nodes.map((n) => ({
          id: n.id,
          type: n.type || 'file',
          name: n.name,
          file_path: n.file_path,
          x: Math.random() * 800 - 400,
          y: Math.random() * 600 - 300,
          vx: 0,
          vy: 0,
        }));

        const nodeIds = new Set(nodes.map((n) => n.id));
        const links: GraphLink[] = data.edges
          .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
          .map((e) => ({ source: e.source, target: e.target, type: e.type }));

        setEntityCounts(data.entity_counts || {});

        simNodes.current = nodes;
        simLinks.current = links;
        runSimulation();
      } catch (err: unknown) {
        if (!mounted) return;
        const message = err instanceof Error ? err.message : 'Failed to load knowledge graph';
        setError(message);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
      simRunning.current = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [repoId, runSimulation]);

  // Redraw when data changes
  useEffect(() => {
    if (!simRunning.current && simNodes.current.length > 0) {
      drawGraph();
    }
  }, [visibleTypes, highlightedNodes, selectedNode, drawGraph]);

  // ---------------------------------------------------------------------------
  // Resize canvas
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      drawGraph();
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [drawGraph]);

  // ---------------------------------------------------------------------------
  // Mouse interactions
  // ---------------------------------------------------------------------------

  const getNodeAt = (cx: number, cy: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const W = canvas.width, H = canvas.height;
    const tx = (cx - W / 2 - transform.current.x) / transform.current.scale;
    const ty = (cy - H / 2 - transform.current.y) / transform.current.scale;
    for (const node of simNodes.current) {
      if (!visibleTypes.has(node.type)) continue;
      const dx = (node.x ?? 0) - tx;
      const dy = (node.y ?? 0) - ty;
      if (Math.sqrt(dx * dx + dy * dy) < 12) return node;
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const node = getNodeAt(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    if (node) {
      setSelectedNode(node);
      // Find connected nodes for highlight
      const connected = new Set<string>([node.id]);
      for (const link of simLinks.current) {
        const srcId = getEndpointId(link.source);
        const tgtId = getEndpointId(link.target);
        if (srcId === node.id) connected.add(tgtId);
        if (tgtId === node.id) connected.add(srcId);
      }
      setHighlightedNodes(connected);
    } else {
      isDragging.current = true;
      dragStart.current = { x: e.nativeEvent.offsetX - transform.current.x, y: e.nativeEvent.offsetY - transform.current.y };
      setSelectedNode(null);
      setHighlightedNodes(new Set());
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const node = getNodeAt(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    hoveredNode.current = node;
    if (isDragging.current) {
      transform.current.x = e.nativeEvent.offsetX - dragStart.current.x;
      transform.current.y = e.nativeEvent.offsetY - dragStart.current.y;
    }
    if (!simRunning.current) drawGraph();
  };

  const handleMouseUp = () => { isDragging.current = false; };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    transform.current.scale = Math.max(0.1, Math.min(5, transform.current.scale * factor));
    if (!simRunning.current) drawGraph();
  };

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setHighlightedNodes(new Set());
      return;
    }
    const lower = q.toLowerCase();
    const matched = new Set<string>();
    for (const node of simNodes.current) {
      if (node.name.toLowerCase().includes(lower) || node.file_path?.toLowerCase().includes(lower)) {
        matched.add(node.id);
      }
    }
    setHighlightedNodes(matched);
  };

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------

  const zoomIn = () => { transform.current.scale = Math.min(5, transform.current.scale * 1.3); drawGraph(); };
  const zoomOut = () => { transform.current.scale = Math.max(0.1, transform.current.scale * 0.77); drawGraph(); };
  const resetView = () => { transform.current = { x: 0, y: 0, scale: 1 }; drawGraph(); };
  const reload = () => {
    setLoading(true);
    setError(null);
    simRunning.current = false;
    setSelectedNode(null);
    setHighlightedNodes(new Set());
    api.knowledgeGraph.getGraph(repoId, 400).then((data) => {
      const nodes: GraphNode[] = data.nodes.map((n) => ({
        ...n, x: Math.random() * 800 - 400, y: Math.random() * 600 - 300, vx: 0, vy: 0,
      }));
      const nodeIds = new Set(nodes.map((n) => n.id));
      const links: GraphLink[] = data.edges
        .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
        .map((e) => ({ source: e.source, target: e.target, type: e.type }));
      simNodes.current = nodes;
      simLinks.current = links;
      setEntityCounts(data.entity_counts || {});
      setLoading(false);
      runSimulation();
    }).catch((err: unknown) => {
      setLoading(false);
      const message = err instanceof Error ? err.message : 'Failed to reload graph';
      setError(message);
    });
  };

  const toggleType = (type: string) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* Header */}
      <div className="glass p-5 rounded-2xl border border-white/10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              🕸️ Knowledge Graph
            </h2>
            <p className="text-white/50 text-sm mt-1">
              Interactive visualization of code entities and relationships
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters((s) => !s)}
              className={`p-2 rounded-lg border transition-all ${showFilters ? 'bg-purple-500/20 border-purple-500/40 text-purple-300' : 'border-white/10 text-white/50 hover:text-white/80'}`}
            >
              <Filter className="w-4 h-4" />
            </button>
            <button onClick={zoomOut} className="p-2 rounded-lg border border-white/10 text-white/50 hover:text-white/80 transition-all">
              <ZoomOut className="w-4 h-4" />
            </button>
            <button onClick={zoomIn} className="p-2 rounded-lg border border-white/10 text-white/50 hover:text-white/80 transition-all">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={resetView} className="p-2 rounded-lg border border-white/10 text-white/50 hover:text-white/80 transition-all">
              <Maximize2 className="w-4 h-4" />
            </button>
            <button onClick={reload} className="p-2 rounded-lg border border-white/10 text-white/50 hover:text-white/80 transition-all">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search nodes by name or file path…"
            className="w-full bg-black/30 border border-white/10 rounded-xl pl-10 pr-10 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-all"
          />
          {searchQuery && (
            <button onClick={() => handleSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-white/10">
            {Object.entries(NODE_CONFIG).map(([type, cfg]) => (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  visibleTypes.has(type)
                    ? 'border-transparent text-white'
                    : 'border-white/10 text-white/40 bg-transparent'
                }`}
                style={visibleTypes.has(type) ? { backgroundColor: cfg.color + '30', borderColor: cfg.color + '60', color: cfg.color } : {}}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: visibleTypes.has(type) ? cfg.color : '#ffffff30' }} />
                {cfg.emoji} {cfg.label}
                {entityCounts[type] !== undefined && (
                  <span className="opacity-60">({entityCounts[type]})</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-4">
        {/* Canvas */}
        <div
          ref={containerRef}
          className="flex-1 relative glass border border-white/10 rounded-2xl overflow-hidden"
          style={{ height: '580px' }}
        >
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0f]/80 z-10">
              <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                <p className="text-white/50 text-sm">Building knowledge graph…</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-white/40 text-sm mb-2">⚠️ {error}</p>
                <p className="text-white/25 text-xs">Graph data will be available after repository ingestion</p>
              </div>
            </div>
          )}

          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            style={{ cursor: 'grab', display: 'block' }}
          />

          {/* Legend */}
          <div className="absolute bottom-4 left-4 glass border border-white/10 rounded-xl p-3 flex flex-col gap-1.5">
            <p className="text-white/40 text-xs font-medium mb-1">Node Types</p>
            {Object.entries(NODE_CONFIG).map(([type, cfg]) => (
              <div key={type} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.color }} />
                <span className="text-white/60 text-xs">{cfg.emoji} {cfg.label}</span>
              </div>
            ))}
          </div>

          {/* Stats overlay */}
          {!loading && !error && (
            <div className="absolute top-4 right-4 glass border border-white/10 rounded-xl px-3 py-2">
              <p className="text-white/40 text-xs">
                {simNodes.current.length} nodes · {simLinks.current.length} edges
              </p>
            </div>
          )}
        </div>

        {/* Node detail panel */}
        {selectedNode && (
          <div className="w-72 glass border border-white/10 rounded-2xl p-5 flex flex-col gap-4 animate-fade-in">
            <div className="flex items-start justify-between">
              <div>
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium mb-2 border"
                  style={{
                    backgroundColor: (NODE_CONFIG[selectedNode.type]?.color || '#3b82f6') + '20',
                    borderColor: (NODE_CONFIG[selectedNode.type]?.color || '#3b82f6') + '50',
                    color: NODE_CONFIG[selectedNode.type]?.color || '#3b82f6',
                  }}
                >
                  {NODE_CONFIG[selectedNode.type]?.emoji} {NODE_CONFIG[selectedNode.type]?.label || selectedNode.type}
                </div>
                <h3 className="text-white font-semibold text-sm break-all leading-snug">
                  {selectedNode.name}
                </h3>
              </div>
              <button onClick={() => { setSelectedNode(null); setHighlightedNodes(new Set()); }} className="text-white/30 hover:text-white/60 ml-2 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedNode.file_path && (
              <div>
                <p className="text-white/30 text-xs mb-1 uppercase tracking-wider">File</p>
                <p className="text-white/70 text-xs break-all font-mono bg-black/20 px-2 py-1.5 rounded-lg border border-white/5">
                  {selectedNode.file_path}
                </p>
              </div>
            )}

            {/* Connected nodes */}
            <div>
              <p className="text-white/30 text-xs mb-2 uppercase tracking-wider">Connections</p>
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {simLinks.current
                  .filter((l) => {
                    const srcId = getEndpointId(l.source);
                    const tgtId = getEndpointId(l.target);
                    return srcId === selectedNode.id || tgtId === selectedNode.id;
                  })
                  .slice(0, 20)
                  .map((l, i) => {
                    const srcId = getEndpointId(l.source);
                    const tgtId = getEndpointId(l.target);
                    const isOutgoing = srcId === selectedNode.id;
                    const otherId = isOutgoing ? tgtId : srcId;
                    const other = simNodes.current.find((n) => n.id === otherId);
                    const relColor = REL_COLORS[l.type] || '#ffffff';
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs p-2 rounded-lg bg-black/20 border border-white/5 cursor-pointer hover:border-white/20 transition-colors"
                        onClick={() => {
                          const node = simNodes.current.find((n) => n.id === otherId);
                          if (node) {
                            setSelectedNode(node);
                            const connected = new Set<string>([node.id]);
                            simLinks.current.forEach((lk) => {
                              const s = getEndpointId(lk.source);
                              const t = getEndpointId(lk.target);
                              if (s === node.id) connected.add(t);
                              if (t === node.id) connected.add(s);
                            });
                            setHighlightedNodes(connected);
                          }
                        }}
                      >
                        <span className="text-white/30">{isOutgoing ? '→' : '←'}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ backgroundColor: relColor + '20', color: relColor }}>
                          {l.type}
                        </span>
                        <span className="text-white/70 truncate">{other?.name || otherId.slice(0, 12)}</span>
                      </div>
                    );
                  })}
                {highlightedNodes.size > 21 && (
                  <p className="text-white/30 text-xs text-center">+{highlightedNodes.size - 21} more</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
