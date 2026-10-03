import { NextRequest, NextResponse } from 'next/server';
import { callGemini, streamGemini } from '@/lib/gemini';

const BACKEND_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'https://repogpt-backend-shf2.onrender.com'
).replace(/\/+$/, '');

async function fetchRepoData(repoId: string | number) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/repositories/${repoId}`);
    if (res.ok) return await res.json();
  } catch (err) {
    console.error('Error fetching repo data:', err);
  }
  return null;
}

export async function proxyRequest(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const targetPath = path.join('/');
  const search = request.nextUrl.search;
  const targetUrl = `${BACKEND_URL}/api/${targetPath}${search}`;

  const isDocs = targetPath.match(/^repositories\/(\d+)\/docs$/);
  const isInterview = targetPath.match(/^repositories\/(\d+)\/interview$/);
  const isGraph = targetPath.match(/^repositories\/(\d+)\/graph$/);
  const isMessage = targetPath.match(/^sessions\/(\d+)\/messages$/);

  // Clone headers
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'host') {
      headers.set(key, value);
    }
  });

  try {
    let bodyData: any = undefined;
    let rawBody: any = undefined;

    if (!['GET', 'HEAD'].includes(request.method)) {
      const cloned = request.clone();
      try {
        bodyData = await cloned.json();
      } catch {
        // Not JSON
      }
      rawBody = await request.blob();
    }

    // Try backend first
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: rawBody,
      // @ts-ignore
      duplex: 'half',
    });

    // Check if the response is an SSE stream
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      // If backend responded ok, forward the stream, but intercept if it immediately errors
      return new Response(response.body, {
        status: response.status,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    if (response.ok) {
      const responseData = await response.json().catch(() => null);
      if (responseData) {
        // If graph returned empty nodes, fall through to synthesize graph
        if (isGraph && (!responseData.nodes || responseData.nodes.length === 0)) {
          const repoId = isGraph[1];
          const synthesized = await generateFallbackGraph(repoId);
          return NextResponse.json(synthesized);
        }
        return NextResponse.json(responseData);
      }
    }

    // If backend failed (500, 404, etc.), trigger Gemini-powered resilient fallback
    if (isDocs) {
      const repoId = isDocs[1];
      const docs = await generateFallbackDocs(repoId);
      return NextResponse.json(docs);
    }

    if (isInterview) {
      const repoId = isInterview[1];
      const interview = await generateFallbackInterview(repoId);
      return NextResponse.json(interview);
    }

    if (isGraph) {
      const repoId = isGraph[1];
      const graph = await generateFallbackGraph(repoId);
      return NextResponse.json(graph);
    }

    if (isMessage && bodyData?.content) {
      return streamFallbackChat(bodyData.content);
    }

    // Default error response if no fallback matched
    return NextResponse.json(
      { error: `Backend returned ${response.status}` },
      { status: response.status }
    );
  } catch (error: any) {
    console.error(`Proxy error connecting to ${targetUrl}:`, error);

    // Fallbacks on network error
    if (isDocs) {
      const docs = await generateFallbackDocs(isDocs[1]);
      return NextResponse.json(docs);
    }
    if (isInterview) {
      const interview = await generateFallbackInterview(isInterview[1]);
      return NextResponse.json(interview);
    }
    if (isGraph) {
      const graph = await generateFallbackGraph(isGraph[1]);
      return NextResponse.json(graph);
    }

    return NextResponse.json(
      {
        error: 'Backend communication error',
        detail: error?.message || 'Unable to reach backend service',
      },
      { status: 502 }
    );
  }
}

// -----------------------------------------------------------------------------
// Fallback Generators using Gemini API
// -----------------------------------------------------------------------------

async function generateFallbackDocs(repoId: string | number) {
  const repo = await fetchRepoData(repoId);
  const repoName = repo ? `${repo.owner}/${repo.name}` : `Repository #${repoId}`;
  const techStack = repo?.summary_json?.tech_stack || repo?.primary_languages?.join(', ') || 'HTML, CSS, JavaScript';
  const overview = repo?.summary_json?.project_purpose || repo?.description || 'Modern software codebase';

  const prompt = `You are a Principal Software Architect.
Generate 4 comprehensive, production-grade documentation files for GitHub repository: "${repoName}".
Tech stack: ${techStack}
Overview: ${overview}
Files count: ${repo?.num_files || 25}

Return a single JSON object with these EXACT keys:
- "readme": Complete Markdown README with project badge style, overview, quick start, installation, usage, folder structure, and license.
- "architecture_doc": Detailed system architecture explanation with Mermaid diagram and design principles.
- "api_docs": API / component reference with inputs, outputs, configuration options, and code snippets.
- "onboarding": Step-by-step developer onboarding guide with prerequisites, local setup, debugging tips, and contributing guidelines.`;

  try {
    const raw = await callGemini({
      messages: [
        { role: 'system', content: 'You respond ONLY with valid JSON containing keys: readme, architecture_doc, api_docs, onboarding.' },
        { role: 'user', content: prompt },
      ],
      responseFormat: { type: 'json_object' },
      temperature: 0.2,
    });
    return JSON.parse(raw);
  } catch (err) {
    console.error('Gemini docs generation failed:', err);
    return {
      readme: `# ${repoName}\n\n${overview}\n\n## Tech Stack\n${techStack}\n\n## Quick Start\n\`\`\`bash\ngit clone https://github.com/${repoName}.git\ncd ${repo?.name || 'repo'}\n\`\`\``,
      architecture_doc: `# Architecture: ${repoName}\n\n## High-Level Design\nThe repository implements a modular client-side architecture.\n\n\`\`\`mermaid\ngraph TD\n  Client[Browser Client] --> App[Application Logic]\n  App --> UI[UI Components]\n  App --> State[State Management]\n\`\`\``,
      api_docs: `# API & Module Reference\n\n## Modules\n${techStack.split(',').map((t: string) => `- **${t.trim()}**: Core implementation`).join('\n')}`,
      onboarding: `# Developer Onboarding Guide\n\n### Prerequisites\n- Modern web browser\n- Git 2.30+\n\n### Setup\n1. Clone the repository\n2. Open \`index.html\` or run your local dev server.`,
    };
  }
}

async function generateFallbackInterview(repoId: string | number) {
  const repo = await fetchRepoData(repoId);
  const repoName = repo ? `${repo.owner}/${repo.name}` : `Repository #${repoId}`;
  const techStack = repo?.summary_json?.tech_stack || repo?.primary_languages?.join(', ') || 'HTML, CSS, JavaScript';
  const overview = repo?.summary_json?.project_purpose || repo?.description || 'Codebase';

  const prompt = `You are an elite Engineering Interviewer at Google/Meta.
Generate a comprehensive technical interview prep report for the repository "${repoName}".
Tech stack: ${techStack}
Overview: ${overview}

Return a JSON object with:
- "interview_questions": {
    "beginner": [{"question": "string", "hint": "string"}, ...5 items],
    "intermediate": [{"question": "string", "hint": "string"}, ...5 items],
    "advanced": [{"question": "string", "hint": "string"}, ...5 items]
  }
- "design_decisions": [{"decision": "string", "rationale": "string", "tradeoffs": "string"}, ...3 items]
- "scalability_analysis": [{"area": "string", "current_state": "string", "bottleneck": "string", "recommendation": "string", "expected_benefit": "string"}, ...4 items]
- "suggested_improvements": ["string", "string", "string"]`;

  try {
    const raw = await callGemini({
      messages: [
        { role: 'system', content: 'You respond ONLY with valid JSON for the interview report structure.' },
        { role: 'user', content: prompt },
      ],
      responseFormat: { type: 'json_object' },
      temperature: 0.3,
    });
    return JSON.parse(raw);
  } catch (err) {
    console.error('Gemini interview generation failed:', err);
    return {
      interview_questions: {
        beginner: [
          { question: `What is the primary role of the main entry point in ${repo?.name || 'this repository'}?`, hint: 'Trace the lifecycle from document load.' },
          { question: 'How is code modularized across files in this project?', hint: 'Look at script imports and separation of concerns.' },
          { question: 'What error handling mechanisms are implemented for unexpected inputs?', hint: 'Inspect try/catch and input validation logic.' },
          { question: 'How are static assets organized in the folder hierarchy?', hint: 'Check the asset directories and relative path conventions.' },
          { question: 'What browser compatibility considerations apply to the tech stack?', hint: 'Evaluate standard Web APIs used vs legacy browser support.' },
        ],
        intermediate: [
          { question: 'How would you refactor state management to scale with growing complexity?', hint: 'Consider reactive stores or unidirectional data flow.' },
          { question: 'What strategies could minimize layout recalculations and DOM repaint overhead?', hint: 'Use document fragments, virtual DOM, or CSS transforms.' },
          { question: 'How would you implement end-to-end automated testing for this repository?', hint: 'Set up Playwright or Cypress with CI triggers.' },
          { question: 'How can client-side caching be optimized for repeated visits?', hint: 'Analyze Cache-Control headers and Service Workers.' },
          { question: 'Explain how asynchronous operations are coordinated in the critical path.', hint: 'Evaluate Promise chaining, async/await, and race conditions.' },
        ],
        advanced: [
          { question: 'How would you design a global CDN delivery and asset hashing strategy for zero-downtime releases?', hint: 'Implement content-hashed bundles with immutable caching.' },
          { question: 'Discuss how to secure this application against XSS and prototype pollution attacks.', hint: 'Enforce strict Content Security Policy (CSP) and input sanitization.' },
          { question: 'How would you architect a real-time collaborative editing layer on top of this system?', hint: 'Evaluate WebSockets paired with CRDTs or Operational Transformation.' },
          { question: 'Analyze the memory footprint and identify potential closure leaks during long user sessions.', hint: 'Use Chrome DevTools Memory Heap Profiling.' },
          { question: 'How would you migrate this architecture to micro-frontends without degrading performance?', hint: 'Consider Module Federation with shared dependencies.' },
        ],
      },
      design_decisions: [
        { decision: 'Modular File Separation', rationale: 'Separates presentation, logic, and data.', tradeoffs: 'Clean organization vs multiple script requests.' },
        { decision: 'Vanilla Web Standards', rationale: 'Avoids framework bloat and heavy build pipelines.', tradeoffs: 'Maximum performance vs manual DOM orchestration.' },
        { decision: 'Client-Centric Execution', rationale: 'Zero hosting cost and instant responsiveness.', tradeoffs: 'Limited by client resources and lack of backend persistence.' },
      ],
      scalability_analysis: [
        { area: 'Asset Delivery', current_state: 'Single origin server', bottleneck: 'High latency for global clients', recommendation: 'Deploy on Cloudflare/CloudFront CDN', expected_benefit: 'Sub-50ms latency worldwide' },
        { area: 'Bundle Optimization', current_state: 'Unminified static assets', bottleneck: 'Large transfer size on 3G/4G', recommendation: 'Automate Brotli compression and code minification', expected_benefit: '60% reduction in initial load time' },
        { area: 'Caching Strategy', current_state: 'Default HTTP headers', bottleneck: 'Redundant network fetches', recommendation: 'Add PWA Service Worker with stale-while-revalidate', expected_benefit: 'Instant offline access' },
        { area: 'Code Quality', current_state: 'Manual reviews', bottleneck: 'Regression bugs slipping into production', recommendation: 'Implement GitHub Actions CI with ESLint and Vitest', expected_benefit: 'Automated 100% test coverage gate' },
      ],
      suggested_improvements: [
        'Add automated GitHub Actions CI pipeline for linting, formatting, and tests.',
        'Implement responsive mobile layout with modern CSS grid and clamp() typography.',
        'Introduce TypeScript definitions for stronger type safety across modules.',
      ],
    };
  }
}

async function generateFallbackGraph(repoId: string | number) {
  const repo = await fetchRepoData(repoId);
  const nodes: any[] = [];
  const edges: any[] = [];
  let nodeId = 1;

  // Root node
  const rootId = `node_${nodeId++}`;
  nodes.push({
    id: rootId,
    type: 'service',
    name: repo ? `${repo.owner}/${repo.name}` : `Repo #${repoId}`,
    file_path: 'root',
  });

  // Languages & Frameworks
  const langs = repo?.primary_languages || ['HTML', 'CSS', 'JavaScript'];
  const frameworks = repo?.detected_frameworks || [];
  const databases = repo?.detected_databases || [];

  for (const lang of langs) {
    const lId = `node_${nodeId++}`;
    nodes.push({ id: lId, type: 'file', name: lang, file_path: `${lang.toLowerCase()}/core` });
    edges.push({ source: rootId, target: lId, type: 'DEFINED_IN' });
  }

  for (const fw of frameworks) {
    const fId = `node_${nodeId++}`;
    nodes.push({ id: fId, type: 'class', name: fw, file_path: `framework/${fw.toLowerCase()}` });
    edges.push({ source: rootId, target: fId, type: 'USES' });
  }

  for (const db of databases) {
    const dId = `node_${nodeId++}`;
    nodes.push({ id: dId, type: 'table', name: db, file_path: `database/${db.toLowerCase()}` });
    edges.push({ source: rootId, target: dId, type: 'READS' });
  }

  // Core functional components
  const modules = repo?.summary_json?.modules || [
    { name: 'UI Components', description: 'Interactive elements' },
    { name: 'Core Logic', description: 'Application logic' },
    { name: 'Styles System', description: 'CSS and theming' },
    { name: 'Utilities', description: 'Helper functions' },
  ];

  for (const mod of modules.slice(0, 8)) {
    const mId = `node_${nodeId++}`;
    nodes.push({
      id: mId,
      type: 'function',
      name: typeof mod === 'string' ? mod : mod.name,
      file_path: typeof mod === 'string' ? mod : `src/${mod.name.toLowerCase().replace(/\s+/g, '_')}.js`,
    });
    edges.push({ source: rootId, target: mId, type: 'CALLS' });
  }

  const entity_counts = {
    file: langs.length,
    class: frameworks.length,
    function: modules.length,
    table: databases.length,
    service: 1,
  };

  return { nodes, edges, entity_counts };
}

function streamFallbackChat(userQuery: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await streamGemini(
          [
            {
              role: 'system',
              content:
                'You are RepoGPT, a brilliant AI software architect assistant. Provide direct, concise, insightful answers grounded in repository architecture and best practices.',
            },
            { role: 'user', content: userQuery },
          ],
          (chunk) => {
            const data = JSON.stringify({ content: chunk });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
        );
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (err: any) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ content: `I encountered an issue generating the answer: ${err.message}` })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;
export const PATCH = proxyRequest;
export const dynamic = 'force-dynamic';
