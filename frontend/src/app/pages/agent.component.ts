import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../core/errors';
import { MarkdownPipe } from '../core/markdown.pipe';
import { AgentPending, AgentResponse, AgentStep } from '../core/models';

interface AgentItem {
  role: 'user' | 'agent'; text: string; steps: AgentStep[]; reports: string[]; error?: boolean;
}

const TOOL_LABELS: Record<string, string> = {
  list_documents: 'Liste des documents', find_document_versions: 'Recherche des versions',
  search_documents: 'Recherche documentaire', compare_documents: 'Comparaison de documents',
  summarize_document: 'Résumé du document', calculate: 'Calcul', current_date: 'Date du jour',
  generate_pdf_report: 'Génération du rapport PDF',
};

@Component({
  selector: 'app-agent',
  standalone: true,
  imports: [FormsModule, MarkdownPipe],
  template: `
    <div class="page agent">
      <header class="row">
        <div class="grow"><h1>Agent</h1>
          <p class="muted">L'agent choisit ses outils (recherche, comparaison, calcul, rapport PDF). Toute action sensible demande votre validation.</p></div>
        <button (click)="reset()">Nouvelle session</button>
      </header>

      <div class="log card" #scroller>
        @if (!items().length) {
          <p class="muted">Exemples :</p>
          <div class="row">
            @for (s of suggestions; track s) { <button class="chip" (click)="question = s">{{ s }}</button> }
          </div>
        }
        @for (it of items(); track $index) {
          <article class="item" [class.user]="it.role === 'user'">
            @if (it.role === 'user') { <div class="bubble user">{{ it.text }}</div> }
            @else {
              @if (it.steps.length) {
                <details class="steps small">
                  <summary>{{ it.steps.length }} étape(s) de l'agent</summary>
                  @for (s of it.steps; track $index) {
                    <div class="step"><strong>{{ label(s.tool) }}</strong> <code>{{ args(s) }}</code>
                      @if (s.result) { <div class="muted result">{{ s.result }}</div> }</div>
                  }
                </details>
              }
              @if (it.text) { <div class="bubble" [class.err]="it.error"><div class="md" [innerHTML]="it.text | md"></div></div> }
              @for (r of it.reports; track r) { <button class="chip" (click)="api.openReport(r)">📄 {{ r }}</button> }
            }
          </article>
        }
        @if (pending(); as p) {
          <div class="approval alert warn stack">
            <strong>Validation requise : {{ p.action === 'generate_pdf_report' ? 'générer un rapport PDF' : p.action }}</strong>
            <div>Titre : « {{ p.title }} »</div>
            @if (p.preview) { <details><summary class="small">Aperçu du contenu</summary><div class="md preview" [innerHTML]="p.preview | md"></div></details> }
            <div class="row">
              <button class="primary" (click)="decide(true)" [disabled]="busy()">✓ Autoriser</button>
              <button (click)="decide(false)" [disabled]="busy()">✕ Refuser</button>
            </div>
          </div>
        }
        @if (busy()) { <div class="muted small"><span class="spinner"></span> L'agent travaille…</div> }
      </div>

      @if (error()) { <div class="alert error">{{ error() }}</div> }
      <div class="row">
        <textarea class="grow" rows="2" [(ngModel)]="question" [disabled]="busy() || !!pending()"
          placeholder="Ex. : Compare les conditions de télétravail de nos deux dernières politiques et génère un rapport."
          (keydown.enter)="onEnter($event)"></textarea>
        <button class="primary" (click)="send()" [disabled]="busy() || !!pending() || !question.trim()">Envoyer</button>
      </div>
    </div>`,
  styles: [`
    .agent { display: flex; flex-direction: column; gap: .75rem; height: 100vh; max-width: 900px; }
    .log { flex: 1; overflow: auto; display: flex; flex-direction: column; gap: .8rem; }
    .item { display: flex; flex-direction: column; gap: .4rem; align-items: flex-start; } .item.user { align-items: flex-end; }
    .bubble { max-width: 90%; padding: .6rem .85rem; border-radius: 12px; background: var(--surface-2); }
    .bubble.user { background: var(--accent); color: var(--accent-text); white-space: pre-wrap; } .bubble.err { background: var(--danger-soft); }
    .steps { border: 1px dashed var(--border); border-radius: 8px; padding: .4rem .6rem; max-width: 90%; }
    .steps summary { cursor: pointer; color: var(--muted); }
    .step { margin-top: .4rem; } .step code { font-size: .8rem; color: var(--muted); word-break: break-word; }
    .result { max-height: 4.5em; overflow: hidden; text-overflow: ellipsis; }
    .preview { max-height: 220px; overflow: auto; margin-top: .4rem; padding: .5rem; background: var(--surface); border-radius: 8px; color: var(--text); }
  `],
})
export class AgentComponent {
  api = inject(ApiService);
  @ViewChild('scroller') scroller?: ElementRef<HTMLElement>;

  items = signal<AgentItem[]>([]);
  pending = signal<AgentPending | null>(null);
  busy = signal(false);
  error = signal('');
  question = '';
  threadId = this.newThread();
  suggestions = [
    'Liste les documents disponibles',
    'Compare les conditions de télétravail de nos deux dernières politiques et génère un rapport',
    'Si je télétravaille 3 jours par semaine sur 47 semaines, combien de jours par an cela fait-il ?',
  ];

  private newThread() { return `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
  label(tool: string) { return TOOL_LABELS[tool] ?? tool; }
  args(s: AgentStep) { return Object.entries(s.args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' '); }

  reset() { this.items.set([]); this.pending.set(null); this.error.set(''); this.threadId = this.newThread(); }

  onEnter(ev: Event) {
    const e = ev as KeyboardEvent;
    if (!e.shiftKey) { e.preventDefault(); this.send(); }
  }

  async send() {
    const q = this.question.trim();
    if (!q || this.busy() || this.pending()) return;
    this.question = '';
    this.items.update(i => [...i, { role: 'user', text: q, steps: [], reports: [] }]);
    await this.call(() => this.api.agentRun(q, this.threadId));
  }

  async decide(approved: boolean) {
    this.pending.set(null);
    await this.call(() => this.api.agentResume(this.threadId, approved));
  }

  private async call(fn: () => ReturnType<ApiService['agentRun']>) {
    this.busy.set(true); this.error.set(''); this.scrollDown();
    try {
      const r: AgentResponse = await firstValueFrom(fn());
      if (r.status === 'needs_approval' && r.pending) {
        this.pending.set(r.pending);
        this.items.update(i => [...i, { role: 'agent', text: '', steps: r.steps, reports: [] }]);
      } else {
        this.items.update(i => [...i, { role: 'agent', text: r.answer ?? '', steps: r.steps, reports: r.reports ?? [] }]);
      }
    } catch (e) { this.error.set(errorMessage(e)); }
    finally { this.busy.set(false); this.scrollDown(); }
  }

  private scrollDown() { setTimeout(() => { const el = this.scroller?.nativeElement; if (el) el.scrollTop = el.scrollHeight; }); }
}
