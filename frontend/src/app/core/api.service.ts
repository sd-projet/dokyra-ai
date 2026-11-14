import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API, AuthService } from './auth.service';
import { errorMessage } from './errors';
import {
  AgentResponse, AskRequest, AskResponse, CompareRequest, CompareResult, ConversationDetail,
  ConversationSummary, DocumentItem, ModelCompareResult, ReportFile, StreamHandlers, UsageSummary, UserRow,
} from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  // --- documents
  documents() { return this.http.get<DocumentItem[]>(`${API}/documents`); }
  upload(file: File, title: string, version: string) {
    const f = new FormData();
    f.append('file', file); f.append('title', title); f.append('version', version);
    return this.http.post<DocumentItem>(`${API}/documents`, f);
  }
  deleteDocument(id: number) { return this.http.delete<void>(`${API}/documents/${id}`); }
  compareDocuments(body: CompareRequest) { return this.http.post<CompareResult>(`${API}/documents/compare`, body); }

  // --- chat
  ask(body: AskRequest) { return this.http.post<AskResponse>(`${API}/chat/ask`, body); }
  conversations() { return this.http.get<ConversationSummary[]>(`${API}/conversations`); }
  conversation(id: string) { return this.http.get<ConversationDetail>(`${API}/conversations/${id}`); }
  deleteConversation(id: string) { return this.http.delete<void>(`${API}/conversations/${id}`); }
  feedback(messageId: number, value: -1 | 0 | 1) {
    return this.http.post<void>(`${API}/messages/${messageId}/feedback`, { value });
  }

  /** Streaming SSE via fetch (EventSource ne gère ni POST ni l'en-tête Authorization). */
  async streamChat(body: AskRequest, h: StreamHandlers): Promise<void> {
    const res = await fetch(`${API}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.auth.token}` },
      body: JSON.stringify(body),
    });
    if (res.status === 401) { this.auth.logout(); throw new Error('Session expirée.'); }
    if (!res.ok || !res.body) {
      const detail = await res.json().then((j: { detail?: string }) => j.detail).catch(() => undefined);
      throw new Error(detail ?? `Erreur ${res.status}`);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const events = buf.split('\n\n');
      buf = events.pop() ?? '';
      for (const e of events) {
        const type = /^event: (\w+)/m.exec(e)?.[1];
        const raw = /^data: (.*)$/ms.exec(e)?.[1];
        if (!type || raw === undefined) continue;
        const data: unknown = JSON.parse(raw);
        if (type === 'meta') h.onMeta(data as never);
        else if (type === 'sources') h.onSources(data as never);
        else if (type === 'token') h.onToken(data as string);
        else if (type === 'done') h.onDone(data as never);
        else if (type === 'error') throw new Error((data as { detail: string }).detail);
      }
    }
  }

  // --- agent
  agentRun(message: string, threadId: string) {
    return this.http.post<AgentResponse>(`${API}/agent/run`, { message, thread_id: threadId });
  }
  agentResume(threadId: string, approved: boolean) {
    return this.http.post<AgentResponse>(`${API}/agent/resume`, { thread_id: threadId, approved });
  }
  reports() { return this.http.get<ReportFile[]>(`${API}/reports`); }
  async openReport(name: string): Promise<void> {
    const blob = await firstValueFrom(this.http.get(`${API}/reports/${encodeURIComponent(name)}`, { responseType: 'blob' }));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  // --- LLM
  models() { return this.http.get<{ default: string; available: string[] }>(`${API}/llm/models`); }
  compareModels(question: string, models: string[], documentIds: number[] | null) {
    return this.http.post<ModelCompareResult>(`${API}/llm/compare`, { question, models, document_ids: documentIds });
  }
  usage(days: number) { return this.http.get<UsageSummary>(`${API}/usage`, { params: new HttpParams().set('days', days) }); }

  // --- utilisateurs (admin)
  users() { return this.http.get<UserRow[]>(`${API}/auth/users`); }
  deleteUser(id: number) { return this.http.delete<void>(`${API}/auth/users/${id}`); }
  createUser(username: string, password: string, role: string) {
    return this.http.post<UserRow>(`${API}/auth/users`, { username, password, role });
  }

  err = errorMessage;
}