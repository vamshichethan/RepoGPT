export interface Repository {
  id: number;
  name: string;
  owner: string;
  github_url: string;
  description: string | null;
  status: 'pending' | 'cloning' | 'scanning' | 'chunking' | 'embedding' | 'summarizing' | 'architecting' | 'graph_building' | 'ready' | 'error';
  status_message: string | null;
  primary_languages: string[];
  num_files: number | null;
  total_loc: number | null;
  detected_frameworks: string[];
  detected_databases: string[];
  detected_dependencies: Record<string, string>;
  summary_json: Summary | null;
  architecture_json: Architecture | null;
  created_at: string;
  updated_at: string;
}

export interface IngestionStatus {
  id: number;
  status: Repository['status'];
  status_message: string | null;
  progress_percent: number;
}

export interface Summary {
  project_purpose: string;
  tech_stack: Record<string, string>;
  folder_structure: string;
  modules: ModuleInfo[];
  dependencies: DependencyInfo[];
}

export interface ModuleInfo {
  name: string;
  description: string;
  key_files: string[];
}

export interface DependencyInfo {
  name: string;
  version: string;
  purpose: string;
}

export interface ChatSession {
  id: number;
  repository_id: number;
  title: string | null;
  created_at: string;
}

export interface Message {
  id: number;
  session_id: number;
  role: 'user' | 'assistant';
  content: string;
  sources: ChatSource[];
  created_at: string;
}

export interface ChatSource {
  file_path: string;
  chunk_index: number;
  relevance_score: number;
}

export interface ServiceDependency {
  service: string;
  depends_on: string;
  description: string;
}

export interface Architecture {
  architecture_summary: string;
  mermaid_code: string;
  service_dependencies: ServiceDependency[];
  tech_stack_breakdown: Record<string, string>;
  data_flow_description: string;
}

export interface DependencyGraphNode {
  id: string;
  type: string;
  name: string;
  file_path?: string;
}

export interface DependencyGraphEdge {
  source_id: string;
  target_id: string;
  relationship_type: string;
}

export interface DependencyGraphResponse {
  nodes: DependencyGraphNode[];
  edges: DependencyGraphEdge[];
}

export interface FlowTraceResponse {
  text_explanation: string;
  mermaid_code: string;
}

export interface ImpactAnalysisResponse {
  affected_files: string[];
  affected_features: string[];
  risk_level: 'Low' | 'Medium' | 'High' | 'Critical';
  risk_score: number;
  testing_recommendations: string[];
}

// Feature 10: Interview Mode
export interface InterviewQuestion {
  question: string;
  hint: string;
}

export interface DesignDecision {
  decision: string;
  rationale: string;
  tradeoffs: string;
}

export interface ScalabilityItem {
  area: string;
  current_state: string;
  bottleneck: string;
  recommendation: string;
  expected_benefit: string;
}

export interface TechStackItemInterview {
  name: string;
  version: string;
  purpose: string;
}

export interface InterviewReport {
  project_overview: string;
  tech_stack: TechStackItemInterview[];
  interview_questions: {
    beginner: InterviewQuestion[];
    intermediate: InterviewQuestion[];
    advanced: InterviewQuestion[];
  };
  design_decisions: DesignDecision[];
  scalability_analysis: ScalabilityItem[];
  suggested_improvements: string[];
}

// Feature 11: Auto Documentation
export interface DocsResponse {
  readme: string;
  architecture_doc: string;
  api_docs: string;
  onboarding: string;
}

// Feature 12: PR Review
export interface BugReport {
  file: string;
  line_hint: string;
  description: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
}

export interface SecurityIssue {
  file: string;
  description: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  recommendation: string;
}

export interface CodeSmell {
  file: string;
  description: string;
  smell_type: string;
  suggestion: string;
}

export interface ComplexityItem {
  file: string;
  function_name: string;
  previous_complexity: number;
  new_complexity: number;
  risk: 'Low' | 'Medium' | 'High';
  recommendation: string;
}

export interface PRReviewResponse {
  overall_score: number;
  summary: string;
  bugs: BugReport[];
  security_issues: SecurityIssue[];
  code_smells: CodeSmell[];
  complexity_analysis: ComplexityItem[];
  maintainability_score: number;
  approval_recommendation: 'Approve' | 'Approve with Changes' | 'Request Changes';
  testing_recommendations: string[];
}

// Phase 5: Knowledge Graph types
export interface KnowledgeGraphNode {
  id: string;
  type: 'file' | 'class' | 'function' | 'api' | 'table' | 'service';
  name: string;
  file_path?: string;
  properties?: Record<string, string>;
}

export interface KnowledgeGraphEdge {
  source: string;
  target: string;
  type: string; // CALLS, IMPORTS, USES, READS, WRITES, HANDLES, CALLS_SERVICE
}

export interface KnowledgeGraphResponse {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  entity_counts: Record<string, number>;
}

export interface GraphSearchResponse {
  context: string;
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

export interface EntityCountsResponse {
  counts: Record<string, number>;
  total: number;
}
