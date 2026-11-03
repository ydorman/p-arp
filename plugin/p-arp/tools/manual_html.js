// User manual Markdown -> print-styled HTML for tools/manual_pdf.sh. Headings get GitHub-style ids
// so the in-document links work; local images are inlined so the HTML works from anywhere.
//
// Usage: node tools/manual_html.js <manual.md> <out.html>   (needs the marked package)
const fs = require("fs");
const path = require("path");
const { marked } = require("marked");

const [src, out] = process.argv.slice(2);
const md = fs.readFileSync(src, "utf8");

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s/g, "-");

marked.use({
  gfm: true,
  renderer: {
    heading(text, level, raw) {
      return `<h${level} id="${slug(raw)}">${text}</h${level}>\n`;
    },
  },
});

const body = marked.parse(md).replace(/<img src="([^":]+)"/g, (_, file) =>
  `<img src="data:image/png;base64,${fs.readFileSync(path.join(path.dirname(src), file)).toString("base64")}"`);

const css = `
@page { size: A4; margin: 18mm 18mm 20mm; }
body { font: 10.5pt/1.5 -apple-system, "Helvetica Neue", Helvetica, sans-serif; color: #1d1d1f; }
h1 { font-size: 26pt; margin: 0 0 6pt; letter-spacing: -0.5px; }
h2 { font-size: 16pt; margin: 0 0 8pt; padding-bottom: 4pt; border-bottom: 1.5px solid #d92b4b; margin-top: 22pt; break-after: avoid; }
h2#contents { margin-top: 14pt; }
h2#12-parameter-reference { break-before: page; margin-top: 0; }
h3 { font-size: 12pt; margin: 16pt 0 4pt; break-after: avoid; }
p, li { orphans: 3; widows: 3; }
a { color: #b0213c; text-decoration: none; }
hr { display: none; }
code { font: 9pt/1.4 Menlo, monospace; background: #f2f2f4; padding: 1px 4px; border-radius: 3px; }
pre { background: #f2f2f4; padding: 8pt 10pt; border-radius: 4px; white-space: pre-wrap; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0 10pt; font-size: 9.5pt; break-inside: auto; }
tr { break-inside: avoid; }
th, td { text-align: left; vertical-align: top; padding: 3pt 8pt; border-bottom: 1px solid #e2e2e6; }
th { border-bottom: 1.5px solid #888; }
td:empty { padding: 2pt; }
tr:has(td:nth-child(2):empty) td:first-child { padding-top: 10pt; color: #b0213c; }
blockquote { margin: 8pt 0; padding: 6pt 12pt; border-left: 3px solid #d92b4b; background: #faf2f4; }
blockquote p { margin: 0; }
img { display: block; width: 100%; border-radius: 6px; margin: 4pt 0 10pt; }
`;

fs.writeFileSync(
  out,
  `<!doctype html><html><head><meta charset="utf-8"><title>p-arp User Manual</title><style>${css}</style></head><body>${body}</body></html>`
);
