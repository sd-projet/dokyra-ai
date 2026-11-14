import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/errors';
import { UsageRow, UsageSummary } from '../core/models';

const OPERATIONS: Record<string, string> = {
  ask: 'Questions', condense: 'Reformulation', compare: 'Comparaison de documents',
  compare_models: 'Comparaison de modèles', agent: 'Agent',
};

@Component({
  selector: 'app-usage',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page stack">
      <header class="row">
        <div class="grow"><h1>Usage & coûts</h1>
          <p class="muted">{{ auth.isAdmin() ? 'Consommation de tous les utilisateurs.' : 'Votre consommation.' }} Coûts estimés d'après la table de prix configurée.</p></div>
        <label class="field">Période
          <select [(ngModel)]="days" (ngModelChange)="load()"><option [ngValue]="7">7 jours</option><option [ngValue]="30">30 jours</option><option [ngValue]="90">90 jours</option></select></label>
      </header>
      @if (error()) { <div class="alert error">{{ error() }}</div> }
      @if (data(); as d) {
        <div class="tiles">
          <div class="card"><div class="muted small">Appels au modèle</div><div class="big">{{ d.total.calls }}</div></div>
          <div class="card"><div class="muted small">Tokens (entrée + sortie)</div><div class="big">{{ fmt(d.total.prompt_tokens + d.total.completion_tokens) }}</div></div>
          <div class="card"><div class="muted small">Coût estimé</div><div class="big">\${{ d.total.cost_usd.toFixed(4) }}</div></div>
          <div class="card"><div class="muted small">Latence moyenne</div><div class="big">{{ (d.total.avg_latency_ms / 1000).toFixed(1) }} s</div></div>
        </div>

        <section class="card">
          <h2>Coût par jour</h2>
          @if (d.by_day.length) {
            <div class="bars" role="img" aria-label="Coût estimé par jour">
              @for (r of d.by_day; track r.day) {
                <div class="bar" [title]="r.day + ' : $' + r.cost_usd.toFixed(4) + ' (' + r.calls + ' appels)'">
                  <div class="fill" [style.height.%]="height(r, d)"></div><span>{{ (r.day ?? '').slice(5) }}</span>
                </div>
              }
            </div>
          } @else { <p class="muted">Pas encore de données.</p> }
        </section>

        <div class="two">
          <section class="card"><h2>Par modèle</h2>
            <table><thead><tr><th>Modèle</th><th class="num">Appels</th><th class="num">Tokens</th><th class="num">Coût</th><th class="num">Latence</th></tr></thead>
              <tbody>@for (r of d.by_model; track r.model) {
                <tr><td>{{ r.model }}</td><td class="num">{{ r.calls }}</td><td class="num">{{ fmt(r.prompt_tokens + r.completion_tokens) }}</td>
                  <td class="num">\${{ r.cost_usd.toFixed(4) }}</td><td class="num">{{ (r.avg_latency_ms / 1000).toFixed(1) }} s</td></tr>
              } @empty { <tr><td colspan="5" class="muted">—</td></tr> }</tbody></table></section>
          <section class="card"><h2>Par fonctionnalité</h2>
            <table><thead><tr><th>Fonction</th><th class="num">Appels</th><th class="num">Tokens</th><th class="num">Coût</th></tr></thead>
              <tbody>@for (r of d.by_operation; track r.operation) {
                <tr><td>{{ op(r.operation) }}</td><td class="num">{{ r.calls }}</td><td class="num">{{ fmt(r.prompt_tokens + r.completion_tokens) }}</td>
                  <td class="num">\${{ r.cost_usd.toFixed(4) }}</td></tr>
              } @empty { <tr><td colspan="4" class="muted">—</td></tr> }</tbody></table></section>
        </div>
      }
    </div>`,
  styles: [`
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; }
    .big { font-size: 1.6rem; font-weight: 700; }
    .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 1rem; align-items: start; }
    .bars { display: flex; align-items: flex-end; gap: 6px; height: 150px; margin-top: .5rem; overflow-x: auto; }
    .bar { display: flex; flex-direction: column; justify-content: flex-end; align-items: center; height: 100%; min-width: 34px; flex: 1; max-width: 60px; font-size: .7rem; color: var(--muted); }
    .fill { width: 100%; background: var(--accent); border-radius: 4px 4px 0 0; min-height: 2px; }
  `],
})
export class UsageComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);
  data = signal<UsageSummary | null>(null);
  error = signal('');
  days = 30;

  ngOnInit() { this.load(); }
  load() {
    this.api.usage(this.days).subscribe({ next: d => this.data.set(d), error: e => this.error.set(errorMessage(e)) });
  }
  fmt(n: number) { return n.toLocaleString('fr-FR'); }
  op(key?: string) { return key ? (OPERATIONS[key] ?? key) : '—'; }
  height(r: UsageRow, d: UsageSummary) {
    const max = Math.max(...d.by_day.map(x => x.cost_usd), 1e-9);
    return Math.max((r.cost_usd / max) * 100, 2);
  }
}
