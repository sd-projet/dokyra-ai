import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/errors';
import { UserRow } from '../core/models';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="page stack">
      <header><h1>Utilisateurs</h1><p class="muted">Les administrateurs importent et suppriment les documents ; les utilisateurs posent des questions.</p></header>
      <section class="card stack">
        <h2>Créer un compte</h2>
        <form class="row" (ngSubmit)="create()">
          <label class="field">Identifiant<input name="u" [(ngModel)]="username" required></label>
          <label class="field">Mot de passe (8 car. min.)<input name="p" type="password" [(ngModel)]="password" required autocomplete="new-password"></label>
          <label class="field">Rôle<select name="r" [(ngModel)]="role"><option value="user">user</option><option value="admin">admin</option></select></label>
          <button class="primary" type="submit" [disabled]="busy()">Créer</button>
        </form>
        @if (msg()) { <div class="alert" [class.ok]="!err()" [class.error]="err()">{{ msg() }}</div> }
      </section>
      <section class="card">
        <table><thead><tr><th>Identifiant</th><th>Rôle</th><th>Créé le</th><th></th></tr></thead>
          <tbody>@for (u of users(); track u.id) {
            <tr><td>{{ u.username }}</td><td><span class="tag" [class.warn]="u.role === 'admin'">{{ u.role }}</span></td><td>{{ u.created_at | date: 'dd/MM/yyyy' }}</td>
              <td class="act">
                @if (u.id === me()?.id) { <span class="muted small">Vous</span> }
                @else if (confirmId() === u.id) {
                  <span class="small">Supprimer « {{ u.username }} » et ses conversations ?</span>
                  <button class="danger" type="button" [disabled]="busy()" (click)="remove(u)">Confirmer</button>
                  <button type="button" (click)="confirmId.set(null)">Annuler</button>
                } @else {
                  <button type="button" [attr.aria-label]="'Supprimer ' + u.username" (click)="confirmId.set(u.id)">Supprimer</button>
                }
              </td></tr>
          }</tbody></table>
      </section>
    </div>`,
})
export class UsersComponent implements OnInit {
  private api = inject(ApiService);
  me = inject(AuthService).user;
  confirmId = signal<number | null>(null);
  users = signal<UserRow[]>([]);
  busy = signal(false); msg = signal(''); err = signal(false);
  username = ''; password = ''; role = 'user';

  ngOnInit() { this.reload(); }
  reload() { this.api.users().subscribe({ next: u => this.users.set(u), error: e => { this.err.set(true); this.msg.set(errorMessage(e)); } }); }

  async remove(u: UserRow) {
    this.busy.set(true); this.msg.set('');
    try {
      await firstValueFrom(this.api.deleteUser(u.id));
      this.err.set(false); this.msg.set(`Compte « ${u.username} » supprimé.`);
      this.confirmId.set(null); this.reload();
    } catch (e) { this.err.set(true); this.msg.set(errorMessage(e)); this.confirmId.set(null); }
    finally { this.busy.set(false); }
  }

  async create() {
    this.busy.set(true); this.msg.set('');
    try {
      const u = await firstValueFrom(this.api.createUser(this.username, this.password, this.role));
      this.err.set(false); this.msg.set(`Compte « ${u.username} » créé.`);
      this.username = ''; this.password = ''; this.reload();
    } catch (e) { this.err.set(true); this.msg.set(errorMessage(e)); }
    finally { this.busy.set(false); }
  }
}