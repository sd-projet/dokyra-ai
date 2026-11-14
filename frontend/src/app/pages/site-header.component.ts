import { Component, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';

/** Barre de navigation publique, partagée par la page d'accueil et la page de connexion. */
@Component({
  selector: 'app-site-header',
  standalone: true,
  imports: [RouterLink],
  template: `
    <header class="nav">
      <div class="w nav-in">
        <a class="logo" routerLink="/" aria-label="Dokyra AI, accueil">Dokyra <span>AI</span></a>
        <nav class="links" aria-label="Sections de la page d'accueil">
          <a href="/#fonctionnement" (click)="go('fonctionnement', $event)">Fonctionnement</a>
          <a href="/#agent" (click)="go('agent', $event)">Agent</a>
          <a href="/#confiance" (click)="go('confiance', $event)">Confiance</a>
        </nav>
        <a class="btn primary" [class.off]="!cta()" [routerLink]="auth.user() ? '/chat' : '/login'">{{ auth.user() ? 'Ouvrir l\\'application' : 'Se connecter' }}</a>
      </div>
    </header>
  `,
  styles: [`
    :host { display: block; position: sticky; top: 0; z-index: 10; }
    .nav { border-bottom: 1px solid var(--border);
      background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(8px); }
    .w { max-width: 1120px; margin: 0 auto; padding-left: 1.25rem; padding-right: 1.25rem; }
    .nav-in { display: flex; align-items: center; gap: 1.5rem; height: 3.75rem; }
    a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 6px; }
    .logo { font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif;
      font-weight: 700; font-size: 1.25rem; color: var(--text); text-decoration: none; }
    .logo span { color: var(--accent); }
    .links { display: flex; gap: 1.5rem; margin-left: auto; }
    .links a { color: var(--muted); text-decoration: none; font-size: .95rem; }
    .links a:hover { color: var(--text); }
    .btn { display: inline-flex; align-items: center; justify-content: center; padding: .5rem 1rem; border-radius: 8px;
      border: 1px solid var(--border); background: var(--surface); color: var(--text); text-decoration: none; font-weight: 500; }
    .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); font-weight: 600; }
    .btn.primary:hover { filter: brightness(1.08); }
    .btn.off { display: none; }
    @media (max-width: 760px) { .links { display: none; } .nav-in { justify-content: space-between; } }
  `],
})
export class SiteHeaderComponent {
  auth = inject(AuthService);
  private router = inject(Router);

  /** Affiche le bouton « Se connecter » / « Ouvrir l'application » (inutile sur la page de connexion). */
  cta = input(true);

  /** Fait défiler jusqu'à une section de l'accueil ; depuis une autre page, revient d'abord à l'accueil. */
  go(id: string, event: Event): void {
    event.preventDefault();
    if (this.router.url.split(/[?#]/)[0] === '/') { this.scroll(id); return; }
    void this.router.navigate(['/']).then(() => setTimeout(() => this.scroll(id), 50));
  }

  private scroll(id: string): void {
    let reduced = false;
    try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignoré */ }
    document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }
}