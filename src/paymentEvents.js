// A payer sends one PaymentNotice per stage of the same payment, so the events
// list carries several rows for one movement of money. Collapse them: group by
// payment reference, then split that group by UTR only when it genuinely holds
// more than one — an early notice often arrives before a UTR exists, while two
// distinct UTRs under one reference really are two payments (a payer that
// reuses the case id as its payment reference would otherwise merge them).

const STAGE_RANK = {
  PAYMENT_INITIATED: 1,
  PAYMENT_PROCESSED: 2,
  PAYMENT_SETTLED: 3,
};

export const stageRank = (stage) => STAGE_RANK[String(stage || "").toUpperCase()] ?? 0;

export const stageLabel = (stage) =>
  String(stage || "")
    .replace(/^PAYMENT[_-]/i, "")
    .toLowerCase();

const referenceOf = (event) =>
  event.payment_reference || event.claim_reference || event.notice_identifier || "no-ref";

const eventTime = (event) =>
  Date.parse(event.received_at) || Date.parse(event.payment_date) || 0;

function collapse(history, key) {
  const ordered = [...history].sort((a, b) => eventTime(a) - eventTime(b));
  const latest = ordered.reduce((best, event) => {
    if (!best) return event;
    const byStage = stageRank(event.payment_stage) - stageRank(best.payment_stage);
    if (byStage !== 0) return byStage > 0 ? event : best;
    return eventTime(event) >= eventTime(best) ? event : best;
  }, null);

  return {
    ...latest,
    utr: latest?.utr || ordered.map((e) => e.utr).filter(Boolean).pop() || null,
    group_key: key,
    history: ordered,
    notice_count: ordered.length,
    settled: stageRank(latest?.payment_stage) === STAGE_RANK.PAYMENT_SETTLED,
    pending_ack: ordered.some((e) => e.acknowledgement_status !== "submitted"),
  };
}

export function groupPaymentEvents(events = []) {
  const byReference = new Map();
  events.forEach((event) => {
    const ref = referenceOf(event);
    if (!byReference.has(ref)) byReference.set(ref, []);
    byReference.get(ref).push(event);
  });

  const grouped = [];
  byReference.forEach((list, ref) => {
    const utrs = [...new Set(list.map((e) => e.utr).filter(Boolean))];

    if (utrs.length <= 1) {
      grouped.push(collapse(list, `${ref}::${utrs[0] || "no-utr"}`));
      return;
    }

    utrs.forEach((utr) => {
      grouped.push(collapse(list.filter((e) => e.utr === utr), `${ref}::${utr}`));
    });
    const withoutUtr = list.filter((e) => !e.utr);
    if (withoutUtr.length > 0) grouped.push(collapse(withoutUtr, `${ref}::no-utr`));
  });

  return grouped;
}
