import { MAX_ATTACHMENT_MB } from "./api/config.js";

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
