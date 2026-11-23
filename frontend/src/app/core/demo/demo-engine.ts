/**
 * Moteur du mode démo : simule l'API dans le navigateur (aucun serveur, aucun LLM).
 *
 * - Les réponses sont composées à partir des documents d'exemple par une recherche par mots-clés ;
 *   quelques questions typiques ont des réponses rédigées. Ce n'est PAS le vrai pipeline RAG.
 * - Logique pure (sans Angular) : testable seule. Les données vivent en mémoire et repartent de zéro
 *   à chaque rechargement de la page.
 */
import {
  AgentResponse, AgentStep, AskRequest, AskResponse, CompareResult, ConversationDetail, ConversationSummary,
  DocumentItem, ModelCompareResult, ReportFile, Source, StoredMessage, Usage, UsageRow, UsageSummary, UserInfo, UserRow,
} from '../models';
import { DEMO_ACCOUNTS } from '../demo-accounts';

export class DemoError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const DEMO_MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'];
const PRICES: Record<string, [number, number]> = {
  'openai/gpt-oss-20b': [0.075, 0.30], 'openai/gpt-oss-120b': [0.15, 0.60],
};
const NOT_FOUND = "Je n'ai pas trouvé cette information dans les documents importés.";

const TELETRAVAIL_2023 = `POLITIQUE DE TÉLÉTRAVAIL — Version 2023

Article 1 — Objet
La présente politique fixe les conditions dans lesquelles les salariés de l'entreprise peuvent exercer leur activité en télétravail.

Article 2 — Éligibilité
Le télétravail est ouvert aux salariés en CDI justifiant d'au moins 12 mois d'ancienneté. Les salariés en période d'essai ou en alternance ne sont pas éligibles.

Article 3 — Rythme
Le télétravail est limité à un jour par semaine, fixé d'un commun accord avec le manager. Les jours de présence obligatoires sont le mardi et le jeudi.

Article 4 — Équipement et indemnités
L'entreprise fournit un ordinateur portable. Une indemnité forfaitaire de 10 euros par mois est versée pour les frais de connexion.

Article 5 — Demande
Le salarié adresse sa demande à son manager, qui répond sous 15 jours ouvrés. Le manager peut refuser pour des raisons de service.`;

const TELETRAVAIL_2025 = `POLITIQUE DE TÉLÉTRAVAIL — Version 2025

Article 1 — Objet
La présente politique fixe les conditions dans lesquelles les salariés de l'entreprise peuvent exercer leur activité en télétravail.

Article 2 — Éligibilité
Le télétravail est ouvert aux salariés en CDI ou en CDD de plus de 6 mois, justifiant d'au moins 6 mois d'ancienneté. Les alternants sont éligibles un jour par semaine.

Article 3 — Rythme
Le télétravail peut aller jusqu'à trois jours par semaine, sous réserve de l'accord du manager et de la présence en équipe le mardi. Le passage à trois jours par semaine exige un entretien préalable et l'accord écrit du manager.

Article 4 — Équipement et indemnités
L'entreprise fournit un ordinateur portable et un écran. Une indemnité forfaitaire de 20 euros par mois est versée pour les frais de connexion et d'électricité.

Article 5 — Demande
Le salarié adresse sa demande à son manager via l'outil RH, qui répond sous 10 jours ouvrés. Tout refus doit être motivé par écrit.`;

export interface Passage {
  chunkId: number; documentId: number; title: string; version: string; page: number; heading: string; content: string;
}

// ---------------------------------------------------------------------------------------------
// Texte : normalisation, mots-clés, découpage
// ---------------------------------------------------------------------------------------------
const STOP = new Set(('le la les un une des du de d l et ou en au aux ce ces cette est sont a ont par pour sur dans avec sans que qui quoi '
  + 'quel quelle quels quelles quelle mon ma mes ton ta tes son sa ses nos notre vos votre leur leurs il elle ils elles je tu nous vous on '
  + 'ne pas plus se si y comment combien quand pourquoi faut peut puis donc car mais ou ni cela ceci dit sous entre vers chez fait faire '
  + 'etre avoir doit dois puis-je veux voudrais savoir dire donne donnez moi toi').split(/\s+/));

export function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Racines approximatives (5 premières lettres) : « indemnité », « indemnités » → « indem ». */
export function stems(s: string): string[] {
  return norm(s).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w)).map(w => (/^\d+$/.test(w) ? w : w.slice(0, 5)));
}

function splitPassages(docId: number, title: string, version: string, text: string, firstChunkId: number): Passage[] {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  const out: Passage[] = [];
  let id = firstChunkId;
  for (const b of blocks) {
    const lines = b.split('\n');
    const heading = lines.length > 1 && lines[0].length < 80 ? lines[0] : '';
    const body = heading ? lines.slice(1).join(' ') : b;
    if (!body.trim() || (lines.length === 1 && b.length < 80 && !/[.!?:;]$/.test(b))) continue; // titre seul
    for (let i = 0; i < body.length; i += 900) {
      out.push({ chunkId: id++, documentId: docId, title, version, page: 1, heading, content: body.slice(i, i + 900).trim() });
    }
  }
  return out;
}

function sentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]?/g) ?? [text]).map(s => s.trim()).filter(Boolean);
}

const art = (p: Passage) => /^Article (\d+)/.exec(p.heading)?.[1];

// ---------------------------------------------------------------------------------------------
// PDF minimal (démo : un « rapport » téléchargeable sans bibliothèque)
// ---------------------------------------------------------------------------------------------
const WIN: Record<string, number> = { '€': 0x80, '—': 0x97, '–': 0x96, '’': 0x92, '‘': 0x91, '“': 0x93, '”': 0x94, '…': 0x85, '•': 0x95 };

export function makePdf(title: string, body: string): Uint8Array {
  const clean = (s: string) => {
    let o = '';
    for (const ch of s) {
      const c = WIN[ch] ?? ch.charCodeAt(0);
      o += c > 255 ? '?' : String.fromCharCode(c);
    }
    return o.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  };
  const lines: string[] = [];
  const stripped = body.replace(/\*\*/g, '').replace(/^#+\s*/gm, '');
  for (const raw of (stripped.startsWith(title) ? stripped.slice(title.length) : stripped).split('\n')) {
    const line = raw.replace(/^\|?[\s|:-]+\|?$/, '').replace(/\s*\|\s*/g, '  |  ').replace(/^\s*\|\s*/, '').trimEnd();
    if (!line.trim()) { lines.push(''); continue; }
    let rest = line;
    while (rest.length > 92) {  // retour à la ligne sur un espace
      const cut = rest.lastIndexOf(' ', 92);
      const at = cut > 40 ? cut : 92;
      lines.push(rest.slice(0, at).trimEnd());
      rest = rest.slice(at).trimStart();
    }
    lines.push(rest);
  }
  const perPage = 46;
  const pages: string[][] = [];
  for (let i = 0; i < Math.max(lines.length, 1); i += perPage) pages.push(lines.slice(i, i + perPage));
  const objs: string[] = [];
  const kids: string[] = [];
  const fontId = 3;
  pages.forEach((pl, i) => {
    const pageId = 4 + i * 2, contentId = pageId + 1;
    kids.push(`${pageId} 0 R`);
    let s = 'BT /F1 11 Tf 14 TL 50 790 Td\n';
    if (i === 0) s += `/F1 16 Tf (${clean(title)}) Tj T* T* /F1 11 Tf\n`;
    for (const l of pl) s += `(${clean(l)}) Tj T*\n`;
    s += 'ET';
    objs[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objs[contentId] = `<< /Length ${s.length} >>\nstream\n${s}\nendstream`;
  });
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let i = 1; i < objs.length; i++) { offsets[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
  return bytes;
}

// ---------------------------------------------------------------------------------------------
// Moteur
// ---------------------------------------------------------------------------------------------
interface DemoUser { id: number; username: string; password: string; role: 'admin' | 'user'; created_at: string; }
interface UsageEntry { day: string; operation: string; model: string; calls: number; pt: number; ct: number; cost: number; latency: number; }
interface Conv { id: string; userId: number; title: string; updated_at: string; messages: StoredMessage[]; }
interface Curated { re: RegExp; refs: [string, number][]; text: string; points: string[]; }

const CURATED: Curated[] = [
  { re: /(trois|3) jours|3j\b|teletravail.*(plus|davantage|augment)/,
    refs: [['2025', 3], ['2025', 2], ['2023', 3]],
    text: "Pour télétravailler **trois jours par semaine**, la politique 2025 prévoit :\n\n- un entretien préalable et l'**accord écrit du manager** [1] ;\n- d'être en CDI, ou en CDD de plus de 6 mois, avec au moins 6 mois d'ancienneté [2] ;\n- d'être présent en équipe le mardi [1].\n\nÀ titre de comparaison, la version 2023 limitait le télétravail à **un jour par semaine** [3].",
    points: ['Accord écrit du manager et entretien préalable', 'CDI ou CDD > 6 mois, 6 mois d’ancienneté', 'Présence en équipe le mardi'] },
  { re: /indemnit|rembours|frais|electricite|ecran|equipement|materiel/,
    refs: [['2025', 4], ['2023', 4]],
    text: "Depuis la politique 2025, l'indemnité forfaitaire est de **20 € par mois** (connexion et électricité) et l'entreprise fournit un ordinateur portable **et un écran** [1]. Dans la version 2023, elle était de 10 € par mois, avec l'ordinateur portable seul [2].",
    points: ['Indemnité 2025 : 20 € par mois', 'Ordinateur portable et écran fournis', 'Version 2023 : 10 € par mois'] },
  { re: /eligib|anciennete|cdd|alternan|stagiaire|essai|qui peut|ouvert/,
    refs: [['2025', 2], ['2023', 2]],
    text: "Selon la politique 2025, le télétravail est ouvert aux salariés en **CDI ou en CDD de plus de 6 mois**, avec au moins **6 mois d'ancienneté**. Les alternants sont éligibles **un jour par semaine** [1]. En 2023, il fallait être en CDI avec 12 mois d'ancienneté, et les alternants étaient exclus [2].",
    points: ['CDI ou CDD de plus de 6 mois', '6 mois d’ancienneté minimum', 'Alternants : un jour par semaine'] },
  { re: /demande|delai|refus|repons|repond|motiv|outil rh|jours ouvres/,
    refs: [['2025', 5], ['2023', 5]],
    text: "La demande est adressée au manager **via l'outil RH**. Il répond sous **10 jours ouvrés** et tout refus doit être **motivé par écrit** [1]. Dans la version 2023, le délai était de 15 jours ouvrés et le refus possible « pour des raisons de service » [2].",
    points: ['Demande via l’outil RH', 'Réponse sous 10 jours ouvrés', 'Refus motivé par écrit'] },
  { re: /presence|mardi|jeudi|jours obligatoires/,
    refs: [['2025', 3], ['2023', 3]],
    text: "En 2025, la présence en équipe est requise le **mardi** [1]. Dans la version 2023, les jours de présence obligatoires étaient le **mardi et le jeudi** [2].",
    points: ['2025 : présence le mardi', '2023 : mardi et jeudi'] },
  { re: /differen|change|evolu|nouveaut|modifi|compar|ancienne version|nouvelle version/,
    refs: [['2025', 3], ['2025', 4], ['2025', 2], ['2023', 3]],
    text: "Principaux changements entre les versions 2023 et 2025 :\n\n- **Rythme** : jusqu'à trois jours par semaine au lieu d'un seul, avec entretien préalable et accord écrit du manager [1] ;\n- **Indemnité** : 20 € par mois au lieu de 10 €, et un écran fourni [2] ;\n- **Éligibilité** : CDD de plus de 6 mois acceptés, ancienneté ramenée à 6 mois, alternants éligibles [3] ;\n- **Présence** : mardi seulement, contre mardi et jeudi en 2023 [4].",
    points: ['Jusqu’à 3 jours par semaine (1 en 2023)', 'Indemnité doublée : 20 €', 'Éligibilité élargie'] },
];

export class DemoEngine {
  docs: DocumentItem[] = [];
  passages: Passage[] = [];
  private users: DemoUser[] = [];
  private convs: Conv[] = [];
  private usageLog: UsageEntry[] = [];
  private pendingAgent = new Map<string, string>();
  private reports = new Map<string, { bytes: Uint8Array; modified: number }>();
  private nextDoc = 1; private nextChunk = 1; private nextUser = 1; private nextMsg = 1; private nextConv = 1;
  private seed = 7;

  constructor(private now: () => Date = () => new Date()) {
    const created = new Date(this.now().getTime() - 6 * 86400_000).toISOString();
    this.addDoc('politique_teletravail_2023.txt', 'Politique de télétravail', '2023', TELETRAVAIL_2023, created);
    this.addDoc('politique_teletravail_2025.txt', 'Politique de télétravail', '2025', TELETRAVAIL_2025, created);
    this.users.push({ id: this.nextUser++, username: 'admin', password: 'DemoAdmin2025', role: 'admin', created_at: created });
    for (const a of DEMO_ACCOUNTS) {
      if (this.users.some(u => u.username === a.username)) continue;
      this.users.push({ id: this.nextUser++, username: a.username, password: a.password,
        role: a.username.includes('admin') ? 'admin' : 'user', created_at: created });
    }
    this.seedUsage();
  }

  // --- utilitaires ---------------------------------------------------------------------------
  private rnd(): number { this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff; return this.seed / 0x7fffffff; }
  private iso() { return this.now().toISOString(); }
  private day(offset = 0) { return new Date(this.now().getTime() - offset * 86400_000).toISOString().slice(0, 10); }

  private addDoc(filename: string, title: string, version: string, text: string, created = this.iso()): DocumentItem {
    const id = this.nextDoc++;
    const ps = splitPassages(id, title, version, text, this.nextChunk);
    this.nextChunk += ps.length;
    this.passages.push(...ps);
    const d: DocumentItem = { id, title, version, filename, page_count: 1, chunk_count: ps.length, created_at: created };
    this.docs.push(d);
    return d;
  }

  private seedUsage() {
    const ops: [string, number, number][] = [['ask', 900, 160], ['condense', 180, 30], ['compare', 1500, 420], ['agent', 2200, 380]];
    for (let off = 13; off >= 1; off--) {
      const n = 1 + Math.floor(this.rnd() * 5);
      for (let i = 0; i < n; i++) {
        const [op, p, c] = ops[Math.floor(this.rnd() * (this.rnd() < 0.7 ? 2 : 4))];
        const model = this.rnd() < 0.8 ? DEMO_MODELS[0] : DEMO_MODELS[1];
        const pt = Math.round(p * (0.7 + this.rnd() * 0.6)), ct = Math.round(c * (0.6 + this.rnd() * 0.8));
        this.usageLog.push({ day: this.day(off), operation: op, model, calls: 1, pt, ct,
          cost: this.cost(model, pt, ct), latency: Math.round(600 + this.rnd() * 1400) });
      }
    }
  }

  private cost(model: string, pt: number, ct: number) {
    const [pi, po] = PRICES[model] ?? [0, 0];
    return (pt * pi + ct * po) / 1_000_000;
  }

  private makeUsage(op: string, model: string, sources: Source[], answer: string, extra = 0): Usage {
    const pt = 320 + extra + Math.round(sources.reduce((n, s) => n + s.content.length, 0) / 3.8);
    const ct = Math.max(20, Math.round(answer.length / 3.8));
    const latency = Math.round((model.includes('120b') ? 1100 : 650) + this.rnd() * 500 + ct * 2);
    const cost = this.cost(model, pt, ct);
    this.usageLog.push({ day: this.day(), operation: op, model, calls: 1, pt, ct, cost, latency });
    return { model, prompt_tokens: pt, completion_tokens: ct, latency_ms: latency, cost_usd: cost };
  }

  // --- authentification et utilisateurs -------------------------------------------------------
  login(username: string, password: string): { access_token: string; token_type: string; user: UserInfo } {
    const u = this.users.find(x => x.username === username.trim().toLowerCase());
    if (!u || u.password !== password) throw new DemoError(401, 'Identifiants incorrects.');
    return { access_token: `demo.${u.id}`, token_type: 'bearer', user: { id: u.id, username: u.username, role: u.role } };
  }

  principal(token: string | null): UserInfo {
    const id = Number(/^demo\.(\d+)$/.exec(token ?? '')?.[1]);
    const u = this.users.find(x => x.id === id);
    if (!u) throw new DemoError(401, 'Session expirée.');
    return { id: u.id, username: u.username, role: u.role };
  }

  requireAdmin(p: UserInfo) { if (p.role !== 'admin') throw new DemoError(403, 'Réservé aux administrateurs.'); }

  listUsers(): UserRow[] { return this.users.map(({ id, username, role, created_at }) => ({ id, username, role, created_at })); }

  createUser(username: string, password: string, role: string): UserRow {
    username = username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,50}$/.test(username)) throw new DemoError(422, "Nom d'utilisateur : 3 à 50 caractères (lettres, chiffres, . _ -).");
    if (password.length < 8) throw new DemoError(422, 'Mot de passe : 8 caractères minimum.');
    if (role !== 'user' && role !== 'admin') throw new DemoError(422, 'Rôle invalide (admin, user).');
    if (this.users.some(u => u.username === username)) throw new DemoError(422, "Ce nom d'utilisateur existe déjà.");
    const u: DemoUser = { id: this.nextUser++, username, password, role, created_at: this.iso() };
    this.users.push(u);
    return { id: u.id, username, role, created_at: u.created_at };
  }

  deleteUser(id: number, acting: UserInfo): void {
    const t = this.users.find(u => u.id === id);
    if (!t) throw new DemoError(404, 'Utilisateur introuvable.');
    if (t.id === acting.id) throw new DemoError(422, 'Vous ne pouvez pas supprimer votre propre compte.');
    if (t.role === 'admin' && this.users.filter(u => u.role === 'admin').length <= 1) {
      throw new DemoError(422, 'Impossible de supprimer le dernier administrateur.');
    }
    this.users = this.users.filter(u => u.id !== id);
    this.convs = this.convs.filter(c => c.userId !== id);
  }

  // --- documents ------------------------------------------------------------------------------
  upload(filename: string, size: number, title: string, version: string, text: string): DocumentItem {
    if (!/\.(pdf|docx|txt|md)$/i.test(filename)) throw new DemoError(415, 'Format non pris en charge (PDF, DOCX, TXT, MD).');
    if (this.docs.some(d => d.filename === filename)) throw new DemoError(409, `Ce fichier est déjà importé (« ${filename} »).`);
    const t = (title || filename.replace(/\.[^.]+$/, '')).trim();
    if (/\.(txt|md)$/i.test(filename)) {
      if (!text.trim()) throw new DemoError(422, 'Aucun texte exploitable dans ce document.');
      return this.addDoc(filename, t, version || '1.0', text);
    }
    // PDF / DOCX : l'extraction n'est pas disponible dans la démo, le document est listé mais non interrogeable
    const id = this.nextDoc++;
    const d: DocumentItem = { id, title: t, version: version || '1.0', filename, page_count: Math.max(1, Math.round(size / 3000)),
      chunk_count: Math.max(1, Math.round(size / 900)), created_at: this.iso() };
    this.docs.push(d);
    return d;
  }

  deleteDocument(id: number): void {
    if (!this.docs.some(d => d.id === id)) throw new DemoError(404, 'Document introuvable.');
    this.docs = this.docs.filter(d => d.id !== id);
    this.passages = this.passages.filter(p => p.documentId !== id);
  }

  // --- recherche et réponses ------------------------------------------------------------------
  private toSource(p: Passage, score: number): Source {
    const label = p.heading ? `${p.heading}\n${p.content}` : p.content;
    return { document_id: p.documentId, title: p.title, version: p.version, page: p.page, content: label, score, chunk_id: p.chunkId };
  }

  private search(question: string, documentIds: number[] | null, k = 4): { p: Passage; score: number }[] {
    const q = new Set(stems(question));
    if (!q.size) return [];
    const pool = this.passages.filter(p => !documentIds?.length || documentIds.includes(p.documentId));
    const df = new Map<string, number>();
    const ps = pool.map(p => new Set(stems(`${p.heading} ${p.content} ${p.title}`)));
    ps.forEach(set => set.forEach(s => df.set(s, (df.get(s) ?? 0) + 1)));
    const scored = pool.map((p, i) => {
      let s = 0;
      for (const w of q) if (ps[i].has(w)) s += 1 + Math.log(1 + pool.length / (df.get(w) ?? 1));
      return { p, score: s };
    }).filter(x => x.score > 0);
    const top = scored.sort((a, b) => b.score - a.score).slice(0, k);
    if (!top.length) return [];
    // couverture : le meilleur passage doit contenir une part suffisante des mots de la question
    // (les mots absents du corpus pèsent lourd : « congés payés » ne doit pas répondre avec « jours »)
    const weight = (w: string) => Math.log(1 + pool.length / (df.get(w) ?? 0.5));
    const total = [...q].reduce((n, w) => n + weight(w), 0);
    const best = ps[pool.indexOf(top[0].p)];
    const got = [...q].filter(w => best.has(w)).reduce((n, w) => n + weight(w), 0);
    if (got / total < 0.3) return [];
    const max = top[0].score;
    return top.filter(x => x.score >= max * 0.35).map(x => ({ p: x.p, score: Math.round((x.score / max) * 100) / 100 }));
  }

  private find(version: string, article: number): Passage | undefined {
    return this.passages.find(p => p.version === version && /^Politique de télétravail$/.test(p.title) && art(p) === String(article));
  }

  private compose(question: string, documentIds: number[] | null): { sources: Source[]; text: string; cited: number[]; points: string[]; found: boolean } {
    const nq = norm(question);
    const covers = (v: string) => this.docs.some(d => d.version === v && d.title === 'Politique de télétravail'
      && (!documentIds?.length || documentIds.includes(d.id)));
    const both = covers('2023') && covers('2025');
    if (both) {
      const cur = CURATED.find(c => c.re.test(nq));
      if (cur) {
        const found = cur.refs.map(([v, a]) => this.find(v, a));
        if (found.every(Boolean)) {
          const sources = found.map((p, i) => this.toSource(p!, Math.round((1 - i * 0.12) * 100) / 100));
          return { sources, text: cur.text, cited: sources.map((_, i) => i + 1), points: cur.points, found: true };
        }
      }
    }
    const hits = this.search(question, documentIds);
    if (!hits.length) return { sources: [], text: NOT_FOUND, cited: [], points: [], found: false };
    const q = new Set(stems(question));
    const sources = hits.map(h => this.toSource(h.p, h.score));
    const bullets: string[] = [];
    const points: string[] = [];
    const cited: number[] = [];
    hits.slice(0, 3).forEach((h, i) => {
      const ss = sentences(h.p.content);
      const ranked = ss.map((s, j) => ({ s, j, n: stems(s).filter(w => q.has(w)).length })).sort((a, b) => b.n - a.n || a.j - b.j);
      const best = (ranked[0].n ? ranked[0] : { s: ss[0] }).s;
      const where = `**${h.p.title}** (v${h.p.version})${h.p.heading ? `, ${h.p.heading.split(' — ')[0]}` : ''}`;
      bullets.push(`- ${where} : ${best} [${i + 1}]`);
      points.push(best.length > 110 ? `${best.slice(0, 107)}…` : best);
      cited.push(i + 1);
    });
    return { sources, text: `D'après les documents importés :\n\n${bullets.join('\n')}`, cited, points, found: true };
  }

  // --- conversations --------------------------------------------------------------------------
  private conv(id: string | null, userId: number, title: string): Conv {
    let c = id ? this.convs.find(x => x.id === id && x.userId === userId) : undefined;
    if (!c) {
      c = { id: `demo-c${this.nextConv++}`, userId, title: title.length > 60 ? `${title.slice(0, 57)}…` : title, updated_at: this.iso(), messages: [] };
      this.convs.unshift(c);
    }
    return c;
  }

  /** Prépare une réponse (sans l'enregistrer) : utilisée par le mode complet et le streaming. */
  prepare(p: UserInfo, body: AskRequest) {
    const r = this.compose(body.question, body.document_ids);
    const usage = this.makeUsage('ask', DEMO_MODELS[0], r.sources, r.text);
    return { ...r, usage };
  }

  commit(p: UserInfo, body: AskRequest, r: ReturnType<DemoEngine['prepare']>): { conversationId: string; messageId: number; title: string } {
    const c = this.conv(body.conversation_id, p.id, body.question);
    c.messages.push({ id: this.nextMsg++, role: 'user', content: body.question, sources: [], cited: [], usage: null, feedback: null });
    const m: StoredMessage = { id: this.nextMsg++, role: 'assistant', content: r.text, sources: r.sources, cited: r.cited, usage: r.usage, feedback: null };
    c.messages.push(m);
    c.updated_at = this.iso();
    return { conversationId: c.id, messageId: m.id, title: c.title };
  }

  ask(p: UserInfo, body: AskRequest): AskResponse {
    const r = this.prepare(p, body);
    const { conversationId, messageId } = this.commit(p, body, r);
    return {
      conversation_id: conversationId, message_id: messageId, answer: r.text, sources: r.sources, cited: r.cited,
      key_points: body.structured ? r.points : [], confidence: body.structured && r.found ? (r.cited.length > 1 ? 'high' : 'medium') : null,
      found: r.found, standalone_question: null, usage: r.usage,
    };
  }

  conversations(p: UserInfo): ConversationSummary[] {
    return this.convs.filter(c => c.userId === p.id).map(c => ({ id: c.id, title: c.title, updated_at: c.updated_at }));
  }

  conversation(p: UserInfo, id: string): ConversationDetail {
    const c = this.convs.find(x => x.id === id && x.userId === p.id);
    if (!c) throw new DemoError(404, 'Conversation introuvable.');
    return { id: c.id, title: c.title, updated_at: c.updated_at, messages: c.messages };
  }

  deleteConversation(p: UserInfo, id: string): void {
    if (!this.convs.some(x => x.id === id && x.userId === p.id)) throw new DemoError(404, 'Conversation introuvable.');
    this.convs = this.convs.filter(c => c.id !== id);
  }

  feedback(p: UserInfo, messageId: number, value: number): void {
    for (const c of this.convs) {
      const m = c.messages.find(x => x.id === messageId);
      if (m && c.userId === p.id) { m.feedback = value || null; return; }
    }
    throw new DemoError(404, 'Message introuvable.');
  }

  // --- comparaison de documents ---------------------------------------------------------------
  compare(p: UserInfo, body: { topic: string; document_id_a?: number; document_id_b?: number; generate_pdf: boolean }): CompareResult {
    const a = this.docs.find(d => d.id === body.document_id_a), b = this.docs.find(d => d.id === body.document_id_b);
    if (!a || !b) throw new DemoError(404, 'Document introuvable.');
    if (a.id === b.id) throw new DemoError(422, 'Choisissez deux documents différents.');
    const markdown = this.compareMarkdown(a, b, body.topic);
    const sources = this.passages.filter(x => x.documentId === a.id || x.documentId === b.id).slice(0, 6).map(x => this.toSource(x, 1));
    const usage = this.makeUsage('compare', DEMO_MODELS[0], sources, markdown, 300);
    let report: string | null = null;
    if (body.generate_pdf) report = this.saveReport(`comparaison_${a.version}_${b.version}.pdf`, `Comparaison : ${body.topic}`, markdown);
    return { markdown, doc_a: a, doc_b: b, usage, report };
  }

  private compareMarkdown(a: DocumentItem, b: DocumentItem, topic: string): string {
    const tt = (d: DocumentItem) => d.title === 'Politique de télétravail' && (d.version === '2023' || d.version === '2025');
    if (tt(a) && tt(b) && a.version !== b.version) {
      const rows: Record<string, Record<string, string>> = {
        'Éligibilité': { '2023': "CDI, 12 mois d'ancienneté ; alternants exclus", '2025': "CDI ou CDD > 6 mois, 6 mois d'ancienneté ; alternants 1 jour/semaine" },
        'Rythme': { '2023': '1 jour par semaine ; présence mardi et jeudi', '2025': "Jusqu'à 3 jours par semaine ; présence le mardi ; entretien et accord écrit" },
        'Indemnité': { '2023': '10 € par mois', '2025': '20 € par mois' },
        'Équipement': { '2023': 'Ordinateur portable', '2025': 'Ordinateur portable et écran' },
        'Demande': { '2023': 'Réponse sous 15 jours ouvrés', '2025': 'Via l\'outil RH, 10 jours ouvrés, refus motivé par écrit' },
      };
      const lines = Object.entries(rows).map(([k, v]) => `| ${k} | ${v[a.version]} | ${v[b.version]} |`);
      return `## Comparaison : ${topic || 'politique de télétravail'}\n\n| Critère | v${a.version} | v${b.version} |\n|---|---|---|\n${lines.join('\n')}\n\n`
        + `**En résumé** : la version ${b.version > a.version ? b.version : a.version} assouplit nettement le dispositif (jusqu'à trois jours par semaine, `
        + `éligibilité élargie, indemnité doublée) tout en ajoutant un entretien préalable et l'accord écrit du manager pour dépasser un jour.\n\n`
        + `*Comparaison simulée (mode démo).*`;
    }
    const byHeading = (d: DocumentItem) => new Map(this.passages.filter(x => x.documentId === d.id).map((x, i) => [x.heading || `Passage ${i + 1}`, x.content]));
    const ma = byHeading(a), mb = byHeading(b);
    const keys = [...new Set([...ma.keys(), ...mb.keys()])].slice(0, 8);
    const cut = (s?: string) => (s ? (s.length > 120 ? `${s.slice(0, 117)}…` : s) : '—').replace(/\|/g, '/');
    const rows = keys.filter(k => ma.get(k) !== mb.get(k)).map(k => `| ${k} | ${cut(ma.get(k))} | ${cut(mb.get(k))} |`);
    return `## Comparaison : ${topic}\n\n${rows.length
      ? `| Section | v${a.version} | v${b.version} |\n|---|---|---|\n${rows.join('\n')}`
      : 'Aucune différence notable entre les deux documents.'}\n\n*Comparaison simulée (mode démo) : sections comparées terme à terme, sans analyse par un modèle.*`;
  }

  // --- agent ----------------------------------------------------------------------------------
  private saveReport(name: string, title: string, markdown: string): string {
    this.reports.set(name, { bytes: makePdf(title, markdown), modified: Math.floor(this.now().getTime() / 1000) });
    return name;
  }

  listReports(): ReportFile[] {
    return [...this.reports].map(([name, r]) => ({ name, size: r.bytes.length, modified: r.modified }));
  }

  report(name: string): Uint8Array {
    const r = this.reports.get(name);
    if (!r) throw new DemoError(404, 'Rapport introuvable.');
    return r.bytes;
  }

  private tele(): { a?: DocumentItem; b?: DocumentItem } {
    const v = this.docs.filter(d => d.title === 'Politique de télétravail').sort((x, y) => x.version.localeCompare(y.version));
    return { a: v.length > 1 ? v[v.length - 2] : undefined, b: v[v.length - 1] };
  }

  agentRun(p: UserInfo, message: string, threadId: string): AgentResponse {
    const q = norm(message);
    const steps: AgentStep[] = [];
    const list = this.docs.map(d => `#${d.id} ${d.title} v${d.version} (${d.page_count} p.)`).join('\n');

    if (/compar|difference|evolu|change/.test(q) && this.docs.length >= 2) {
      const { a, b } = this.tele();
      if (a && b && a.id !== b.id) {
        steps.push({ tool: 'find_document_versions', args: { title: a.title }, result: `v${a.version} (#${a.id}), v${b.version} (#${b.id})` });
        const md = this.compareMarkdown(a, b, 'conditions de télétravail');
        steps.push({ tool: 'compare_documents', args: { document_id_a: a.id, document_id_b: b.id, topic: 'conditions de télétravail' },
          result: `Comparaison de v${a.version} et v${b.version} terminée.` });
        this.usageAgent(md);
        if (/rapport|pdf/.test(q)) {
          this.pendingAgent.set(threadId, md);
          return { status: 'needs_approval', steps, pending: { action: 'generate_pdf_report', title: `Comparaison des politiques de télétravail ${a.version} / ${b.version}`, preview: md } };
        }
        return { status: 'done', steps, answer: `${md}\n\nSouhaitez-vous que je génère un rapport PDF ?` };
      }
    }
    if (/liste|disponible|quels documents|documents/.test(q) && !/compar/.test(q)) {
      steps.push({ tool: 'list_documents', args: {}, result: list });
      this.usageAgent(list);
      return { status: 'done', steps, answer: `Documents disponibles :\n\n${this.docs.map(d => `- **${d.title}** v${d.version} (#${d.id}, ${d.page_count} page${d.page_count > 1 ? 's' : ''})`).join('\n')}` };
    }
    if (/date|aujourd|quel jour/.test(q)) {
      const d = this.now().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      steps.push({ tool: 'current_date', args: {}, result: d });
      this.usageAgent(d);
      return { status: 'done', steps, answer: `Nous sommes le **${d}**.` };
    }
    const calc = this.calculation(message);
    if (calc) {
      steps.push({ tool: 'calculate', args: { expression: calc.expr }, result: String(calc.value) });
      const ans = `${calc.expr.replace(/\*/g, ' × ').replace(/\//g, ' ÷ ')} = **${calc.value.toLocaleString('fr-FR')}**.`;
      this.usageAgent(ans);
      return { status: 'done', steps, answer: ans };
    }
    const r = this.compose(message, null);
    steps.push({ tool: 'search_documents', args: { query: message }, result: r.found ? `${r.sources.length} passage(s) trouvé(s)` : 'Aucun passage pertinent' });
    this.usageAgent(r.text);
    return { status: 'done', steps, answer: r.text };
  }

  private usageAgent(text: string) { this.makeUsage('agent', DEMO_MODELS[0], [], text, 900); }

  agentResume(threadId: string, approved: boolean): AgentResponse {
    const md = this.pendingAgent.get(threadId);
    if (md === undefined) throw new DemoError(409, 'Aucune action en attente de validation.');
    this.pendingAgent.delete(threadId);
    if (!approved) {
      return { status: 'done', steps: [{ tool: 'generate_pdf_report', args: {}, result: 'Refusé par l\'utilisateur.' }],
        answer: "D'accord, je ne génère pas le rapport. La comparaison reste disponible ci-dessus." };
    }
    const name = this.saveReport('rapport_comparaison_teletravail.pdf', 'Comparaison des politiques de télétravail', md);
    return { status: 'done', steps: [{ tool: 'generate_pdf_report', args: { title: 'Comparaison des politiques de télétravail' }, result: `Rapport créé : ${name}` }],
      answer: `Le rapport PDF est prêt : **${name}**.`, reports: [name] };
  }

  /** Évaluateur arithmétique sûr (chiffres et + - * / ( ) uniquement), jamais d'eval. */
  private calculation(message: string): { expr: string; value: number } | null {
    const m = message.replace(/(\d)\s*[x×]\s*(\d)/gi, '$1*$2').replace(/(\d),(\d)/g, '$1.$2').replace(/÷/g, '/');
    const runs = (m.match(/[\d.()+\-*/\s]{3,}/g) ?? []).map(r => r.trim()).filter(r => /\d/.test(r) && /[+\-*/]/.test(r.replace(/^-/, '')));
    let expr = runs.sort((a, b) => b.length - a.length)[0]?.replace(/\s+/g, '');
    if (!expr) {
      const nums = norm(message).match(/\d+(?:[.,]\d+)?/g);
      if (nums && nums.length >= 2 && /par .* sur|fois|multipli|combien/.test(norm(message))) expr = nums.slice(0, 2).join('*');
    }
    if (!expr || !/^[\d.+\-*/()]+$/.test(expr)) return null;
    const value = this.evalArithmetic(expr);
    return value === null ? null : { expr, value: Math.round(value * 1e6) / 1e6 };
  }

  private evalArithmetic(src: string): number | null {
    let i = 0;
    const peek = () => src[i];
    const num = (): number => {
      if (peek() === '(') { i++; const v = add(); if (peek() !== ')') throw new Error('x'); i++; return v; }
      if (peek() === '-') { i++; return -num(); }
      const s = i;
      while (i < src.length && /[\d.]/.test(src[i])) i++;
      if (s === i) throw new Error('x');
      return parseFloat(src.slice(s, i));
    };
    const mul = (): number => {
      let v = num();
      while (peek() === '*' || peek() === '/') { const o = src[i++]; const r = num(); v = o === '*' ? v * r : v / r; }
      return v;
    };
    const add = (): number => {
      let v = mul();
      while (peek() === '+' || peek() === '-') { const o = src[i++]; const r = mul(); v = o === '+' ? v + r : v - r; }
      return v;
    };
    try { const v = add(); return i === src.length && Number.isFinite(v) ? v : null; } catch { return null; }
  }

  // --- modèles et usage -----------------------------------------------------------------------
  models() { return { default: DEMO_MODELS[0], available: DEMO_MODELS }; }

  compareModels(p: UserInfo, question: string, models: string[], documentIds: number[] | null): ModelCompareResult {
    if (!question.trim()) throw new DemoError(422, 'Question vide.');
    const r = this.compose(question, documentIds);
    const runs = (models.length ? models : DEMO_MODELS).map(model => {
      const big = model.includes('120b');
      const text = big && r.found ? `${r.text}\n\n*Réponse du plus grand modèle : formulation plus détaillée et nuancée dans le vrai backend.*` : r.text;
      return { model, text, error: null, usage: this.makeUsage('compare_models', model, r.sources, text) };
    });
    return { question, sources: r.sources, runs };
  }

  usage(days: number): UsageSummary {
    const since = this.day(days - 1);
    const rows = this.usageLog.filter(e => e.day >= since);
    const agg = (items: UsageEntry[]): UsageRow => {
      const calls = items.reduce((n, e) => n + e.calls, 0);
      return {
        calls, prompt_tokens: items.reduce((n, e) => n + e.pt, 0), completion_tokens: items.reduce((n, e) => n + e.ct, 0),
        cost_usd: items.reduce((n, e) => n + e.cost, 0),
        avg_latency_ms: calls ? items.reduce((n, e) => n + e.latency * e.calls, 0) / calls : 0,
      };
    };
    const group = (key: 'model' | 'operation' | 'day') => {
      const m = new Map<string, UsageEntry[]>();
      for (const e of rows) m.set(e[key], [...(m.get(e[key]) ?? []), e]);
      return [...m].map(([k, v]) => ({ ...agg(v), [key]: k }) as UsageRow);
    };
    return {
      days, total: agg(rows), by_model: group('model').sort((a, b) => b.cost_usd - a.cost_usd),
      by_operation: group('operation').sort((a, b) => b.calls - a.calls),
      by_day: group('day').sort((a, b) => (a.day ?? '').localeCompare(b.day ?? '')),
    };
  }
}