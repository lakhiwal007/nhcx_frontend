import { MAX_ATTACHMENT_MB } from "../api/config.js";
import { safeHref } from "./format.js";

const PREVIEW_TYPES = /^(application\/pdf|image\/(png|jpe?g|gif|webp|bmp)|text\/plain|application\/json)$/i;
const BLOB_LIFETIME_MS = 10 * 60 * 1000;

const partsOf = (file) => {
  const att = file?.attachment || {};
  let data = file?.data || att.data || null;
  let type = file?.contentType || file?.content_type || att.contentType || att.content_type || "";
  const title = file?.title || att.title || file?.name || "attachment";
  if (!data) {
    const match = /^data:(.*?);base64,(.*)$/.exec(file?.url || "");
    if (match) {
      type = type || match[1];
      data = match[2];
    }
  }
  return { data, type, title };
};

const linkOf = (file) => (/^https?:/i.test(String(file?.url || "").trim()) ? safeHref(file.url) : null);

export const canViewAttachment = (file) => !!file && (!!partsOf(file).data || !!linkOf(file));

const bytesOf = (data) => {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const prettyJson = (bytes) => {
  try {
    return JSON.stringify(JSON.parse(new TextDecoder().decode(bytes)), null, 2);
  } catch {
    return bytes;
  }
};

const blobOf = (file) => {
  const { data, type, title } = partsOf(file);
  if (!data) return null;
  const base = type.split(";")[0].trim().toLowerCase();
  const mime = /json$/.test(base) ? "application/json" : base;
  const preview = PREVIEW_TYPES.test(mime);
  const bytes = bytesOf(data);
  const body = mime === "application/json" ? prettyJson(bytes) : bytes;
  const kind = !preview ? "none" : mime === "application/pdf" ? "pdf" : mime.startsWith("image/") ? "image" : "text";
  const blobType = kind === "none" ? "application/octet-stream" : kind === "text" ? `${mime};charset=utf-8` : mime;
  const text = kind !== "text" ? null : typeof body === "string" ? body : new TextDecoder().decode(body);
  return { blob: new Blob([body], { type: blobType }), kind, title, text };
};

export const attachmentTitle = (file) => partsOf(file).title;

export const attachmentLink = (file) => (partsOf(file).data ? null : linkOf(file));

export function attachmentPreview(file) {
  const made = blobOf(file);
  if (!made) return { kind: "none", title: partsOf(file).title, blob: null, text: null };
  return { kind: made.kind, title: made.title, blob: made.kind === "pdf" || made.kind === "image" ? made.blob : null, text: made.text };
}

export function openAttachment(file, { download = false } = {}) {
  const made = blobOf(file);
  const link = document.createElement("a");
  if (made) {
    const url = URL.createObjectURL(made.blob);
    link.href = url;
    if (download || made.kind === "none") link.download = made.title;
    else link.target = "_blank";
    setTimeout(() => URL.revokeObjectURL(url), BLOB_LIFETIME_MS);
  } else {
    const href = linkOf(file);
    if (!href) return false;
    link.href = href;
    link.target = "_blank";
  }
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}

export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;

export const attachmentLimitText = (maxBytes = MAX_ATTACHMENT_BYTES) => `${Math.round(maxBytes / (1024 * 1024))} MB`;

export function readFileAsAttachment(file, { maxBytes = MAX_ATTACHMENT_BYTES, fallbackType = "application/octet-stream" } = {}) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("No file was chosen."));
    if (maxBytes && file.size > maxBytes) {
      return reject(new Error(`${file.name} is larger than ${attachmentLimitText(maxBytes)}. Attach a smaller file.`));
    }
    const reader = new FileReader();
    reader.onload = () => {
      const match = /^data:(.*?);base64,(.*)$/.exec(reader.result || "");
      if (!match) return reject(new Error(`Could not read ${file.name}.`));
      const contentType = match[1] || file.type || fallbackType;
      const data = match[2];
      resolve({
        url: reader.result,
        title: file.name,
        contentType,
        data,
        content_type: contentType,
        attachment: { contentType, data, title: file.name },
      });
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}
