const same = (a, b) => String(a || "").trim().toUpperCase() === String(b || "").trim().toUpperCase();

export function liveAsks(asks, documents, forms) {
  const attached = (documents || []).filter((d) => d.url || d.attachment);
  return (asks || []).map((row) => {
    if (row.kind === "document") {
      const file = attached.find((d) => same(d.code, row.code) && (!row.category || !d.category || same(d.category, row.category)));
      const ok = !!file;
      return { ...row, status: ok ? "attached" : "missing", file_name: file ? file.attachment?.title || file.name || row.file_name : null, blocking: row.source === "ruling" && !ok };
    }
    const form = (forms || []).find((f) => f.url === row.form_url);
    if (!form) return row;
    const questions = (form.items || []).filter((q) => !["group", "display"].includes(q.type));
    const has = (q) => q.answer != null && q.answer !== "" || !!q.file;
    const required = questions.filter((q) => q.required);
    const answered = questions.filter(has).length;
    const answeredRequired = required.filter(has).length;
    const status = answered === 0 ? "unanswered" : answeredRequired < required.length ? "partial" : "answered";
    const filesMissing = required.filter((q) => q.type === "attachment" && !has(q)).length;
    const blocking =
      row.source === "consent" ? filesMissing > 0 : status === "partial" || (status === "unanswered" && row.source === "ruling" && required.length > 0);
    return { ...row, answered, answered_required: answeredRequired, required: required.length, status, blocking };
  });
}
