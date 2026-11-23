import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Observable, delay, from, mergeMap, of, throwError } from 'rxjs';
import { API, DEMO } from '../auth.service';
import { AskRequest, StreamHandlers } from '../models';
import { DemoEngine, DemoError } from './demo-engine';

/** Moteur unique, partagé par l'intercepteur HTTP et le streaming. */
export const demoEngine = new DemoEngine();

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function fail(e: unknown, url: string): Observable<never> {
  const status = e instanceof DemoError ? e.status : 500;
  const detail = e instanceof Error ? e.message : 'Erreur inattendue (démo).';
  return throwError(() => new HttpErrorResponse({ status, url, error: { detail } }));
}

/** Remplace le backend par le moteur de démo quand `window.__DEMO__` est vrai (voir src/config.js). */
export const demoInterceptor: HttpInterceptorFn = (req, next) => {
  if (!DEMO || !req.url.startsWith(API)) return next(req);

  const path = req.url.slice(API.length).split('?')[0];
  const auth = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? null;
  const ok = (body: unknown, status = 200) => of(new HttpResponse({ status, body, url: req.url }));
  const run = (fn: () => Observable<HttpResponse<unknown>>, ms = 250) =>
    of(null).pipe(delay(ms + Math.random() * 250), mergeMap(() => { try { return fn(); } catch (e) { return fail(e, req.url); } }));
  const id = (re: RegExp) => decodeURIComponent(re.exec(path)?.[1] ?? '');
  const body = (req.body ?? {}) as Record<string, unknown>;
  const m = req.method;

  if (path === '/auth/login' && m === 'POST') {
    return run(() => ok(demoEngine.login(String(body['username']), String(body['password']))));
  }

  return run(() => {
    const p = demoEngine.principal(auth);
    const admin = () => demoEngine.requireAdmin(p);

    if (path === '/auth/me') return ok(p);
    if (path === '/auth/users' && m === 'GET') { admin(); return ok(demoEngine.listUsers()); }
    if (path === '/auth/users' && m === 'POST') {
      admin(); return ok(demoEngine.createUser(String(body['username']), String(body['password']), String(body['role'])), 201);
    }
    if (/^\/auth\/users\/\d+$/.test(path) && m === 'DELETE') { admin(); demoEngine.deleteUser(Number(id(/(\d+)$/)), p); return ok(null, 204); }

    if (path === '/documents' && m === 'GET') return ok(demoEngine.docs);
    if (path === '/documents' && m === 'POST') {
      admin();
      const f = req.body as FormData;
      const file = f.get('file') as File;
      const read = /\.(txt|md)$/i.test(file.name) ? from(file.text()) : of('');
      return read.pipe(mergeMap(text => {
        try { return ok(demoEngine.upload(file.name, file.size, String(f.get('title') ?? ''), String(f.get('version') ?? ''), text), 201); }
        catch (e) { return fail(e, req.url); }
      }));
    }
    if (/^\/documents\/\d+$/.test(path) && m === 'DELETE') { admin(); demoEngine.deleteDocument(Number(id(/(\d+)$/))); return ok(null, 204); }
    if (path === '/documents/compare') return ok(demoEngine.compare(p, body as never));

    if (path === '/chat/ask') return ok(demoEngine.ask(p, body as unknown as AskRequest));
    if (path === '/conversations' && m === 'GET') return ok(demoEngine.conversations(p));
    if (/^\/conversations\/[^/]+$/.test(path)) {
      const cid = id(/\/conversations\/([^/]+)$/);
      if (m === 'DELETE') { demoEngine.deleteConversation(p, cid); return ok(null, 204); }
      return ok(demoEngine.conversation(p, cid));
    }
    if (/^\/messages\/\d+\/feedback$/.test(path)) { demoEngine.feedback(p, Number(id(/(\d+)\/feedback$/)), Number(body['value'])); return ok(null, 204); }

    if (path === '/agent/run') return ok(demoEngine.agentRun(p, String(body['message']), String(body['thread_id'])));
    if (path === '/agent/resume') return ok(demoEngine.agentResume(String(body['thread_id']), body['approved'] === true));
    if (path === '/reports' && m === 'GET') return ok(demoEngine.listReports());
    if (/^\/reports\/.+/.test(path)) {
      const bytes = demoEngine.report(id(/\/reports\/(.+)$/));
      return ok(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
    }

    if (path === '/llm/models') return ok(demoEngine.models());
    if (path === '/llm/compare') {
      return ok(demoEngine.compareModels(p, String(body['question']), (body['models'] as string[]) ?? [], (body['document_ids'] as number[] | null) ?? null));
    }
    if (path === '/usage') return ok(demoEngine.usage(Number(/days=(\d+)/.exec(req.urlWithParams)?.[1] ?? 30)));

    throw new DemoError(404, `Route inconnue en mode démo : ${m} ${path}`);
  }, path === '/auth/login' ? 400 : 200);
};

/** Équivalent du flux SSE du backend : méta, sources, tokens mot à mot, puis fin. */
export async function demoStream(token: string | null, body: AskRequest, h: StreamHandlers): Promise<void> {
  await sleep(300);
  const p = demoEngine.principal(token);
  const r = demoEngine.prepare(p, body);
  const { conversationId, messageId, title } = demoEngine.commit(p, body, r);
  h.onMeta({ conversation_id: conversationId, title });
  h.onSources(r.sources);
  await sleep(250);
  for (const part of r.text.match(/\S+\s*|\n+/g) ?? []) {
    h.onToken(part);
    await sleep(18 + Math.random() * 28);
  }
  h.onDone({ message_id: messageId, cited: r.cited, usage: r.usage });
}