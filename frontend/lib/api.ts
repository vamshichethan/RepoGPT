import type { Repository, IngestionStatus, Summary, ChatSession, Message, Architecture, DependencyGraphResponse, FlowTraceResponse, ImpactAnalysisResponse, InterviewReport, DocsResponse, PRReviewResponse, KnowledgeGraphResponse, GraphSearchResponse, EntityCountsResponse } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const api = {
  repositories: {
    create: (github_url: string): Promise<Repository> =>
      fetch(`${API_BASE}/api/repositories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github_url }),
      }).then((r) => r.json()),

    list: (): Promise<Repository[]> =>
      fetch(`${API_BASE}/api/repositories`).then((r) => r.json()),

    get: (id: number): Promise<Repository> =>
      fetch(`${API_BASE}/api/repositories/${id}`).then((r) => r.json()),

    getStatus: (id: number): Promise<IngestionStatus> =>
      fetch(`${API_BASE}/api/repositories/${id}/status`).then((r) => r.json()),

    delete: (id: number): Promise<{ message: string }> =>
      fetch(`${API_BASE}/api/repositories/${id}`, { method: 'DELETE' }).then((r) => r.json()),
  },

  summaries: {
    get: (repoId: number): Promise<Summary> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/summary`).then((r) => r.json()),
  },

  architecture: {
    get: (repoId: number): Promise<Architecture> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/architecture`).then((r) => r.json()),
  },

  chat: {
    createSession: (repoId: number): Promise<ChatSession> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repository_id: repoId }),
      }).then((r) => r.json()),

    getSessions: (repoId: number): Promise<ChatSession[]> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/sessions`).then((r) => r.json()),

    getMessages: (sessionId: number): Promise<Message[]> =>
      fetch(`${API_BASE}/api/sessions/${sessionId}/messages`).then((r) => r.json()),

    streamMessage: (sessionId: number, content: string): Promise<Response> =>
      fetch(`${API_BASE}/api/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }),
  },

  productivity: {
    getDependencies: (repoId: number): Promise<DependencyGraphResponse> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/dependencies`).then((r) => r.json()),

    getFlowTrace: (repoId: number, query: string): Promise<FlowTraceResponse> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/flow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      }).then((r) => r.json()),

    getImpactAnalysis: (repoId: number, file_path: string): Promise<ImpactAnalysisResponse> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/impact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path }),
      }).then((r) => r.json()),
  },

  interview: {
    getReport: (repoId: number): Promise<InterviewReport> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/interview`).then((r) => r.json()),
  },

  docs: {
    getDocs: (repoId: number): Promise<DocsResponse> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/docs`).then((r) => r.json()),
  },

  prReview: {
    submitReview: (repoId: number, diff: string): Promise<PRReviewResponse> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diff }),
      }).then((r) => r.json()),
  },

  knowledgeGraph: {
    getGraph: (repoId: number, maxNodes = 500): Promise<KnowledgeGraphResponse> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/graph?max_nodes=${maxNodes}`).then((r) => r.json()),

    searchGraph: (repoId: number, query: string): Promise<GraphSearchResponse> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/graph/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      }).then((r) => r.json()),

    getEntityCounts: (repoId: number): Promise<EntityCountsResponse> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/graph/entities`).then((r) => r.json()),
  },
};
