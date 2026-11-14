import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../core/errors';
import { MarkdownPipe } from '../core/markdown.pipe';
import { DocumentItem, ModelCompareResult } from '../core/models';

@Component({
  selector: 'app-models',
  standalone: true,
  imports: [FormsModule, MarkdownPipe],
  template: `
    <div class="page stack">
      <header><h1>Comparer les modèles</h1>
        <p class="muted">La même question et les mêmes passages sont envoyés à plusieurs modèles : comparez la qualité, la latence et le coût.</p></header>

      <section class="card stack">
        <label class="field">Question
          <textarea rows="2" [(ngModel)]="question" placeholder="Ex. : Quelles sont les conditions pour 3 jours de télétravail ?"></textarea></label>
        <div class="row">
          <span class="small muted">Modèles (4 max) :</span>
          @for (m of available(); track m) {
            <button class="chip" [class.on]="selected().includes(m)" (click)="toggle(m)">{{ m }}</button>
          }
        </div>
        <div class="row">
          <label class="field">Documents
            <select [(ngModel)]="docId"><option [ngValue]="null">Tous</option>@for (d of docs(); track d.id) { <option [ngValue]="d.id">{{ d.title }} v{{ d.version }}</option> }</select></label>
          <span class="grow"></span>
          <button class="primary" (click)="run()" [disabled]="busy() || !question.trim() || !selected().length">
            @if (busy()) { <span class="spinner"></span> Comparaison… } @else { Comparer }
          </button>
        </div>
        @if (error()) { <div class="alert error">{{ error() }}</div> }
      </section>

      @if (result(); as r) {
        <div class="grid">
          @for (run of r.runs; track run.model) {
            <article class="card stack">
              <div class="row"><h2 class="grow">{{ run.model }}</h2>
                @if (run.model === fastest()) { <span class="tag ok">⚡ le plus rapide</span> }
                @if (run.model === cheapest()) { <span class="tag ok">💰 le moins cher</span> }</div>
              @if (run.error) { <div class="alert error">{{ run.error }}</div> }
              @else if (run.usage) {
                <div class="row small muted">
                  <span>{{ (run.usage.latency_ms / 1000).toFixed(1) }} s</span>
                  <span>{{ run.usage.prompt_tokens }} → {{ run.usage.completion_tokens }} tokens</span>
                  <span>\${{ run.usage.cost_usd.toFixed(5) }}</span>
                </div>
                <div class="md" [innerHTML]="run.text | md"></div>
              }
            </article>
          }
        </div>
        <p class="small muted">Passages communs fournis aux modèles : {{ r.sources.length }} (par ex. {{ r.sources[0]?.title }}, p. {{ r.sources[0]?.page }}). Les coûts sont des estimations basées sur la table de prix configurée (MODEL_PRICES).</p>
      }
    </div>`,
  styles: [`.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; align-items: start; }`],
})
export class ModelsComponent implements OnInit {
  private api = inject(ApiService);
  available = signal<string[]>([]);
  selected = signal<string[]>([]);
  docs = signal<DocumentItem[]>([]);
  result = signal<ModelCompareResult | null>(null);
  busy = signal(false); error = signal('');
  question = ''; docId: number | null = null;

  ngOnInit() {
    this.api.models().subscribe({
      next: m => { this.available.set(m.available); this.selected.set(m.available.slice(0, 2)); },
      error: e => this.error.set(errorMessage(e)),
    });
    this.api.documents().subscribe({ next: d => this.docs.set(d), error: () => { /* non bloquant */ } });
  }

  toggle(m: string) {
    this.selected.update(s => s.includes(m) ? s.filter(x => x !== m) : s.length < 4 ? [...s, m] : s);
  }

  private best(key: 'latency_ms' | 'cost_usd'): string | null {
    const ok = (this.result()?.runs ?? []).filter(r => r.usage && !r.error);
    if (ok.length < 2) return null;
    return ok.reduce((a, b) => (b.usage![key] < a.usage![key] ? b : a)).model;
  }
  fastest() { return this.best('latency_ms'); }
  cheapest() { return this.best('cost_usd'); }

  async run() {
    this.busy.set(true); this.error.set(''); this.result.set(null);
    try {
      this.result.set(await firstValueFrom(this.api.compareModels(
        this.question, this.selected(), this.docId ? [this.docId] : null)));
    } catch (e) { this.error.set(errorMessage(e)); }
    finally { this.busy.set(false); }
  }
}
