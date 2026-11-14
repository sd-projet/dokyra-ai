export interface UserInfo { id: number; username: string; role: 'admin' | 'user'; }
export interface LoginResponse { access_token: string; user: UserInfo; }

export interface DocumentItem {
  id: number; title: string; version: string; filename: string;
  page_count: number; chunk_count: number; created_at: string | null;
}
export interface Source {
  document_id: number; title: string; version: string; page: number;
  content: string; score: number; chunk_id: number | null;
}
export interface Usage {
  model: string; prompt_tokens: number; completion_tokens: number; latency_ms: number; cost_usd: number;
}

export interface AskRequest {
  question: string; document_ids: number[] | null; conversation_id: string | null; structured?: boolean;
}
export interface AskResponse {
  conversation_id: string; message_id: number | null; answer: string; sources: Source[]; cited: number[];
  key_points: string[]; confidence: string | null; found: boolean;
  standalone_question: string | null; usage: Usage | null;
}
export interface ConversationSummary { id: string; title: string; updated_at: string | null; }
export interface StoredMessage {
  id: number; role: 'user' | 'assistant'; content: string; sources: Source[]; cited: number[];
  usage: Usage | null; feedback: number | null;
}
export interface ConversationDetail extends ConversationSummary { messages: StoredMessage[]; }

export interface AgentStep { tool: string; args: Record<string, unknown>; result: string | null; }
export interface AgentPending { action: string; title: string; preview?: string; }
export interface AgentResponse {
  status: 'done' | 'needs_approval'; answer?: string; pending?: AgentPending;
  steps: AgentStep[]; reports?: string[];
}

export interface CompareRequest {
  topic: string; document_id_a?: number; document_id_b?: number; title?: string; generate_pdf: boolean;
}
export interface CompareResult {
  markdown: string; doc_a: DocumentItem; doc_b: DocumentItem; usage: Usage | null; report: string | null;
}
export interface ModelRunResult { model: string; text: string; error: string | null; usage: Usage | null; }
export interface ModelCompareResult { question: string; sources: Source[]; runs: ModelRunResult[]; }

export interface UsageRow {
  calls: number; prompt_tokens: number; completion_tokens: number; cost_usd: number; avg_latency_ms: number;
  model?: string; operation?: string; day?: string;
}
export interface UsageSummary {
  days: number; total: UsageRow; by_model: UsageRow[]; by_operation: UsageRow[]; by_day: UsageRow[];
}
export interface UserRow { id: number; username: string; role: string; created_at: string | null; }
export interface ReportFile { name: string; size: number; modified: number; }

export interface StreamHandlers {
  onMeta: (m: { conversation_id: string; title: string }) => void;
  onSources: (s: Source[]) => void;
  onToken: (t: string) => void;
  onDone: (d: { message_id: number | null; cited: number[]; usage: Usage | null }) => void;
}
