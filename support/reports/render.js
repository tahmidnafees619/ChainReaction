/**
 * Renders final_report.html and update_report.html (this directory) to PDF
 * into others/ (the deliverable location expected by the project's required
 * submission layout — see README.md). Run after editing either report,
 * e.g. once the placeholder author/institution/date fields are filled in.
 *
 * Usage:  node support/reports/render.js   (or: npm run reports:build)
 * Requires Playwright — same one-time setup as the e2e test suite:
 *   npm install && npx playwright install chromium
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OTHERS_DIR = path.join(__dirname, '..', '..', 'others');

async function renderOne(htmlPath, cssPath, pdfOutPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const merged = html.replace('/* ieee_style.css inlined below */', css);
  const tmpHtml = htmlPath.replace(/\.html$/, '.merged.html');
  fs.writeFileSync(tmpHtml, merged);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file:///' + path.resolve(tmpHtml).replace(/\\/g, '/'));
  await page.pdf({
    path: pdfOutPath,
    format: 'Letter',
    printBackground: true,
    margin: { top: '0in', bottom: '0in', left: '0in', right: '0in' }, // margins are handled by @page in CSS
  });
  await browser.close();
  fs.unlinkSync(tmpHtml); // clean up the intermediate merged HTML

  // Report page count via a pdf-lib-free trick: count "/Type /Page" occurrences in the raw PDF.
  const buf = fs.readFileSync(pdfOutPath);
  const text = buf.toString('latin1');
  const pageCount = (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log(`${path.basename(pdfOutPath)}: ~${pageCount} pages, ${(buf.length / 1024).toFixed(0)} KB`);
}

(async () => {
  fs.mkdirSync(OTHERS_DIR, { recursive: true });
  const dir = __dirname;
  await renderOne(path.join(dir, 'final_report.html'), path.join(dir, 'ieee_style.css'), path.join(OTHERS_DIR, 'final_report.pdf'));
  await renderOne(path.join(dir, 'update_report.html'), path.join(dir, 'ieee_style.css'), path.join(OTHERS_DIR, 'update_report.pdf'));
})();
