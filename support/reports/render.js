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

// Required course-identification header — rendered into the actual PDF
// margin band (via Playwright's headerTemplate) so it repeats on every
// page above the content, not just inline text at the top of page 1.
const COURSE_HEADER = `
  <div style="width:100%;font-size:7px;font-family:'Times New Roman',Times,serif;
              text-align:center;color:#333;padding:0 0.6in;">
    CSE440 &ndash; Section 2 &nbsp;|&nbsp; Project Group: A &nbsp;|&nbsp;
    Md. Tahmidur Rahman Nafees (2022454642) &middot; Sakib Rahman Rohan (2011350042)
  </div>`;
const PAGE_NUMBER_FOOTER = `
  <div style="width:100%;font-size:7px;font-family:'Times New Roman',Times,serif;
              text-align:center;color:#333;">
    <span class="pageNumber"></span> / <span class="totalPages"></span>
  </div>`;

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
    displayHeaderFooter: true,
    headerTemplate: COURSE_HEADER,
    footerTemplate: PAGE_NUMBER_FOOTER,
    // Explicit JS margins take precedence over the CSS @page rule once
    // displayHeaderFooter is on — top is bumped up from the CSS value
    // (0.75in) to make room for the course-header band; the rest match
    // ieee_style.css's @page margins so the body layout is unaffected.
    margin: { top: '0.95in', right: '0.62in', bottom: '0.85in', left: '0.62in' },
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
