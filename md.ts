// Минимальный Markdown → HTML для превью страниц. Полноценный блочный редактор
// (как в Notion) — более поздний этап; здесь markdown с живым просмотром.
// Контент сначала экранируется, поэтому вставка HTML безопасна.

export function md(src: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = esc(src ?? "").split("\n");
  let html = "", inCode = false, inList = false;

  for (const raw of lines) {
    if (raw.trim().startsWith("```")) {
      inCode = !inCode;
      html += inCode ? "<pre><code>" : "</code></pre>";
      continue;
    }
    if (inCode) { html += raw + "\n"; continue; }

    let line = raw
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

    const h = line.match(/^(#{1,3})\s+(.*)/);
    if (h) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<h${h[1].length}>${h[2]}</h${h[1].length}>`;
      continue;
    }
    const li = line.match(/^[-*]\s+(.*)/);
    if (li) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${li[1]}</li>`;
      continue;
    }
    if (inList) { html += "</ul>"; inList = false; }
    if (line.trim() !== "") html += `<p>${line}</p>`;
  }
  if (inList) html += "</ul>";
  if (inCode) html += "</code></pre>";
  return html;
}
