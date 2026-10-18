#!/usr/bin/env node
// Convert a one-page test plan (Markdown) to a single-page A4 PDF via headless Chrome/Edge.
// No npm dependencies. Supports the Markdown subset the test plan template uses:
// headings, paragraphs, bullet lists (one nesting level), tables, **bold**, *italic*, `code`, ---.
//
// Usage: node md_to_pdf.mjs <input.md> [output.pdf]
// Prints the output path and page count. Exits 2 if the PDF is longer than one page.

import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [, , inputArg, outputArg] = process.argv;
if (!inputArg) {
  console.error("Usage: node md_to_pdf.mjs <input.md> [output.pdf]");
  process.exit(1);
}
const input = resolve(inputArg);
const output = resolve(outputArg ?? input.replace(/\.md$/i, "") + ".pdf");

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const inline = (s) =>
  escapeHtml(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");

function render(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let para = [];
  let listDepth = 0; // 0 = no list open, 1 = top-level list, 2 = nested list

  const flushPara = () => {
    if (para.length) html.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const closeLists = (to = 0) => {
    while (listDepth > to) {
      html.push("</li></ul>");
      listDepth--;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (bullet) {
      flushPara();
      const depth = bullet[1].length >= 2 ? 2 : 1;
      if (depth > listDepth) {
        while (listDepth < depth) {
          html.push("<ul><li>");
          listDepth++;
        }
      } else {
        closeLists(depth);
        html.push("</li><li>");
      }
      html.push(inline(bullet[2]));
      continue;
    }

    if (/^\s*\|/.test(line)) {
      flushPara();
      closeLists();
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      i--;
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const isSep = (r) => /^\s*\|?[\s:|-]+\|?\s*$/.test(r);
      const [head, ...rest] = rows;
      const body = rest.filter((r) => !isSep(r));
      html.push("<table><thead><tr>");
      cells(head).forEach((c) => html.push(`<th>${inline(c)}</th>`));
      html.push("</tr></thead><tbody>");
      body.forEach((r) => {
        html.push("<tr>");
        cells(r).forEach((c) => html.push(`<td>${inline(c)}</td>`));
        html.push("</tr>");
      });
      html.push("</tbody></table>");
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushPara();
      closeLists();
      const n = heading[1].length;
      html.push(`<h${n}>${inline(heading[2])}</h${n}>`);
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      flushPara();
      closeLists();
      html.push("<hr>");
      continue;
    }

    if (!line.trim()) {
      flushPara();
      closeLists();
      continue;
    }

    if (listDepth) {
      // continuation line of a list item
      html.push(" " + inline(line.trim()));
    } else {
      para.push(line.trim());
    }
  }
  flushPara();
  closeLists();
  return html.join("");
}

const css = `
@page { size: A4; margin: 12mm 14mm; }
* { box-sizing: border-box; }
body { font-family: "Segoe UI", Arial, sans-serif; font-size: 9.5pt; line-height: 1.32; color: #1a1a1a; margin: 0; }
h1 { font-size: 15pt; margin: 0 0 2pt; }
h2 { font-size: 10.5pt; margin: 7pt 0 2pt; padding-bottom: 1pt; border-bottom: 1px solid #c8c8c8; color: #1f3a5f; }
h3 { font-size: 9.5pt; margin: 4pt 0 1pt; }
p { margin: 1pt 0 3pt; }
ul { margin: 1pt 0 3pt; padding-left: 14pt; }
li { margin: 0 0 1pt; }
table { border-collapse: collapse; width: 100%; margin: 2pt 0 4pt; }
th, td { border: 1px solid #c8c8c8; padding: 2pt 4pt; text-align: left; vertical-align: top; }
th { background: #eef2f7; }
hr { border: 0; border-top: 1px solid #c8c8c8; margin: 4pt 0; }
code { font-family: Consolas, monospace; font-size: 8.5pt; }
`;

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

const browser = findBrowser();
if (!browser) {
  console.error("No Chrome or Edge found. Set CHROME_PATH to a Chromium-based browser executable.");
  process.exit(1);
}

const md = readFileSync(input, "utf8");
const title = (md.match(/^#\s+(.*)$/m) ?? [, "Test plan"])[1];
const page = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${css}</style></head><body>${render(md)}</body></html>`;

const work = mkdtempSync(join(tmpdir(), "test-plan-"));
const htmlPath = join(work, "plan.html");
writeFileSync(htmlPath, page, "utf8");

try {
  execFileSync(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-pdf-header-footer",
      "--print-to-pdf-no-header",
      `--user-data-dir=${join(work, "profile")}`,
      `--print-to-pdf=${output}`,
      pathToFileURL(htmlPath).href,
    ],
    { stdio: "ignore", timeout: 60000 },
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (!existsSync(output)) {
  console.error("PDF was not created.");
  process.exit(1);
}
const pdf = readFileSync(output, "latin1");
const pages = (pdf.match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
console.log(`PDF: ${output}`);
console.log(`Pages: ${pages}`);
if (pages > 1) {
  console.error("The plan is longer than one page. Shorten the content and export again.");
  process.exit(2);
}
