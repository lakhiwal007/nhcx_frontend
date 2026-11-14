export const QUERY_RESPONSE_CODES = ["respond_preauth_query", "respond_claim_query"];

export const REPROCESS_CODE = "submit_reprocess";

export const DOCUMENT_ACTION_CODES = [...QUERY_RESPONSE_CODES, REPROCESS_CODE];

export const carriesDocuments = (actionCode) => DOCUMENT_ACTION_CODES.includes(actionCode);

export const documentFromFile = ({ title, contentType, data }) => ({
  category: "attachment",
  code: "ATTACHMENT",
  name: title || "Supporting Document",
  content_type: contentType,
  attachment: { data, contentType, title: title || "Supporting Document" },
});

export const buildQueryResponseBody = ({ claim_id, cashless_case_id, answer, docs } = {}) => ({
  ...(cashless_case_id ? { cashless_case_id } : {}),
  ...(claim_id ? { claim_id } : {}),
  supporting_documents: docs ?? [],
  ...(answer
    ? {
        questionnaire_response: {
          status: "completed",
          item: [{ linkId: "query-1", answer: [{ valueString: answer }] }],
        },
      }
    : {}),
});

export const buildReprocessBody = ({ claim_id, answer, docs } = {}) => ({
  ...(claim_id ? { claim_id } : {}),
  supporting_documents: docs ?? [],
  ...(answer ? { description: answer } : {}),
});

export const buildActionBody = (actionCode, args) =>
  actionCode === REPROCESS_CODE ? buildReprocessBody(args) : buildQueryResponseBody(args);
