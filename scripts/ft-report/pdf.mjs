import fs from "node:fs";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { coverHtml, buildSections, bodyHtml, sectionHtml, tocHtml, wrap, esc } from "./html.mjs";

const MARGIN = { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" };

const headerTemplate = (title) => `<div style="font-size:8px;color:#555;width:100%;padding:0 16mm;display:flex;justify-content:space-between;font-family:Arial"><span>${esc(title)}</span><span></span></div>`;
const footerTemplate = `<div style="font-size:8px;color:#555;width:100%;padding:0 16mm;display:flex;justify-content:space-between;font-family:Arial"><span>Confidential</span><span>Page | <span class="pageNumber"></span></span></div>`;

export async function renderPdf(model, outPath, { channel } = {}) {
  const browser = await chromium.launch({ channel: channel || undefined });
  try {
    const page = await browser.newPage();
    const print = async (html, numbered) => {
      await page.setContent(html, { waitUntil: "load" });
      return page.pdf({
        format: "A4",
        printBackground: true,
        margin: MARGIN,
        displayHeaderFooter: numbered,
        headerTemplate: numbered ? headerTemplate(model.title) : "<span></span>",
        footerTemplate: numbered ? footerTemplate : "<span></span>",
      });
    };
    const count = async (buffer) => (await PDFDocument.load(buffer)).getPageCount();

    const sections = buildSections(model);
    const placeholderToc = tocHtml(sections, Object.fromEntries(sections.map((s) => [s.key, "000"])));
    const pages = {};
    let cursor = 1;
    for (const s of sections) {
      pages[s.key] = cursor;
      cursor += await count(await print(wrap(sectionHtml(s, placeholderToc)), true));
    }

    const coverPdf = await print(coverHtml(model), false);
    const bodyPdf = await print(bodyHtml(sections, pages), true);

    const out = await PDFDocument.create();
    for (const buffer of [coverPdf, bodyPdf]) {
      const src = await PDFDocument.load(buffer);
      const copied = await out.copyPages(src, src.getPageIndices());
      copied.forEach((p) => out.addPage(p));
    }
    out.setTitle(model.title);
    out.setSubject(model.reportType);
    fs.writeFileSync(outPath, await out.save());
    return { pages: out.getPageCount(), sections: sections.length };
  } finally {
    await browser.close();
  }
}
