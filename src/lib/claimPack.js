import { api } from "../api";
import { formatCaseRef, formatDate, formatDateTime, humanize } from "./format.js";

const PAGE = [595, 842];
const MARGIN = 48;
const SIZE = 10;
const LINE = 14;

const plain = (value) =>
  String(value ?? "")
    .replace(/₹/g, "Rs. ")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E\n]/g, "");

const rupees = (v) => (v == null || v === "" ? "-" : `Rs. ${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);

function writer(pdf, font, bold) {
  let page = pdf.addPage(PAGE);
  let y = PAGE[1] - MARGIN;
  const width = PAGE[0] - MARGIN * 2;

  const ensure = (needed) => {
    if (y - needed < MARGIN) {
      page = pdf.addPage(PAGE);
      y = PAGE[1] - MARGIN;
    }
  };

  const wrap = (text, f, size) => {
    const lines = [];
    plain(text)
      .split("\n")
      .forEach((para) => {
        let line = "";
        para.split(" ").forEach((word) => {
          const next = line ? `${line} ${word}` : word;
          if (f.widthOfTextAtSize(next, size) > width && line) {
            lines.push(line);
            line = word;
          } else line = next;
        });
        lines.push(line);
      });
    return lines;
  };

  return {
    heading(text) {
      ensure(LINE * 2.5);
      y -= LINE * 0.6;
      page.drawText(plain(text), { x: MARGIN, y, size: 14, font: bold });
      y -= LINE * 1.4;
    },
    text(text, { strong = false } = {}) {
      wrap(text, strong ? bold : font, SIZE).forEach((line) => {
        ensure(LINE);
        page.drawText(line, { x: MARGIN, y, size: SIZE, font: strong ? bold : font });
        y -= LINE;
      });
    },
    row(label, value) {
      if (value == null || value === "") return;
      ensure(LINE);
      page.drawText(plain(label), { x: MARGIN, y, size: SIZE, font: bold });
      wrap(value, font, SIZE).forEach((line, i) => {
        if (i > 0) ensure(LINE);
        page.drawText(line, { x: MARGIN + 170, y, size: SIZE, font });
        y -= LINE;
      });
    },
    gap() {
      y -= LINE / 2;
    },
  };
}

async function appendFile(pdf, file, PDFDocument) {
  const data = file?.data;
  if (!data) return false;
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const type = String(file.content_type || file.contentType || "").toLowerCase();
  if (type.includes("pdf")) {
    const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await pdf.copyPages(source, source.getPageIndices());
    pages.forEach((page) => pdf.addPage(page));
    return true;
  }
  if (type.includes("png") || type.includes("jpeg") || type.includes("jpg")) {
    const image = type.includes("png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const scale = Math.min((PAGE[0] - MARGIN * 2) / image.width, (PAGE[1] - MARGIN * 2) / image.height, 1);
    const page = pdf.addPage(PAGE);
    page.drawImage(image, { x: MARGIN, y: PAGE[1] - MARGIN - image.height * scale, width: image.width * scale, height: image.height * scale });
    return true;
  }
  return false;
}

async function sentFiles(caseId) {
  const out = [];
  for (const stage of ["preauth", "claim"]) {
    const list = await api.getCaseFiles(caseId, stage).catch(() => null);
    for (const file of list?.files || []) {
      const full = await api.getCaseFile(caseId, { stage, sequence: file.sequence }).catch(() => null);
      out.push({ stage, title: file.title || full?.title || "Document", file: full });
    }
  }
  return out;
}

export async function buildClaimPack({ caseId, record, patient, facilityName }) {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const [timeline, files] = await Promise.all([api.getCaseTimeline(caseId, { limit: 500 }).catch(() => null), sentFiles(caseId)]);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const w = writer(pdf, font, bold);
  const preauth = record?.preauth || {};
  const claim = record?.claim || {};
  const ledger = timeline?.money_ledger || {};
  const stay = record?.stay || {};

  w.heading(`Claim pack: ${formatCaseRef(caseId)}`);
  w.text(`Prepared ${formatDateTime(new Date())}${facilityName ? ` at ${facilityName}` : ""}.`);
  w.gap();
  w.row("Patient", patient?.name || patient?.child_name);
  w.row("Payer", record?.payer_id);
  w.row("Policy", record?.policy_number);
  w.row("Member id", record?.beneficiary_member_id);
  w.row("Admission", [stay.admission_no, stay.admitted_at && formatDate(stay.admitted_at)].filter(Boolean).join(" - "));
  w.row("Discharge", [stay.discharged_at && formatDate(stay.discharged_at), stay.discharge_how].filter(Boolean).join(" - "));
  w.row("Pre-auth", [humanize(String(preauth.decision || record?.legs?.preauth || "not sent").toLowerCase()), preauth.preauth_ref].filter(Boolean).join(" - "));
  w.row("Claim", humanize(String(claim.decision || record?.legs?.claim || "not sent").toLowerCase()));
  w.row("Billed", rupees(ledger.billed?.value));
  w.row("Approved to bill", rupees(ledger.authorized_ceiling?.value));
  w.row("Claim approved", rupees(ledger.approved?.value));
  w.row("Paid", rupees(ledger.settlement?.net));

  w.heading("Timeline");
  (timeline?.events || []).forEach((e) => {
    w.text(`${formatDateTime(e.ts)}  ${e.title || humanize(e.type || "")}`, { strong: true });
    if (e.summary) w.text(e.summary);
  });

  w.heading("Documents sent to the payer");
  const skipped = [];
  if (!files.length) w.text("No documents were sent with this case.");
  files.forEach((f) => w.text(`${f.stage === "claim" ? "Claim" : "Pre-auth"}: ${f.title}`));

  for (const f of files) {
    const added = await appendFile(pdf, f.file, PDFDocument).catch(() => false);
    if (!added) skipped.push(f.title);
  }
  if (skipped.length) {
    const tail = writer(pdf, font, bold);
    tail.heading("Not included");
    tail.text(`These files could not be added as pages; open them from the case: ${skipped.join(", ")}.`);
  }

  const bytes = await pdf.save();
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `claim-pack-${formatCaseRef(caseId)}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { files: files.length, skipped: skipped.length };
}
