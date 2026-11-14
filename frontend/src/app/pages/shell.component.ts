import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="layout">
      <nav class="side">
        <div class="brand">Dokyra <span>AI</span></div>
        <a routerLink="/chat" routerLinkActive="active">💬 Assistant</a>
        <a routerLink="/documents" routerLinkActive="active">📄 Documents</a>
        <a routerLink="/agent" routerLinkActive="active">🤖 Agent</a>
        <a routerLink="/models" routerLinkActive="active">⚖️ Comparer les modèles</a>
        <a routerLink="/usage" routerLinkActive="active">📊 Usage & coûts</a>
        @if (auth.isAdmin()) { <a routerLink="/users" routerLinkActive="active">👥 Utilisateurs</a> }
        <div class="grow"></div>
        <div class="me small">
          <div>{{ auth.user()?.username }} <span class="tag">{{ auth.user()?.role }}</span></div>
          <button class="small" (click)="auth.logout()">Déconnexion</button>
        </div>
      </nav>
      <main class="content"><router-outlet /></main>
    </div>`,
  styles: [`
    .layout { display: grid; grid-template-columns: 230px 1fr; height: 100vh; }
    .side { background: var(--surface); border-right: 1px solid var(--border); padding: 1rem .75rem; display: flex; flex-direction: column; gap: .2rem; }
    .brand { font-weight: 700; font-size: 1.15rem; padding: .25rem .5rem 1rem; }
    .brand span { color: var(--accent); }
    .side a { padding: .5rem .6rem; border-radius: 8px; text-decoration: none; color: var(--text); }
    .side a:hover { background: var(--surface-2); }
    .side a.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
    .me { padding: .5rem; display: flex; flex-direction: column; gap: .4rem; }
    .content { overflow: auto; min-width: 0; }
    @media (max-width: 800px) {
      .layout { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
      .side { flex-direction: row; flex-wrap: wrap; align-items: center; border-right: 0; border-bottom: 1px solid var(--border); }
      .brand { padding: 0 .5rem; } .me { flex-direction: row; align-items: center; }
    }
  `],
})
export class ShellComponent { auth = inject(AuthService); }
