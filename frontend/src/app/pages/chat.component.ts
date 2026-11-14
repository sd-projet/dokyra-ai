import { Component, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../core/errors';
import { MarkdownPipe } from '../core/markdown.pipe';
import { ConversationSummary, DocumentItem, Source, Usage } from '../core/models';

type UsageLabel = Usage & { total_label: string };

interface ChatMsg {
  id: number | null; role: 'user' | 'assistant'; content: string;
  sources: Source[]; cited: number[]; keyPoints: string[]; confidence: string | null;
  usage: UsageLabel | null; feedback: number | null; streaming: boolean; error: boolean; found: boolean;
}

const blank = (role: 'user' | 'assistant', content: string): ChatMsg => ({
  id: null, role, content, sources: [], cited: [], keyPoints: [], confidence: null,
  usage: null, feedback: null, streaming: false, error: false, found: true,
});

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule, MarkdownPipe],
  template: `
    <div class="chat">
      <aside class="convs">
        <button class="primary" (click)="newChat()">+ Nouvelle conversation</button>
        <div class="list">
          @for (c of conversations(); track c.id) {
            <div class="conv" [class.active]="c.id === conversationId" (click)="open(c.id)">
              <span class="title">{{ c.title }}</span>
              <button class="ghost small" title="Supprimer" (click)="remove(c, $event)">✕</button>
            </div>
          } @empty { <p class="muted small">Aucune conversation.</p> }
        </div>
      </aside>

      <section class="main">
        <div class="messages" #scroller>
          @if (!messages().length) {
            <div class="empty">
              <h2>Posez une question à vos documents</h2>
              <p class="muted">Les réponses s'appuient uniquement sur les documents importés, avec leurs sources et pages.</p>
              @if (!docs().length) { <p class="alert warn">Aucun document importé pour l'instant : rendez-vous dans « Documents ».</p> }
            </div>
          }
          @for (m of messages(); track $index) {
            <article class="msg" [class.user]="m.role === 'user'">
              @if (m.role === 'user') { <div class="bubble">{{ m.content }}</div> }
              @else {
                <div class="bubble" [class.err]="m.error">
                  @if (m.keyPoints.length) {
                    <ul class="points">@for (p of m.keyPoints; track $index) { <li>{{ p }}</li> }</ul>
                  }
                  <div class="md" [class.cursor]="m.streaming" [innerHTML]="m.content | md"></div>
                  @if (!m.streaming && !m.error) {
                    <div class="meta row small muted">
                      @if (m.confidence) { <span class="tag" [class.ok]="m.confidence === 'high'" [class.warn]="m.confidence !== 'high'">confiance {{ m.confidence }}</span> }
                      @if (!m.found) { <span class="tag warn">non trouvé dans les documents</span> }
                      @if (m.sources.length) { <button class="chip" (click)="show($index)">📎 {{ m.sources.length }} sources</button> }
                      @if (m.usage) { <span>{{ m.usage.total_label }}</span> }
                      <span class="grow"></span>
                      @if (m.id !== null) {
                        <button class="ghost small" [class.on]="m.feedback === 1" title="Utile" (click)="rate(m, 1)">👍</button>
                        <button class="ghost small" [class.on]="m.feedback === -1" title="Pas utile" (click)="rate(m, -1)">👎</button>
                      }
                    </div>
                  }
                </div>
              }
            </article>
          }
          @if (busy() && !streamingStarted()) { <div class="muted small"><span class="spinner"></span> Recherche dans les documents…</div> }
        </div>

        @if (error()) { <div class="alert error">{{ error() }}</div> }
        <div class="composer card">
          <div class="row small">
            <label class="row"><input type="checkbox" [(ngModel)]="structured"> Réponse structurée (JSON : points clés, confiance)</label>
            <span class="grow"></span>
            @if (docs().length) {
              <details class="docfilter">
                <summary>{{ selectedDocs().length ? selectedDocs().length + ' document(s) ciblé(s)' : 'Tous les documents' }}</summary>
                <div class="pop card">
                  @for (d of docs(); track d.id) {
                    <label class="row"><input type="checkbox" [checked]="selectedDocs().includes(d.id)" (change)="toggleDoc(d.id)"> {{ d.title }} <span class="muted">v{{ d.version }}</span></label>
                  }
                  @if (selectedDocs().length) { <button class="small" (click)="selectedDocs.set([])">Tout désélectionner</button> }
                </div>
              </details>
            }
          </div>
          <div class="row">
            <textarea class="grow" rows="2" [(ngModel)]="question" placeholder="Ex. : Quelles sont les conditions pour 3 jours de télétravail par semaine ?"
                      (keydown.enter)="onEnter($event)"></textarea>
            <button class="primary" (click)="send()" [disabled]="busy() || !question.trim()">Envoyer</button>
          </div>
        </div>
      </section>

      <aside class="sources">
        <h3>Sources</h3>
        @if (activeSources().length) {
          @for (s of activeSources(); track $index) {
            <div class="src" [class.cited]="activeCited().includes($index + 1)">
              <div class="row small"><strong>[{{ $index + 1 }}]</strong> <span class="grow">{{ s.title }} <span class="muted">v{{ s.version }}</span></span><span class="tag">p. {{ s.page }}</span></div>
              <p class="excerpt small muted">{{ s.content }}</p>
            </div>
          }
          <p class="small muted">Les sources en surbrillance sont celles citées dans la réponse.</p>
        } @else { <p class="muted small">Les extraits utilisés pour répondre s'affichent ici.</p> }
      </aside>
    </div>`,
  styles: [`
    .chat { display: grid; grid-template-columns: 220px minmax(0, 1fr) 300px; height: 100vh; }
    .convs, .sources { background: var(--surface); padding: .75rem; overflow: auto; display: flex; flex-direction: column; gap: .5rem; }
    .convs { border-right: 1px solid var(--border); } .sources { border-left: 1px solid var(--border); }
    .list { display: flex; flex-direction: column; gap: 2px; }
    .conv { display: flex; align-items: center; gap: .25rem; padding: .4rem .5rem; border-radius: 8px; cursor: pointer; }
    .conv:hover { background: var(--surface-2); } .conv.active { background: var(--accent-soft); }
    .conv .title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .9rem; }
    .main { display: flex; flex-direction: column; min-width: 0; padding: 1rem; gap: .75rem; height: 100vh; }
    .messages { flex: 1; overflow: auto; display: flex; flex-direction: column; gap: .9rem; padding-right: .25rem; }
    .empty { margin: auto; text-align: center; max-width: 440px; }
    .msg { display: flex; } .msg.user { justify-content: flex-end; }
    .bubble { max-width: 85%; padding: .6rem .85rem; border-radius: 12px; background: var(--surface); border: 1px solid var(--border); }
    .msg.user .bubble { background: var(--accent); color: var(--accent-text); border-color: var(--accent); white-space: pre-wrap; }
    .bubble.err { border-color: var(--danger); }
    .points { margin: 0 0 .5rem; padding: .5rem .5rem .5rem 1.4rem; background: var(--accent-soft); border-radius: 8px; }
    .meta { margin-top: .5rem; } .meta button.on { background: var(--accent-soft); }
    .composer { display: flex; flex-direction: column; gap: .5rem; padding: .6rem; }
    .docfilter { position: relative; } .docfilter summary { cursor: pointer; color: var(--muted); }
    .pop { position: absolute; right: 0; bottom: 1.8rem; z-index: 5; width: 280px; max-height: 260px; overflow: auto; display: flex; flex-direction: column; gap: .35rem; }
    .src { border: 1px solid var(--border); border-radius: 8px; padding: .5rem; }
    .src.cited { border-color: var(--accent); background: var(--accent-soft); }
    .excerpt { margin: .3rem 0 0; max-height: 7.5em; overflow: auto; white-space: pre-wrap; }
    @media (max-width: 1100px) { .chat { grid-template-columns: 180px minmax(0, 1fr); } .sources { display: none; } }
    @media (max-width: 800px) { .chat { grid-template-columns: 1fr; height: auto; } .convs { display: none; } .main { height: 85vh; } }
  `],
})
export class ChatComponent implements OnInit {
  private api = inject(ApiService);
  @ViewChild('scroller') scroller?: ElementRef<HTMLElement>;

  conversations = signal<ConversationSummary[]>([]);
  messages = signal<ChatMsg[]>([]);
  docs = signal<DocumentItem[]>([]);
  selectedDocs = signal<number[]>([]);
  activeSources = signal<Source[]>([]);
  activeCited = signal<number[]>([]);
  busy = signal(false);
  streamingStarted = signal(false);
  error = signal('');
  conversationId: string | null = null;
  question = '';
  structured = false;

  ngOnInit() {
    this.refreshConversations();
    this.api.documents().subscribe({ next: d => this.docs.set(d), error: e => this.error.set(errorMessage(e)) });
  }

  private refreshConversations() {
    this.api.conversations().subscribe({ next: c => this.conversations.set(c), error: () => { /* non bloquant */ } });
  }

  newChat() {
    this.conversationId = null; this.messages.set([]); this.activeSources.set([]); this.activeCited.set([]); this.error.set('');
  }

  async open(id: string) {
    try {
      const c = await firstValueFrom(this.api.conversation(id));
      this.conversationId = c.id;
      this.messages.set(c.messages.map(m => ({
        ...blank(m.role, m.content), id: m.id, sources: m.sources, cited: m.cited,
        usage: m.usage ? this.label(m.usage) : null, feedback: m.feedback,
      })));
      this.error.set('');
      const lastAnswer = this.messages().length - 1;
      if (lastAnswer >= 0) this.show(lastAnswer);
      this.scrollDown();
    } catch (e) { this.error.set(errorMessage(e)); }
  }

  async remove(c: ConversationSummary, ev: Event) {
    ev.stopPropagation();
    if (!confirm(`Supprimer « ${c.title} » ?`)) return;
    try {
      await firstValueFrom(this.api.deleteConversation(c.id));
      if (c.id === this.conversationId) this.newChat();
      this.refreshConversations();
    } catch (e) { this.error.set(errorMessage(e)); }
  }

  show(index: number) {
    const m = this.messages()[index];
    if (m) { this.activeSources.set(m.sources); this.activeCited.set(m.cited); }
  }

  toggleDoc(id: number) {
    this.selectedDocs.update(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  }

  onEnter(ev: Event) {
    const e = ev as KeyboardEvent;
    if (!e.shiftKey) { e.preventDefault(); this.send(); }
  }

  rate(m: ChatMsg, value: 1 | -1) {
    if (m.id === null) return;
    const next = m.feedback === value ? 0 : value;
    this.api.feedback(m.id, next).subscribe({
      next: () => this.messages.update(ms => ms.map(x => (x === m ? { ...x, feedback: next || null } : x))),
      error: e => this.error.set(errorMessage(e)),
    });
  }

  private label(u: Usage): UsageLabel {
    return { ...u, total_label: `${u.prompt_tokens + u.completion_tokens} tokens · ${(u.latency_ms / 1000).toFixed(1)} s${u.cost_usd ? ' · $' + u.cost_usd.toFixed(4) : ''}` };
  }

  async send() {
    const q = this.question.trim();
    if (!q || this.busy()) return;
    this.question = ''; this.error.set(''); this.busy.set(true); this.streamingStarted.set(false);
    this.messages.update(ms => [...ms, blank('user', q)]);
    const docIds = this.selectedDocs().length ? this.selectedDocs() : null;
    const body = { question: q, document_ids: docIds, conversation_id: this.conversationId, structured: this.structured };
    this.scrollDown();
    try {
      if (this.structured) await this.sendStructured(body);
      else await this.sendStreaming(body);
      this.refreshConversations();
    } catch (e) {
      this.messages.update(ms => {
        const last = ms[ms.length - 1];
        const err = { ...blank('assistant', errorMessage(e)), error: true };
        return last?.role === 'assistant' && last.streaming ? [...ms.slice(0, -1), { ...last, streaming: false, error: true, content: last.content || err.content }] : [...ms, err];
      });
    } finally { this.busy.set(false); this.scrollDown(); }
  }

  private async sendStructured(body: { question: string; document_ids: number[] | null; conversation_id: string | null; structured: boolean }) {
    const r = await firstValueFrom(this.api.ask(body));
    this.conversationId = r.conversation_id;
    this.messages.update(ms => [...ms, {
      ...blank('assistant', r.answer), id: r.message_id, sources: r.sources, cited: r.cited, keyPoints: r.key_points,
      confidence: r.confidence, found: r.found, usage: r.usage ? this.label(r.usage) : null,
    }]);
    this.show(this.messages().length - 1);
  }

  private async sendStreaming(body: { question: string; document_ids: number[] | null; conversation_id: string | null }) {
    const patch = (fn: (m: ChatMsg) => ChatMsg) =>
      this.messages.update(ms => ms.map((m, i) => (i === ms.length - 1 ? fn(m) : m)));
    this.messages.update(ms => [...ms, { ...blank('assistant', ''), streaming: true }]);
    await this.api.streamChat(body, {
      onMeta: meta => { this.conversationId = meta.conversation_id; },
      onSources: s => { patch(m => ({ ...m, sources: s })); this.activeSources.set(s); this.activeCited.set([]); },
      onToken: t => { this.streamingStarted.set(true); patch(m => ({ ...m, content: m.content + t })); this.scrollDown(); },
      onDone: d => {
        patch(m => ({ ...m, streaming: false, id: d.message_id, cited: d.cited, found: m.sources.length > 0,
                      usage: d.usage ? this.label(d.usage) : null }));
        this.activeCited.set(d.cited);
      },
    });
  }

  private scrollDown() {
    setTimeout(() => { const el = this.scroller?.nativeElement; if (el) el.scrollTop = el.scrollHeight; });
  }
}
