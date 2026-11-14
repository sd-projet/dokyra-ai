import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/auth.guard';

export const routes: Routes = [
  // Page d'accueil publique : première page vue par un visiteur (les routes protégées restent inchangées)
  { path: '', pathMatch: 'full', loadComponent: () => import('./pages/landing.component').then(m => m.LandingComponent) },
  { path: 'login', loadComponent: () => import('./pages/login.component').then(m => m.LoginComponent) },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/shell.component').then(m => m.ShellComponent),
    children: [
      { path: 'chat', loadComponent: () => import('./pages/chat.component').then(m => m.ChatComponent) },
      { path: 'documents', loadComponent: () => import('./pages/documents.component').then(m => m.DocumentsComponent) },
      { path: 'agent', loadComponent: () => import('./pages/agent.component').then(m => m.AgentComponent) },
      { path: 'models', loadComponent: () => import('./pages/models.component').then(m => m.ModelsComponent) },
      { path: 'usage', loadComponent: () => import('./pages/usage.component').then(m => m.UsageComponent) },
      { path: 'users', canActivate: [adminGuard], loadComponent: () => import('./pages/users.component').then(m => m.UsersComponent) },
    ],
  },
  { path: '**', redirectTo: '' },
];