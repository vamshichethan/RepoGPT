import type { Repository, IngestionStatus, Summary, ChatSession, Message, Architecture, DependencyGraphResponse, FlowTraceResponse, ImpactAnalysisResponse, InterviewReport, DocsResponse, PRReviewResponse, KnowledgeGraphResponse, GraphSearchResponse, EntityCountsResponse } from './types';

const API_BASE =
  typeof window !== 'undefined'
    ? ''
    : (process.env.NEXT_PUBLIC_API_URL || 'https://repogpt-backend-shf2.onrender.com').replace(/\/+$/, '');

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data && typeof data.detail === 'string') {
        message = data.detail;
      } else if (data && typeof data.message === 'string') {
        message = data.message;
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(message);
  }
  return res.json();
}

export const api = {
  repositories: {
    create: (github_url: string): Promise<Repository> =>
      fetch(`${API_BASE}/api/repositories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github_url: github_url.trim() }),
      }).then((r) => handleResponse<Repository>(r)),

    list: (): Promise<Repository[]> =>
      fetch(`${API_BASE}/api/repositories`).then((r) => handleResponse<Repository[]>(r)),

    get: (id: number): Promise<Repository> =>
      fetch(`${API_BASE}/api/repositories/${id}`).then((r) => handleResponse<Repository>(r)),

    getStatus: (id: number): Promise<IngestionStatus> =>
      fetch(`${API_BASE}/api/repositories/${id}/status`).then((r) => handleResponse<IngestionStatus>(r)),

    delete: (id: number): Promise<{ message: string }> =>
      fetch(`${API_BASE}/api/repositories/${id}`, { method: 'DELETE' }).then((r) => handleResponse<{ message: string }>(r)),
  },

  summaries: {
    get: (repoId: number): Promise<Summary> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/summary`).then((r) => handleResponse<Summary>(r)),
  },

  architecture: {
    get: (repoId: number): Promise<Architecture> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/architecture`).then((r) => handleResponse<Architecture>(r)),
  },

  chat: {
    createSession: (repoId: number): Promise<ChatSession> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repository_id: repoId }),
      }).then((r) => handleResponse<ChatSession>(r)),

    getSessions: (repoId: number): Promise<ChatSession[]> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/sessions`).then((r) => handleResponse<ChatSession[]>(r)),

    getMessages: (sessionId: number): Promise<Message[]> =>
      fetch(`${API_BASE}/api/sessions/${sessionId}/messages`).then((r) => handleResponse<Message[]>(r)),

    streamMessage: (sessionId: number, content: string): Promise<Response> =>
      fetch(`${API_BASE}/api/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }),
  },

  productivity: {
    getDependencies: (repoId: number): Promise<DependencyGraphResponse> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/dependencies`)
        .then((r) => handleResponse<DependencyGraphResponse>(r))
        .catch(() => ({ nodes: [], edges: [] })),

    getFlowTrace: (repoId: number, query: string): Promise<FlowTraceResponse> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/flow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
        .then((r) => handleResponse<FlowTraceResponse>(r))
        .catch(() => ({ text_explanation: '', mermaid_code: '' })),

    getImpactAnalysis: (repoId: number, file_path: string): Promise<ImpactAnalysisResponse> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/impact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path }),
      })
        .then((r) => handleResponse<ImpactAnalysisResponse>(r))
        .catch(() => ({
          affected_files: [],
          affected_features: [],
          risk_level: 'Low',
          risk_score: 0,
          testing_recommendations: [],
        })),
  },

  interview: {
    getReport: (repoId: number): Promise<InterviewReport> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/interview`).then((r) => handleResponse<InterviewReport>(r)),
  },

  docs: {
    getDocs: (repoId: number): Promise<DocsResponse> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/docs`).then((r) => handleResponse<DocsResponse>(r)),
  },

  prReview: {
    submitReview: (repoId: number, diff: string): Promise<PRReviewResponse> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diff }),
      }).then((r) => handleResponse<PRReviewResponse>(r)),
  },

  knowledgeGraph: {
    getGraph: (repoId: number, maxNodes = 500): Promise<KnowledgeGraphResponse> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/graph?max_nodes=${maxNodes}`)
        .then((r) => handleResponse<KnowledgeGraphResponse>(r))
        .catch(() => ({ nodes: [], edges: [], entity_counts: {} })),

    searchGraph: (repoId: number, query: string): Promise<GraphSearchResponse> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/graph/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
        .then((r) => handleResponse<GraphSearchResponse>(r))
        .catch(() => ({ context: '', nodes: [], edges: [] })),

    getEntityCounts: (repoId: number): Promise<EntityCountsResponse> =>
      fetch(`${API_BASE}/api/repositories/${repoId}/graph/entities`)
        .then((r) => handleResponse<EntityCountsResponse>(r))
        .catch(() => ({ counts: {}, total: 0 })),
  },
};

