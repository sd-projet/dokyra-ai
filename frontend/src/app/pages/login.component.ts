import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, DEMO } from '../core/auth.service';
import { DEMO_ACCOUNTS, DemoAccount } from '../core/demo-accounts';
import { errorMessage } from '../core/errors';
import { SiteHeaderComponent } from './site-header.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, SiteHeaderComponent],
  template: `
    <app-site-header [cta]="false" />
    <main class="wrap">
      <div class="cols" [class.solo]="!demoAccounts.length">
        <form class="card stack" (ngSubmit)="submit()">
          <div>
            <h1>Connexion</h1>
            <p class="muted small">Accédez à l'assistant documentaire de votre entreprise.</p>
          </div>
          <label class="field">Utilisateur
            <input name="u" [(ngModel)]="username" autocomplete="username" required autofocus>
          </label>
          <label class="field">Mot de passe
            <input name="p" type="password" [(ngModel)]="password" autocomplete="current-password" required>
          </label>
          @if (demo) { <p class="muted small">Version de démonstration : aucun serveur, aucune donnée envoyée. Utilisez un compte de droite.</p> }
          @if (error()) { <div class="alert error">{{ error() }}</div> }
          <button class="primary" type="submit" [disabled]="busy()">
            @if (busy()) { <span class="spinner"></span> } Se connecter
          </button>
        </form>

        @if (demoAccounts.length) {
          <section class="card stack demo" aria-labelledby="demo-title">
            <div>
              <h2 id="demo-title">Comptes de démonstration</h2>
              <p class="muted small">Cliquez sur un compte pour remplir le formulaire.</p>
            </div>
            @for (a of demoAccounts; track a.username) {
              <button type="button" class="acct" (click)="fill(a)">
                <strong>{{ a.label }}</strong>
                <span class="small muted">{{ a.description }}</span>
                <code>{{ a.username }} / {{ a.password }}</code>
              </button>
            }
          </section>
        }
      </div>
    </main>`,
  styles: [`
    :host { display: block; }
    .wrap { min-height: calc(100vh - 3.75rem); display: grid; place-items: center; padding: 1.5rem 1rem 4rem; }
    .cols { width: 100%; max-width: 800px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1.25rem; align-items: stretch; }
    .cols.solo { max-width: 380px; grid-template-columns: minmax(0, 1fr); }
    @media (max-width: 820px) { .cols { max-width: 380px; grid-template-columns: minmax(0, 1fr); } }
    form { padding: 1.5rem; }
    h1 { font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif;
      font-size: 1.7rem; margin-bottom: .25rem; }
    .demo { border-style: dashed; background: var(--surface-2); box-shadow: none; gap: .6rem; }
    .demo h2 { font-size: 1rem; margin: 0; }
    .demo p { margin: .1rem 0 0; }
    .acct { flex: 1 1 auto; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: .15rem; width: 100%;
      text-align: left; padding: .6rem .75rem; background: var(--surface); }
    .acct:hover:not(:disabled) { border-color: var(--accent); background: var(--surface); }
    .acct code { font-size: .85rem; color: var(--accent); overflow-wrap: anywhere; }
  `],
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  demoAccounts = DEMO_ACCOUNTS;
  demo = DEMO;
  username = ''; password = '';
  busy = signal(false); error = signal('');

  fill(account: DemoAccount) {
    this.username = account.username;
    this.password = account.password;
    this.error.set('');
  }

  async submit() {
    this.busy.set(true); this.error.set('');
    try {
      await this.auth.login(this.username.trim(), this.password);
      await this.router.navigate(['/chat']);
    } catch (e) { this.error.set(errorMessage(e)); }
    finally { this.busy.set(false); }
  }
}