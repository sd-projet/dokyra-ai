import { HttpErrorResponse } from '@angular/common/http';

/** Message lisible à partir d'une erreur HTTP (détail du backend) ou d'une exception. */
export function errorMessage(e: unknown): string {
  if (e instanceof HttpErrorResponse) {
    const d = (e.error as { detail?: unknown } | null)?.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) return d.map(x => (x as { msg?: string }).msg ?? '').filter(Boolean).join(' ; ');
    if (e.status === 0) return 'Serveur injoignable. Le backend est-il démarré ?';
    return `Erreur ${e.status}`;
  }
  return e instanceof Error ? e.message : String(e);
}
