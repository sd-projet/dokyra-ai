import { Pipe, PipeTransform } from '@angular/core';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[(\d+(?:\s*[,;]\s*\d+)*)\]/g, '<sup class="cite">[$1]</sup>');
}

const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

/** Rendu Markdown minimal et sûr (le texte est échappé avant toute mise en forme). */
export function renderMarkdown(src: string): string {
  const lines = (src ?? '').replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
  let table: string[][] = [];
  let code: string[] | null = null;

  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => {
    if (list) { out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; }
  };
  const flushTable = () => {
    if (!table.length) return;
    const rows = table.filter(r => !r.every(c => /^:?-{2,}:?$/.test(c)));
    const head = rows[0] ?? [];
    const body = rows.slice(1);
    out.push('<table><thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>'
      + body.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>');
    table = [];
  };
  const flushAll = () => { flushPara(); flushList(); flushTable(); };

  for (const raw of lines) {
    if (code !== null) {
      if (raw.trim().startsWith('```')) { out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); code = null; }
      else code.push(raw);
      continue;
    }
    if (raw.trim().startsWith('```')) { flushAll(); code = []; continue; }
    if (raw.trim().startsWith('|')) { flushPara(); flushList(); table.push(cells(raw)); continue; }
    flushTable();
    const h = /^(#{1,4})\s+(.*)$/.exec(raw);
    const li = /^\s*([-*•]|\d+[.)])\s+(.*)$/.exec(raw);
    if (h) { flushAll(); const n = Math.min(h[1].length + 2, 6); out.push(`<h${n}>${inline(h[2])}</h${n}>`); }
    else if (li) {
      flushPara();
      const tag = /\d/.test(li[1]) ? 'ol' : 'ul';
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push(li[2]);
    }
    else if (/^\s*(-{3,}|\*{3,})\s*$/.test(raw)) { flushAll(); out.push('<hr>'); }
    else if (!raw.trim()) flushAll();
    else { flushList(); para.push(raw.trim()); }
  }
  if (code !== null) out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
  flushAll();
  return out.join('');
}

@Pipe({ name: 'md', standalone: true })
export class MarkdownPipe implements PipeTransform {
  transform(value: string | null | undefined): string { return renderMarkdown(value ?? ''); }
}
