import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoginResponse, UserInfo } from './models';

export const API = '/api';  // proxifié vers le backend (proxy.conf.json en dev, nginx en Docker)
const TOKEN_KEY = 'dokyra.token';
const USER_KEY = 'dokyra.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private _token = signal<string | null>(this.read(TOKEN_KEY));
  readonly user = signal<UserInfo | null>(this.parseUser());
  readonly isAdmin = computed(() => this.user()?.role === 'admin');

  get token(): string | null { return this._token(); }
  get loggedIn(): boolean { return !!this._token(); }

  async login(username: string, password: string): Promise<void> {
    const r = await firstValueFrom(this.http.post<LoginResponse>(`${API}/auth/login`, { username, password }));
    this._token.set(r.access_token);
    this.user.set(r.user);
    this.write(TOKEN_KEY, r.access_token);
    this.write(USER_KEY, JSON.stringify(r.user));
  }

  logout(): void {
    this._token.set(null);
    this.user.set(null);
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch { /* stockage indisponible */ }
    this.router.navigate(['/login']);
  }

  private read(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  private write(key: string, value: string): void {
    try { localStorage.setItem(key, value); } catch { /* stockage indisponible */ }
  }
  private parseUser(): UserInfo | null {
    try { const raw = this.read(USER_KEY); return raw ? JSON.parse(raw) as UserInfo : null; } catch { return null; }
  }
}
