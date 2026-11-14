import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/errors';
import { MarkdownPipe } from '../core/markdown.pipe';
import { CompareResult, DocumentItem } from '../core/models';

@Component({
  selector: 'app-documents',
  standalone: true,
  imports: [FormsModule, DatePipe, MarkdownPipe],
  template: `
    <div class="page stack">
      <header><h1>Documents</h1><p class="muted">PDF, Word (.docx), texte (.txt, .md) — le texte est extrait, découpé, vectorisé puis indexé.</p></header>

      @if (auth.isAdmin()) {
        <section class="card stack" (dragover)="$event.preventDefault()" (drop)="onDrop($event)">
          <h2>Importer un document</h2>
          <div class="row">
            <input type="file" accept=".pdf,.docx,.txt,.md" (change)="onFile($event)">
            <label class="field grow">Titre<input [(ngModel)]="title" placeholder="Ex. : Règlement intérieur"></label>
            <label class="field">Version<input [(ngModel)]="version" style="width: 7rem"></label>
            <button class="primary" (click)="upload()" [disabled]="!file || uploading()">
              @if (uploading()) { <span class="spinner"></span> Indexation… } @else { Importer }
            </button>
          </div>
          <p class="small muted">{{ file ? file.name : 'Glissez un fichier ici ou choisissez-le.' }} Importez les anciennes et nouvelles versions d'un même document avec le <strong>même titre</strong> pour pouvoir les comparer.</p>
          @if (uploadMsg()) { <div class="alert" [class.ok]="!uploadErr()" [class.error]="uploadErr()">{{ uploadMsg() }}</div> }
        </section>
      }

      <section class="card">
        <h2>Bibliothèque ({{ docs().length }})</h2>
        @if (loadError()) { <div class="alert error">{{ loadError() }}</div> }
        <table>
          <thead><tr><th>Titre</th><th>Version</th><th class="num">Pages</th><th class="num">Passages</th><th>Importé le</th><th></th></tr></thead>
          <tbody>
            @for (d of docs(); track d.id) {
              <tr>
                <td><strong>{{ d.title }}</strong><div class="small muted">{{ d.filename }}</div></td>
                <td>v{{ d.version }}</td><td class="num">{{ d.page_count }}</td><td class="num">{{ d.chunk_count }}</td>
                <td>{{ d.created_at | date: 'dd/MM/yyyy HH:mm' }}</td>
                <td class="right">@if (auth.isAdmin()) { <button class="small danger" (click)="remove(d)">Supprimer</button> }</td>
              </tr>
            } @empty { <tr><td colspan="6" class="muted">Aucun document pour l'instant.</td></tr> }
          </tbody>
        </table>
      </section>

      <section class="card stack">
        <h2>Comparer deux documents</h2>
        <div class="row">
          <label class="field">Ancien (A)
            <select [(ngModel)]="idA"><option [ngValue]="null">—</option>@for (d of docs(); track d.id) { <option [ngValue]="d.id">{{ d.title }} v{{ d.version }}</option> }</select>
          </label>
          <label class="field">Récent (B)
            <select [(ngModel)]="idB"><option [ngValue]="null">—</option>@for (d of docs(); track d.id) { <option [ngValue]="d.id">{{ d.title }} v{{ d.version }}</option> }</select>
          </label>
          <label class="field grow">Sujet de la comparaison<input [(ngModel)]="topic" placeholder="Ex. : conditions de télétravail"></label>
        </div>
        <div class="row">
          <label class="row small"><input type="checkbox" [(ngModel)]="withPdf"> Générer aussi un rapport PDF</label>
          <span class="grow"></span>
          <button class="primary" (click)="compare()" [disabled]="comparing() || !idA || !idB || !topic.trim()">
            @if (comparing()) { <span class="spinner"></span> Analyse… } @else { Comparer }
          </button>
        </div>
        @if (compareErr()) { <div class="alert error">{{ compareErr() }}</div> }
        @if (result(); as r) {
          <div class="card">
            <div class="row small muted"><span class="tag">A : {{ r.doc_a.title }} v{{ r.doc_a.version }}</span><span class="tag">B : {{ r.doc_b.title }} v{{ r.doc_b.version }}</span>
              <span class="grow"></span>
              @if (r.report) { <button class="small" (click)="api.openReport(r.report)">⬇ Télécharger le PDF</button> }</div>
            <div class="md" [innerHTML]="r.markdown | md"></div>
          </div>
        }
      </section>
    </div>`,
})
export class DocumentsComponent implements OnInit {
  api = inject(ApiService);
  auth = inject(AuthService);

  docs = signal<DocumentItem[]>([]);
  loadError = signal('');
  uploading = signal(false); uploadMsg = signal(''); uploadErr = signal(false);
  comparing = signal(false); compareErr = signal(''); result = signal<CompareResult | null>(null);
  file: File | null = null;
  title = ''; version = '1.0';
  idA: number | null = null; idB: number | null = null; topic = ''; withPdf = false;

  ngOnInit() { this.reload(); }

  reload() {
    this.api.documents().subscribe({ next: d => this.docs.set(d), error: e => this.loadError.set(errorMessage(e)) });
  }

  onFile(ev: Event) { this.setFile((ev.target as HTMLInputElement).files?.[0] ?? null); }
  onDrop(ev: DragEvent) { ev.preventDefault(); this.setFile(ev.dataTransfer?.files?.[0] ?? null); }
  private setFile(f: File | null) {
    this.file = f;
    if (f && !this.title) this.title = f.name.replace(/\.[^.]+$/, '');
  }

  async upload() {
    if (!this.file) return;
    this.uploading.set(true); this.uploadMsg.set('');
    try {
      const d = await firstValueFrom(this.api.upload(this.file, this.title, this.version));
      this.uploadErr.set(false);
      this.uploadMsg.set(`« ${d.title} » importé : ${d.page_count} page(s), ${d.chunk_count} passages indexés.`);
      this.file = null; this.title = ''; this.reload();
    } catch (e) { this.uploadErr.set(true); this.uploadMsg.set(errorMessage(e)); }
    finally { this.uploading.set(false); }
  }

  async remove(d: DocumentItem) {
    if (!confirm(`Supprimer « ${d.title} » v${d.version} et tous ses passages indexés ?`)) return;
    try { await firstValueFrom(this.api.deleteDocument(d.id)); this.reload(); }
    catch (e) { this.loadError.set(errorMessage(e)); }
  }

  async compare() {
    if (!this.idA || !this.idB) return;
    this.comparing.set(true); this.compareErr.set(''); this.result.set(null);
    try {
      this.result.set(await firstValueFrom(this.api.compareDocuments({
        topic: this.topic, document_id_a: this.idA, document_id_b: this.idB, generate_pdf: this.withPdf })));
    } catch (e) { this.compareErr.set(errorMessage(e)); }
    finally { this.comparing.set(false); }
  }
}
