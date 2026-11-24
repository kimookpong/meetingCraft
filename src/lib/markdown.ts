/** Minimal, XSS-safe Markdown → HTML (headings, lists, tables, bold/italic/code, quotes). */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const inline = (s: string) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r/g, '').split('\n')
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  let table: string[][] | null = null
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null } }
  const closeTable = () => {
    if (!table) return
    const [head, ...rows] = table
    out.push('<div class="overflow-x-auto"><table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
      rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>')
    table = null
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (/^\s*\|.*\|\s*$/.test(line)) {
      closeList()
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue
      ;(table ??= []).push(cells)
      continue
    }
    closeTable()
    let m: RegExpMatchArray | null
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { closeList(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`) }
    else if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul' } out.push(`<li>${inline(m[1])}</li>`) }
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol' } out.push(`<li>${inline(m[1])}</li>`) }
    else if ((m = line.match(/^>\s?(.*)$/))) { closeList(); out.push(`<blockquote class="border-l-4 border-slate-300 pl-3 text-slate-500">${inline(m[1])}</blockquote>`) }
    else if (!line.trim()) closeList()
    else { closeList(); out.push(`<p>${inline(line)}</p>`) }
  }
  closeList()
  closeTable()
  return out.join('\n')
}
