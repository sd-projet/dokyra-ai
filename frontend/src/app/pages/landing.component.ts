import { Component, OnDestroy, OnInit, WritableSignal, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { SiteHeaderComponent } from './site-header.component';

// Texte de la démonstration du hero (exemple illustratif, calqué sur le document d'exemple fourni).
const QUESTION = 'Quelles sont les conditions pour obtenir trois jours de télétravail par semaine ?';
const INTRO = 'Trois jours de télétravail par semaine sont possibles si :';
const LINE_1 = 'vous avez au moins 6 mois d\'ancienneté';
const LINE_2 = 'votre manager donne son accord écrit, après un entretien préalable';
const LINE_3 = 'vous êtes présent en équipe le mardi';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, SiteHeaderComponent],
  template: `
    <app-site-header />

    <main>
      <section class="hero w">
        <div class="hero-top">
          <h1>Vos documents répondent à vos questions.</h1>
          <div class="hero-side">
            <p class="lead">Importez le règlement intérieur, les procédures, les contrats et les guides. Dokyra AI répond avec le passage exact et la page d'où il vient.</p>
            <div class="row">
              <a class="btn primary big" [routerLink]="auth.user() ? '/chat' : '/login'">{{ auth.user() ? 'Ouvrir l\\'application' : 'Se connecter' }}</a>
              <a class="btn big" href="#fonctionnement" (click)="go('fonctionnement', $event)">Voir comment ça marche</a>
            </div>
            <p class="small muted">Formats acceptés : PDF, Word et texte.</p>
          </div>
        </div>

        <div class="desk" role="img"
             aria-label="Démonstration : la question sur le télétravail obtient une réponse en trois points, chacun relié à un passage surligné du document, avec sa page.">
          <div class="chat">
            <div class="pane-head"><strong>Assistant</strong><span class="tag">Exemple illustratif</span></div>
            <div class="chat-body">
              <p class="bubble" [class.cursor]="phase() === 0">{{ q() }}</p>
              <p class="status" [class.show]="phase() === 1"><span class="spinner"></span> Recherche dans vos documents…</p>
              <div class="answer" [class.show]="phase() >= 2">
                <p>{{ intro() }}</p>
                <ul>
                  <li [class.pending]="!t1()">{{ t1() }}<sup class="cite" [class.show]="c1()">1</sup></li>
                  <li [class.pending]="!t2()">{{ t2() }}<sup class="cite" [class.show]="c2()">2</sup></li>
                  <li [class.pending]="!t3()">{{ t3() }}<sup class="cite" [class.show]="c3()">2</sup></li>
                </ul>
              </div>
              <div class="sources" [class.show]="phase() === 3">
                <span class="chip"><b>1</b> Article 2, éligibilité (p. 1)</span>
                <span class="chip"><b>2</b> Article 3, rythme (p. 1)</span>
              </div>
            </div>
          </div>

          <div class="paper">
            <div class="pane-head paper-head"><strong>Politique de télétravail, version 2025</strong><span>page 1</span></div>
            <h3>Article 2 : éligibilité</h3>
            <p>Le télétravail est ouvert aux salariés en CDI ou en CDD de plus de 6 mois, <mark [class.on]="h1()">justifiant d'au moins 6 mois d'ancienneté</mark>. Les alternants sont éligibles un jour par semaine.</p>
            <h3>Article 3 : rythme</h3>
            <p>Le télétravail peut aller jusqu'à trois jours par semaine, sous réserve de l'accord du manager et de <mark [class.on]="h3()">la présence en équipe le mardi</mark>. Le passage à trois jours par semaine exige <mark [class.on]="h2()">un entretien préalable et l'accord écrit du manager</mark>.</p>
            <h3>Article 4 : équipement et indemnités</h3>
            <p class="faded">L'entreprise fournit un ordinateur portable et verse une indemnité forfaitaire mensuelle pour les jours télétravaillés.</p>
          </div>
        </div>
      </section>

      <section class="block w" id="fonctionnement">
        <h2>De la question à la réponse sourcée</h2>
        <p class="sub">Ce qui se passe quand un employé pose une question.</p>
        <ol class="steps">
          <li><span class="n">1</span><h3>Analyse la question</h3><p>L'assistant la reformule à partir de la conversation et repère les demandes de comparaison.</p></li>
          <li><span class="n">2</span><h3>Cherche dans vos documents</h3><p>Recherche par le sens et par mots-clés, puis classement des passages les plus pertinents.</p></li>
          <li><span class="n">3</span><h3>Prépare le contexte</h3><p>Seuls les passages retenus sont transmis au modèle, dans la limite de son budget de tokens.</p></li>
          <li><span class="n">4</span><h3>Rédige la réponse</h3><p>Une réponse structurée, affichée en direct, avec des renvois [1], [2] vers les extraits.</p></li>
          <li><span class="n">5</span><h3>Montre ses sources</h3><p>Document, version et page de chaque passage utilisé, pour vérifier la réponse.</p></li>
        </ol>
      </section>

      <section class="block w agent" id="agent">
        <div>
          <h2>Un agent qui compare, calcule et rédige le rapport</h2>
          <p class="sub">« Compare les conditions de télétravail de nos deux dernières politiques et génère un rapport. » L'agent identifie les deux versions, cherche les passages, les compare, puis vous demande l'autorisation avant de produire le PDF.</p>
          <ul class="tools">
            <li>Recherche dans l'ensemble des documents ou dans un seul</li>
            <li>Comparaison de deux documents ou de deux versions</li>
            <li>Calculs fiables, sans approximation du modèle</li>
            <li>Rapport PDF créé après votre validation</li>
          </ul>
        </div>
        <div class="agent-card" role="group" aria-label="Exemple d'exécution de l'agent">
          <div class="pane-head"><strong>Agent</strong><span class="tag">Exemple illustratif</span></div>
          <div class="agent-body">
            <ul class="trace">
              <li><span class="done-mark">✓</span><div>Identifie les documents<small>Politique de télétravail, versions 2023 et 2025</small></div></li>
              <li><span class="done-mark">✓</span><div>Cherche les passages<small>6 passages retrouvés</small></div></li>
              <li><span class="done-mark">✓</span><div>Compare les deux versions<small>Éligibilité, rythme, indemnités</small></div></li>
            </ul>
            <div class="approval" [class.decided]="decision() !== 'pending'">
              <p><strong>Autoriser la création du rapport PDF ?</strong></p>
              <p class="small muted">Comparaison des politiques de télétravail 2023 et 2025</p>
              <div class="row actions">
                <button class="primary" (click)="decide('yes')">Autoriser</button>
                <button (click)="decide('no')">Refuser</button>
              </div>
              <p class="result yes" [class.show]="decision() === 'yes'">Rapport créé : comparaison-teletravail.pdf</p>
              <p class="result no" [class.show]="decision() === 'no'">Création annulée. L'agent n'a rien produit.</p>
              <button class="ghost small again" [class.show]="decision() !== 'pending'" (click)="decide('pending')">Recommencer l'exemple</button>
            </div>
          </div>
        </div>
      </section>

      <section class="block w" id="confiance">
        <h2>Vous gardez la main</h2>
        <dl class="rows">
          <div><dt>Réponses vérifiables</dt><dd>Chaque réponse renvoie aux extraits utilisés. Si l'information n'est pas dans vos documents, l'assistant le dit au lieu d'inventer.</dd></div>
          <div><dt>Données maîtrisées</dt><dd>L'indexation de vos documents et le classement des résultats tournent sur votre serveur. Seuls les extraits retenus pour une question sont envoyés au modèle de langage.</dd></div>
          <div><dt>Accès par rôle</dt><dd>Les administrateurs importent et suppriment les documents. Les employés posent leurs questions et retrouvent leurs conversations.</dd></div>
          <div><dt>Coûts visibles</dt><dd>Les tokens, la durée et le coût estimé de chaque appel sont enregistrés et affichés par modèle.</dd></div>
          <div><dt>Modèle au choix</dt><dd>Compatible avec OpenAI, Groq ou tout fournisseur qui suit le même protocole. Comparez qualité, rapidité et prix de plusieurs modèles sur vos propres documents.</dd></div>
        </dl>
      </section>

      <section class="w">
        <div class="cta">
          <h2>Posez votre première question.</h2>
          <a class="btn inverse big" [routerLink]="auth.user() ? '/chat' : '/login'">{{ auth.user() ? 'Ouvrir l\\'application' : 'Se connecter' }}</a>
        </div>
      </section>
    </main>

    <footer class="foot w">
      <span><strong>Dokyra AI</strong> : assistant de gestion documentaire</span>
      <a routerLink="/login">Connexion</a>
    </footer>
  `,
  styles: [`
    :host {
      display: block; color: var(--text);
      --paper: #fbfaf6; --paper-ink: #1d2330; --mark: #ffe08a;
      --serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif;
    }
    .w { max-width: 1120px; margin: 0 auto; padding-left: 1.25rem; padding-right: 1.25rem; }
    a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 6px; }
    h1, h2, h3 { font-family: var(--serif); font-weight: 600; letter-spacing: -.01em; }

    .btn { display: inline-flex; align-items: center; justify-content: center; padding: .5rem 1rem; border-radius: 8px;
      border: 1px solid var(--border); background: var(--surface); color: var(--text); text-decoration: none; font-weight: 500; }
    .btn:hover { background: var(--surface-2); }
    .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); font-weight: 600; }
    .btn.primary:hover { background: var(--accent); filter: brightness(1.08); }
    .btn.big { padding: .75rem 1.3rem; font-size: 1rem; }
    .btn.inverse { background: var(--accent-text); border-color: var(--accent-text); color: var(--accent); font-weight: 600; }
    .btn.inverse:hover { background: var(--accent-text); filter: brightness(.95); }

    /* Hero */
    .hero { padding-top: 4rem; padding-bottom: 3rem; }
    .hero-top { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: 2.5rem; align-items: end; margin-bottom: 2.5rem; }
    h1 { font-size: clamp(2.4rem, 5.2vw, 4.1rem); line-height: 1.04; margin: 0; max-width: 14ch; }
    .hero-side { display: flex; flex-direction: column; gap: 1rem; }
    .lead { font-size: 1.15rem; line-height: 1.55; margin: 0; max-width: 46ch; }
    .hero-side .small { margin: 0; }

    /* Démonstration : conversation + page de document */
    .desk { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1.25rem; padding: 1.25rem;
      background: var(--surface-2); border: 1px solid var(--border); border-radius: 16px; }
    .pane-head { display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding-bottom: .75rem;
      margin-bottom: .9rem; border-bottom: 1px solid var(--border); font-size: .9rem; }
    .chat { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1rem 1.1rem; }
    .chat-body { min-height: 21rem; display: flex; flex-direction: column; gap: .9rem; }
    .bubble { align-self: flex-end; max-width: 92%; margin: 0; padding: .6rem .85rem; min-height: 2.4rem;
      background: var(--accent-soft); border-radius: 12px 12px 2px 12px; }
    .status { margin: 0; color: var(--muted); font-size: .9rem; opacity: 0; height: 0; overflow: hidden; }
    .status.show { opacity: 1; height: auto; }
    .answer { opacity: 0; }
    .answer.show { opacity: 1; }
    .answer p { margin: 0 0 .4rem; }
    .answer ul { margin: 0; padding-left: 1.2rem; display: flex; flex-direction: column; gap: .35rem; }
    .answer li.pending { display: none; }
    .cite { color: var(--accent); font-weight: 700; margin-left: .15rem; opacity: 0; transition: opacity .3s; }
    .cite.show { opacity: 1; }
    .sources { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: auto; opacity: 0; transition: opacity .4s; }
    .sources.show { opacity: 1; }
    .chip b { color: var(--accent); }

    .paper { position: relative; background: var(--paper); color: var(--paper-ink); border-radius: 4px; padding: 1rem 1.5rem 1.5rem;
      font-family: var(--serif); box-shadow: 0 8px 24px rgba(16, 24, 40, .18), 0 1px 2px rgba(16, 24, 40, .12); }
    .paper::after { content: ""; position: absolute; top: 0; right: 0; width: 28px; height: 28px;
      background: linear-gradient(225deg, var(--surface-2) 50%, #e4e1d7 50%); box-shadow: -2px 2px 3px rgba(16, 24, 40, .12); }
    .paper-head { border-bottom-color: #e4e1d7; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding-right: 1.5rem; }
    .paper-head span { color: #66707d; white-space: nowrap; }
    .paper h3 { font-size: 1.02rem; margin: 1rem 0 .3rem; }
    .paper p { margin: 0; line-height: 1.65; font-size: .98rem; }
    .paper .faded { color: #8a909b; }
    mark { color: inherit; padding: .05em 0; background: linear-gradient(var(--mark), var(--mark)) no-repeat 0 90% / 0% 100%;
      transition: background-size .7s ease; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
    mark.on { background-size: 100% 100%; }

    /* Sections */
    .block { padding-top: 4.5rem; scroll-margin-top: 4.5rem; }
    .block h2 { font-size: clamp(1.6rem, 3vw, 2.2rem); line-height: 1.15; margin: 0 0 .6rem; max-width: 24ch; }
    .sub { color: var(--muted); font-size: 1.05rem; max-width: 60ch; margin: 0 0 2rem; }

    .steps { list-style: none; margin: 2.5rem 0 0; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 1.5rem; }
    .steps li { position: relative; border-top: 2px solid var(--border); padding-top: 1.3rem; }
    .steps .n { position: absolute; top: -14px; left: 0; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
      background: var(--accent); color: var(--accent-text); font-size: .8rem; font-weight: 700; }
    .steps h3 { font-size: 1.05rem; margin: 0 0 .35rem; }
    .steps p { margin: 0; color: var(--muted); font-size: .92rem; }

    .agent { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 3rem; align-items: start; }
    .agent .sub { margin-bottom: 1.2rem; }
    .tools { margin: 0; padding-left: 1.2rem; display: flex; flex-direction: column; gap: .4rem; }
    .agent-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1rem 1.1rem; box-shadow: var(--shadow); }
    .trace { list-style: none; margin: 0 0 1rem; padding: 0; display: flex; flex-direction: column; gap: .7rem; }
    .trace li { display: flex; gap: .65rem; align-items: flex-start; }
    .trace small { display: block; color: var(--muted); }
    .done-mark { flex: none; width: 1.3rem; height: 1.3rem; border-radius: 50%; display: grid; place-items: center;
      background: var(--ok-soft); color: var(--ok); font-size: .75rem; font-weight: 700; }
    .approval { border: 1px solid var(--warn); background: var(--warn-soft); border-radius: 10px; padding: .85rem 1rem; }
    .approval p { margin: 0 0 .25rem; }
    .actions { margin-top: .7rem; }
    .approval.decided { border-color: var(--border); background: var(--surface-2); }
    .approval.decided .actions { display: none; }
    .result { display: none; margin: .7rem 0 0 !important; font-weight: 600; }
    .result.show { display: block; }
    .result.yes { color: var(--ok); } .result.no { color: var(--muted); }
    .again { display: none; margin-top: .5rem; }
    .again.show { display: inline-block; }

    .rows { margin: 2rem 0 0; }
    .rows > div { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: 2rem; padding: 1.3rem 0; border-top: 1px solid var(--border); }
    .rows > div:last-child { border-bottom: 1px solid var(--border); }
    .rows dt { font-family: var(--serif); font-size: 1.2rem; font-weight: 600; }
    .rows dd { margin: 0; max-width: 62ch; }

    .cta { margin-top: 5rem; display: flex; align-items: center; justify-content: space-between; gap: 1.5rem; flex-wrap: wrap;
      background: var(--accent); color: var(--accent-text); border-radius: 16px; padding: 2.75rem 2.5rem; }
    .cta h2 { margin: 0; font-size: clamp(1.5rem, 3vw, 2.1rem); }
    .foot { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; padding-top: 2.5rem; padding-bottom: 2.5rem; color: var(--muted); font-size: .9rem; }

    @media (max-width: 960px) {
      .hero-top, .agent { grid-template-columns: minmax(0, 1fr); }
      .hero-top { gap: 1.5rem; }
      .agent { gap: 2rem; }
      .steps { grid-template-columns: minmax(0, 1fr); gap: 1.5rem; }
      .steps li { border-top: 0; border-left: 2px solid var(--border); padding: 0 0 0 1.4rem; }
      .steps .n { top: 0; left: -14px; }
    }
    @media (max-width: 760px) {
      .hero { padding-top: 2.5rem; }
      .desk { grid-template-columns: minmax(0, 1fr); padding: .75rem; }
      .chat-body { min-height: 19rem; }
      .rows > div { grid-template-columns: minmax(0, 1fr); gap: .4rem; }
      .cta { padding: 2rem 1.5rem; }
    }
    @media (prefers-reduced-motion: reduce) { mark, .cite, .sources { transition: none; } }
  `],
})
export class LandingComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);

  // État de la démonstration (voir play())
  phase = signal(0);                       // 0 saisie · 1 recherche · 2 rédaction · 3 sources affichées
  q = signal(''); intro = signal(''); t1 = signal(''); t2 = signal(''); t3 = signal('');
  c1 = signal(false); c2 = signal(false); c3 = signal(false);
  h1 = signal(false); h2 = signal(false); h3 = signal(false);

  // Exemple interactif de validation humaine
  decision = signal<'pending' | 'yes' | 'no'>('pending');

  private alive = true;
  private reduced = this.prefersReducedMotion();
  private timers = new Set<ReturnType<typeof setTimeout>>();

  ngOnInit(): void {
    if (this.reduced) { this.showFinalState(); return; }
    void this.play();
  }

  ngOnDestroy(): void {
    this.alive = false;
    this.timers.forEach(clearTimeout);
  }

  decide(value: 'pending' | 'yes' | 'no'): void { this.decision.set(value); }

  go(id: string, event: Event): void {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: this.reduced ? 'auto' : 'smooth', block: 'start' });
  }

  /** Rejoue la démonstration en boucle : question tapée, recherche, réponse, puis surlignage des passages cités. */
  private async play(): Promise<void> {
    while (this.alive) {
      this.reset();
      await this.sleep(700);
      await this.type(this.q, QUESTION, 22);
      this.phase.set(1);
      await this.sleep(1100);
      this.phase.set(2);
      await this.type(this.intro, INTRO, 14);
      await this.type(this.t1, LINE_1, 14); this.c1.set(true); this.h1.set(true);
      await this.sleep(450);
      await this.type(this.t2, LINE_2, 14); this.c2.set(true); this.h2.set(true);
      await this.sleep(450);
      await this.type(this.t3, LINE_3, 14); this.c3.set(true); this.h3.set(true);
      await this.sleep(500);
      this.phase.set(3);
      await this.sleep(7000);
    }
  }

  private reset(): void {
    this.phase.set(0);
    for (const s of [this.q, this.intro, this.t1, this.t2, this.t3]) s.set('');
    for (const s of [this.c1, this.c2, this.c3, this.h1, this.h2, this.h3]) s.set(false);
  }

  private showFinalState(): void {
    this.q.set(QUESTION); this.intro.set(INTRO); this.t1.set(LINE_1); this.t2.set(LINE_2); this.t3.set(LINE_3);
    for (const s of [this.c1, this.c2, this.c3, this.h1, this.h2, this.h3]) s.set(true);
    this.phase.set(3);
  }

  private async type(target: WritableSignal<string>, text: string, msPerChar: number): Promise<void> {
    for (let i = 1; i <= text.length && this.alive; i++) {
      target.set(text.slice(0, i));
      await this.sleep(msPerChar);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>(resolve => {
      const id = setTimeout(() => { this.timers.delete(id); resolve(); }, ms);
      this.timers.add(id);
    });
  }

  private prefersReducedMotion(): boolean {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  }
}