import { delay } from './config.js';

export const mock = {
  // ─── Health ────────────────────────────────────────────────────────────────
  healthCheck: async () => {
    await delay(200);
    return { status: "ok", service: "nhcx-service", version: "1.2.0" };
  },

  // ─── Dashboard ─────────────────────────────────────────────────────────────
  getDashboardStats: async () => {
    await delay(500);
    return {
      claims: {
        total: 18,
        pending: 6,
        partial: 2,
        complete: 9,
        failed: 1,
        preauth_pending: 4,
      },
      children: { with_claims: 13 },
    };
  },

  getDashboardClaims: async (params = {}) => {
    await delay(600);
    return {
      total_count: 3,
      limit: params.limit || 20,
      offset: params.offset || 0,
      claims: [
        {
          id: 101,
          child_id: 12,
          child_name: "Arjun Mehta",
          patient_name: "Arjun Mehta",
          use_type: "preauthorization",
          status: "draft",
          claim_decision: null,
          approved_amount: null,
          payment_status: null,
          latest_utr: null,
          created_at: "2026-05-11T11:30:00+05:30",
          pending_tasks: [],
          completed_tasks: [],
        },
        {
          id: 102,
          child_id: 19,
          child_name: "Aisha Kapoor",
          patient_name: "Aisha Kapoor",
          use_type: "claim",
          status: "complete",
          claim_decision: "APPROVED",
          approved_amount: 40000,
          payment_status: "PAYMENT_SETTLED",
          latest_utr: "UTR123456789",
          created_at: "2026-05-10T09:00:00+05:30",
          pending_tasks: [],
          completed_tasks: [],
        },
        {
          id: 103,
          child_id: 25,
          child_name: "Riya Sharma",
          patient_name: "Riya Sharma",
          use_type: "preauthorization",
          status: "pending",
          claim_decision: "QUERIED",
          approved_amount: null,
          payment_status: null,
          latest_utr: null,
          created_at: "2026-05-12T14:00:00+05:30",
          pending_tasks: [
            {
              task_id: "T-301",
              task_type: "respond_query",
              title: "Payer query response required",
              priority: "high",
            },
          ],
          completed_tasks: [],
        },
      ],
    };
  },

  // ─── Child / Patient Registry ───────────────────────────────────────────────
  searchChildren: async (params = {}) => {
    await delay(800);
    return {
      total_count: 2,
      limit: 20,
      offset: 0,
      children: [
        {
          child_id: 12,
          name: "Arjun Mehta",
          gender: "male",
          dob: "2020-01-01",
          mobile: "9999999999",
          created_at: "2026-05-04T10:30:00+05:30",
          cashless_cases_count: 1,
          latest_claim: {
            cashless_case_id: 4,
            claim_id: 101,
            status: "pending",
            current_step: "insurance_and_eligibility",
            payer_code: "1518@hcx",
            policy_number: "POL-91711234567890-2026",
            preauth_status: "pending",
            created_at: "2026-05-04T10:35:00+05:30",
          },
          visits: [
            {
              visit_type: "ipd",
              admission_id: 622,
              admission_no: "ADM-622",
              started_at: "2026-05-23T10:30:00+05:30",
              status: "admitted",
              diagnosis: "Acute gastroenteritis with dehydration",
              reason: "Cashless IPD admission",
              primary_doctor: {
                doctor_id: 1,
                name: "Dr. Meera Rao",
                specialization: "Paediatrician",
              },
              invoices: [
                {
                  invoice_id: 622,
                  invoice_type: "ipd",
                  invoice_no: "IPD-INV-622",
                  invoice_date: "2026-05-23",
                  amount_billed: 16000,
                  final_amount: 15200,
                  final_discount: 800,
                  billing_status: "pending",
                  line_items: [
                    {
                      line_item_id: 1,
                      code: "ROOM-001",
                      name: "Room charges",
                      category: "room",
                      quantity: 2,
                      unit_price: 4500,
                      net_amount: 9000,
                    },
                  ],
                },
              ],
              claims: [
                {
                  claim_id: 101,
                  cashless_case_id: 4,
                  status: "draft",
                  use_type: "preauthorization",
                  payer_code: "1518@hcx",
                  payer_name: "Sample Payer",
                  policy_number: "POL-91711234567890-2026",
                  total_billed: 15200,
                },
              ],
            },
          ],
        },
        {
          child_id: 19,
          name: "Aisha Kapoor",
          gender: "female",
          dob: "2019-06-11",
          mobile: "8888888888",
          created_at: "2026-05-04T11:00:00+05:30",
          cashless_cases_count: 2,
          latest_claim: {
            cashless_case_id: 5,
            claim_id: 102,
            status: "complete",
            current_step: "preauth_ready",
            payer_code: "2044@hcx",
            policy_number: "POL-ALT-2026",
            preauth_status: "approved",
            created_at: "2026-05-04T11:05:00+05:30",
          },
          visits: [],
        },
      ],
    };
  },

  // ─── Payer Search ───────────────────────────────────────────────────────────
  searchPayers: async (params = {}) => {
    await delay(400);
    const allPayers = [
      {
        participant_code: "1518@hcx",
        name: "Sample Payer",
        scheme_type: "PMJAY",
        status: "active",
      },
      {
        participant_code: "2044@hcx",
        name: "Star Health & Allied",
        scheme_type: "Retail",
        status: "active",
      },
      {
        participant_code: "3011@hcx",
        name: "HDFC ERGO",
        scheme_type: "Corporate",
        status: "active",
      },
      {
        participant_code: "4022@hcx",
        name: "Universal Life",
        scheme_type: "Public Health",
        status: "active",
      },
    ];
    if (params.name) {
      return allPayers.filter((p) =>
        p.name.toLowerCase().includes(params.name.toLowerCase()),
      );
    }
    return allPayers;
  },

  getPayerById: async (id) => {
    await delay(300);
    const allPayers = [
      { participant_code: "1518@hcx", name: "Sample Payer", scheme_type: "PMJAY", status: "active" },
      { participant_code: "2044@hcx", name: "Star Health & Allied", scheme_type: "Retail", status: "active" },
      { participant_code: "3011@hcx", name: "HDFC ERGO", scheme_type: "Corporate", status: "active" },
      { participant_code: "4022@hcx", name: "Universal Life", scheme_type: "Public Health", status: "active" },
    ];
    const payer = allPayers.find((p) => p.participant_code === id);
    if (!payer) throw new Error(`No payer found for ${id}`);
    return payer;
  },

  // ─── Policy Fetch ───────────────────────────────────────────────────────────
  fetchPolicies: async (data) => {
    await delay(1000);
    return {
      status: "success",
      data: {
        child_id: data.child_id,
        payer_code: data.payer_code,
        identifier_used: { type: "AbhaNumber", value: "91711234567890" },
        policies: [
          {
            policy_number: "POL-91711234567890-2026",
            product_name: "GeneralHealth-2026",
            payer_id: data.payer_code,
            payer_name: "Sample Payer",
            status: "active",
            sum_insured: 500000,
            currency: "INR",
            effective_from: "2026-01-01",
            effective_to: "2026-12-31",
          },
          {
            policy_number: "POL-ALT-2026",
            product_name: "Family Floater Plus",
            payer_id: data.payer_code,
            payer_name: "Sample Payer",
            status: "active",
            sum_insured: 300000,
            currency: "INR",
            effective_from: "2026-01-01",
            effective_to: "2026-12-31",
          },
        ],
        fetched_at: "2026-05-04T10:40:00+05:30",
      },
    };
  },

  // ─── Cashless Preparation ───────────────────────────────────────────────────
  prepareCashless: async (data) => {
    await delay(800);
    return {
      cashless_case_id: 4,
      claim_id: data.claim_id,
      child_id: data.child_id,
      payer_code: data.payer_code || "1518@hcx",
      policy_number: data.policy_number,
      status: "pending",
      current_step: "insurance_and_eligibility",
      next_actions: ["refresh"],
      procedures: {
        source: "claim_db",
        items: [
          {
            category: "SE",
            code: "47562",
            name: "Laparoscopic cholecystectomy",
          },
        ],
      },
      insurance_plan: {
        status: "pending",
        correlation_id: "550e8400-e29b-41d4-a716-446655440000",
      },
      coverage_eligibility: {
        status: "pending",
        correlation_id: "9e5c60bf-4014-4b72-a2f0-1fe4f9a75e61",
      },
    };
  },

  getCashlessStatus: async (cashless_case_id) => {
    await delay(1000);
    return {
      cashless_case_id,
      claim_id: 101,
      child_id: 12,
      payer_code: "1518@hcx",
      policy_number: "POL-91711234567890-2026",
      status: "complete",
      current_step: "preauth_ready",
      next_actions: ["prepare_preauth"],
      procedures: {
        source: "claim_db",
        items: [
          {
            category: "SE",
            code: "47562",
            name: "Laparoscopic cholecystectomy",
          },
        ],
      },
      insurance_plan: {
        status: "complete",
        correlation_id: "550e8400-e29b-41d4-a716-446655440000",
        plan_details: { name: "GeneralHealth-2026", status: "active" },
        inclusions: [
          { code: "ROOM", name: "Room rent" },
          { code: "ICU", name: "ICU Charges" },
        ],
        exclusions: [
          { code: "COSMETIC", name: "Cosmetic surgery" },
          { code: "DENTAL", name: "Routine Dental" },
        ],
        pricing: { sum_insured: 500000, currency: "INR" },
        document_requirements: [
          { name: "Admission note" },
          { name: "Doctor prescription" },
        ],
        raw_payload: { resourceType: "InsurancePlan" },
        stored_record: {
          id: 7,
          request_id: "550e8400-e29b-41d4-a716-446655440000",
          child_id: 12,
          payer_code: "1518@hcx",
          updated_at: "2026-05-04T10:41:00+05:30",
        },
      },
      coverage_eligibility: {
        status: "complete",
        correlation_id: "9e5c60bf-4014-4b72-a2f0-1fe4f9a75e61",
        outcome: "complete",
        disposition: "Eligible",
        inforce: true,
        auth_required: true,
        insurance_items: [
          {
            coverage: "Coverage/POL-91711234567890-2026",
            inforce: true,
            items: [
              {
                sequence: 1,
                category: { code: "SE", display: "Surgical" },
                product_or_service: {
                  code: "47562",
                  display: "Laparoscopic cholecystectomy",
                },
                excluded: false,
                benefit: [
                  {
                    type: { code: "benefit", display: "Benefit Limit" },
                    allowed: { type: "Money", value: 75000, currency: "INR" },
                    used: { type: "Money", value: 0, currency: "INR" },
                  },
                ],
                authorization_required: true,
                authorization_supporting: [
                  {
                    code: "MEDICAL_CERTIFICATE",
                    display: "Medical Certificate",
                  },
                  { code: "ESTIMATE", display: "Estimated bill" },
                ],
              },
              {
                sequence: 2,
                category: { code: "ROOM", display: "Room rent" },
                product_or_service: {
                  code: "WARD-PVT",
                  display: "Private Ward",
                },
                excluded: false,
                benefit: [
                  {
                    type: { code: "room-rent", display: "Room Rent Limit" },
                    allowed: { type: "Money", value: 5000, currency: "INR" },
                    used: { type: "Money", value: 0, currency: "INR" },
                  },
                ],
                authorization_required: false,
                authorization_supporting: [],
              },
            ],
          },
        ],
        errors: [],
      },
    };
  },

  // ─── Preauthorization ───────────────────────────────────────────────────────
  preparePreauth: async (params = {}) => {
    await delay(800);
    return {
      claim_id: params.claim_id || 101,
      payer_code: params.payer_code || "1518@hcx",
      policy_number: params.policy_number || "POL-91711234567890-2026",
      patient: {
        id: 12,
        name: "Arjun Mehta",
        gender: "male",
        dob: "2020-01-01",
        abha: "91-7112-3456-7890",
        member_id: "MEMB-123",
      },
      admission_date: "2026-05-04",
      inpatient: true,
      urgent: false,
      diagnoses: [
        {
          code: "K80.20",
          name: "Calculus of gallbladder",
          primary: true,
          on_admission: true,
        },
      ],
      procedures: [
        {
          code: "47562",
          name: "Laparoscopic cholecystectomy",
          date: "2026-05-04",
        },
      ],
      items: [
        {
          service_code: "47562",
          service_name: "Laparoscopic cholecystectomy",
          category: "SE",
          service_start_date: "2026-05-04",
          quantity: 1,
          unit_price: 50000,
          net_amount: 50000,
          care_team_sequence: [1],
          diagnosis_sequence: [1],
          procedure_sequence: [1],
        },
      ],
      care_team: [
        {
          doc_id: "DOC-1",
          doc_name: "Dr. Meera Rao",
          speciality: "MS",
          speciality_display: "General Surgery",
          registration_no: "MCI-12345",
        },
      ],
      supporting_documents: [
        {
          category: "admission_note",
          name: "Admission Note",
          code: "ADM_NOTE",
          event_date: "2026-05-04",
          url: "https://hospital.example/records/101/admission-note.pdf",
        },
        {
          category: "investigation",
          name: "Investigation Report",
          code: "INVESTIGATION_REPORT",
          event_date: "2026-05-04",
          url: null,
        },
      ],
      total_amount: 50000,
      eligibility: {
        correlation_id: "9e5c60bf-4014-4b72-a2f0-1fe4f9a75e61",
        status: "complete",
        outcome: "complete",
        inforce: true,
        auth_required: true,
        insurance_items: [],
        errors: [],
      },
      missing_fields: [],
    };
  },

  submitPreauth: async (data) => {
    await delay(1000);
    return {
      correlation_id: "5c2a6db0-b4c1-47e2-bf6d-3db2ed6e8f11",
      preauth_ref: null,
      policy_number: data.policy_number || "POL-91711234567890-2026",
      status: "submitted",
      message: "Preauthorization request submitted",
    };
  },

  submitPreauthEnhancement: async (data) => {
    await delay(1000);
    return {
      correlation_id: "7a3b9c21-f1e2-4d5a-b6c7-8e9f0a1b2c3d",
      preauth_ref: null,
      policy_number: data.policy_number || "POL-91711234567890-2026",
      status: "submitted",
      message: "Pre-authorization enhancement submitted",
    };
  },

  preparePreauthEnhancement: async (params = {}) => {
    await delay(800);
    return {
      claim_id: params.claim_id || 101,
      preauth_ref: "PA-2026-00001",
      missing_fields: [],
    };
  },

  resubmitPreauth: async (data) => {
    await delay(1000);
    return {
      correlation_id: "8d2fd8d9-c8a1-4f3c-9ac8-8de7bdf95c44",
      preauth_ref: null,
      policy_number: data.policy_number || "POL-91711234567890-2026",
      status: "submitted",
      message: "Preauthorization resubmission submitted",
    };
  },

  respondPreauthQuery: async (data) => {
    await delay(1000);
    return {
      correlation_id: "92718f2b-c9fb-4cfd-88de-1028f92735b2",
      preauth_ref: null,
      policy_number: data.policy_number || "POL-91711234567890-2026",
      status: "submitted",
      message: "Preauthorization query response submitted",
    };
  },

  cancelPreauth: async (data) => {
    await delay(800);
    return {
      correlation_id: "b05fd989-e852-4542-8476-e6ac99e709cb",
      preauth_ref: data.preauth_ref || "PA-2026-00001",
      policy_number: null,
      status: "submitted",
      message: "Preauthorization cancellation submitted",
    };
  },

  // ─── Specific Coverage Eligibility APIs ─────────────────────────────────────
  requestInsurancePlan: async (data) => {
    await delay(800);
    return { correlation_id: "mock-ins-plan-123", status: "submitted" };
  },
  getInsurancePlanStatus: async (correlation_id) => {
    await delay(800);
    return { correlation_id, status: "complete" };
  },
  checkCoverage: async (data) => {
    await delay(800);
    return { correlation_id: "mock-cov-123", status: "submitted" };
  },
  getAuthRequirements: async (data) => {
    await delay(800);
    return { correlation_id: "mock-auth-req-123", status: "submitted" };
  },
  validateCoverage: async (data) => {
    await delay(800);
    return {
      correlation_id: "val-1234-5678",
      status: "submitted",
    };
  },

  checkBenefits: async (data) => {
    await delay(800);
    return {
      correlation_id: "ben-1234-5678",
      status: "submitted",
    };
  },

  getCoverageEligibilityStatus: async (correlation_id) => {
    await delay(1500);
    return {
      correlation_id,
      status: "complete",
      outcome: "complete",
      disposition: "Eligible",
      inforce: true,
      auth_required: true,
      insurance_items: [],
    };
  },

  getPreauthStatus: async (correlation_id) => {
    await delay(1500);
    return {
      correlation_id,
      claim_id: 101,
      workflow: "preauth",
      status: "complete",
      decision: "APPROVED",
      preauth_ref: "PA-2026-00001",
      items: [
        {
          sequence: 1,
          detail_sequence: 1,
          adjudication: {
            submitted: { value: 50000, currency: "INR" },
            eligible: { value: 45000, currency: "INR" },
            benefit: { value: 40000, currency: "INR" },
            copay: { value: 5000, currency: "INR" },
            deductible: null,
          },
          notes: [1],
        },
      ],
      totals: {
        submitted: { value: 50000, currency: "INR" },
        eligible: { value: 45000, currency: "INR" },
        benefit: { value: 40000, currency: "INR" },
        copay: { value: 5000, currency: "INR" },
      },
      errors: [],
      process_notes: [
        {
          number: 1,
          type: "display",
          text: "Preauth approved for package amount. Proceed to claim submission after discharge.",
          language: "en",
        },
      ],
    };
  },

  // ─── Claims ─────────────────────────────────────────────────────────────────
  prepareClaimDraft: async (params = {}) => {
    await delay(800);
    return {
      claim_id: params.claim_id || 101,
      payer_code: "1518@hcx",
      policy_number: "POL-91711234567890-2026",
      preauth_ref: "PA-2026-00001",
      preauth_status: "APPROVED",
      status: "submitted",
      admission_date: "2026-05-04",
      discharge_date: "2026-05-07",
      total_amount: 50000,
      patient: {
        id: 12,
        name: "Arjun Mehta",
        gender: "male",
        dob: "2020-01-01",
      },
      diagnoses: [
        {
          code: "K80.20",
          name: "Calculus of gallbladder",
          primary: true,
          on_admission: true,
        },
      ],
      procedures: [{ code: "47562", name: "Laparoscopic cholecystectomy" }],
      items: [
        {
          service_code: "PKG-LAP-CHOLE",
          service_name: "Laparoscopic cholecystectomy package",
          category: "SE",
          quantity: 1,
          unit_price: 50000,
          net_amount: 50000,
        },
      ],
      care_team: [
        {
          doc_id: 501,
          doc_name: "Dr. Meera Rao",
          speciality: "MS",
          registration_no: "MCI-12345",
          role: "primary",
        },
      ],
      supporting_documents: [
        {
          category: "discharge_summary",
          name: "Discharge Summary",
          code: "DISCHARGE_SUMMARY",
          event_date: "2026-05-07",
          url: "https://hospital.example/records/101/discharge.pdf",
        },
        {
          category: "final_bill",
          name: "Final Bill",
          code: "FINAL_BILL",
          event_date: "2026-05-07",
          url: "https://hospital.example/records/101/final-bill.pdf",
        },
      ],
      missing_fields: [],
    };
  },

  patchCashlessPatientContext: async (cashless_case_id, data) => {
    await delay(800);
    return {
      status: "success",
      message: "Patient context updated",
      missing_fields: [],
    };
  },

  patchPatientContext: async (claim_id, data) => {
    await delay(800);
    return {
      status: "success",
      message: "Patient context updated",
      missing_fields: [],
    };
  },

  submitDischargeClaim: async () => {
    await delay(1000);
    return {
      correlation_id: "f3be6a19-f3f4-4624-8f1d-384a37cead9d",
      status: "submitted",
      message: "Discharge claim submitted (wf=14)",
    };
  },

  submitFinalClaim: async () => {
    await delay(1000);
    return {
      correlation_id: "0e20b352-c4b7-49fa-9246-a8357d236f48",
      status: "submitted",
      message: "Claim submitted for adjudication",
    };
  },

  respondClaimQuery: async () => {
    await delay(800);
    return {
      correlation_id: "abc123-claim-query-response",
      status: "submitted",
      message: "Claim query response submitted",
    };
  },

  resubmitClaim: async () => {
    await delay(800);
    return {
      correlation_id: "abc123-claim-resubmit",
      status: "submitted",
      message: "Claim resubmitted",
    };
  },

  getClaimStatus: async (correlation_id) => {
    await delay(1200);
    return {
      correlation_id,
      claim_id: 101,
      workflow: "claim",
      submitted_at: "2026-05-11T11:30:00+05:30",
      status: "complete",
      decision: "APPROVED",
      approved_amount: 40000,
      payment_status: null,
      items: [
        {
          sequence: 1,
          adjudication: {
            submitted: { value: 50000, currency: "INR" },
            benefit: { value: 40000, currency: "INR" },
          },
        },
      ],
      totals: {
        submitted: { value: 50000, currency: "INR" },
        benefit: { value: 40000, currency: "INR" },
      },
      errors: [],
      process_notes: [],
    };
  },

  // ─── Reprocess ──────────────────────────────────────────────────────────────
  submitReprocess: async () => {
    await delay(1000);
    return {
      correlation_id: "6928d2cd-81f6-48b0-9c62-bf8f5a311847",
      status: "submitted",
      message: "Reprocess request submitted",
    };
  },

  getReprocessStatus: async (correlation_id) => {
    await delay(1200);
    return {
      correlation_id,
      claim_id: 101,
      status: "complete",
      decision: "APPROVED",
      errors: [],
      process_notes: [
        {
          number: 1,
          type: "display",
          text: "Appeal accepted. Approved amount revised to ₹45,000.",
          language: "en",
        },
      ],
    };
  },

  // ─── Payment ────────────────────────────────────────────────────────────────
  searchPaymentStatus: async () => {
    await delay(700);
    return {
      status: "found",
      latest_stage: "PAYMENT_SETTLED",
      settled: true,
      total_events: 2,
      events: [
        {
          payment_reference: "PAY-2026-00001",
          claim_reference: "CLM-101",
          payment_stage: "PAYMENT_INITIATED",
          notice_amount: 40000,
          gross_amount: 40000,
          tds_amount: 400,
          net_payment_amount: 39600,
          payment_date: "2026-05-14",
          utr: null,
          acknowledgement_status: "submitted",
          acknowledgement_error: null,
        },
        {
          payment_reference: "PAY-2026-00001",
          claim_reference: "CLM-101",
          payment_stage: "PAYMENT_SETTLED",
          notice_amount: 40000,
          gross_amount: 40000,
          tds_amount: 400,
          net_payment_amount: 39600,
          payment_date: "2026-05-15",
          utr: "UTR123456789",
          acknowledgement_status: "submitted",
          acknowledgement_error: null,
        },
      ],
    };
  },

  getPaymentStatus: async (correlation_id) => {
    await delay(600);
    return {
      status: "found",
      latest_stage: "PAYMENT_SETTLED",
      settled: true,
      total_events: 1,
      events: [
        {
          payment_reference: "PAY-2026-00001",
          claim_reference: "CLM-101",
          payment_stage: "PAYMENT_SETTLED",
          notice_amount: 40000,
          gross_amount: 40000,
          tds_amount: 400,
          net_payment_amount: 39600,
          payment_date: "2026-05-15",
          utr: "UTR123456789",
          acknowledgement_status: "submitted",
          acknowledgement_error: null,
        },
      ],
    };
  },

  acknowledgePayment: async () => {
    await delay(800);
    return {
      correlation_id: "ack-" + Date.now(),
      status: "submitted",
      message: "Payment acknowledgement submitted",
    };
  },

  // ─── Tasks ──────────────────────────────────────────────────────────────────
  listTasks: async (params = {}) => {
    await delay(600);
    return {
      total_count: 3,
      limit: params.limit || 20,
      offset: params.offset || 0,
      tasks: [
        {
          task_id: "T-201",
          claim_id: 101,
          cashless_case_id: 4,
          child_id: 12,
          workflow: "preauth",
          task_type: "respond_query",
          title: "Respond to preauth query from Sample Payer",
          description:
            "Payer has raised a query requesting investigation report and clinical justification.",
          priority: "urgent",
          status: "pending",
          required_documents: [
            { code: "INVESTIGATION_REPORT", display: "Investigation Report" },
            { code: "MEDICAL_CERTIFICATE", display: "Medical Certificate" },
          ],
          action: {
            label: "Respond to Query",
            endpoint: "/nhcx/api/v1/insurance/cashless/preauth/query-response",
            payload_hint: { claim_id: 101 },
          },
          created_at: "2026-05-12T10:00:00+05:30",
          updated_at: "2026-05-12T10:00:00+05:30",
        },
        {
          task_id: "T-202",
          claim_id: 102,
          cashless_case_id: 5,
          child_id: 19,
          workflow: "payment",
          task_type: "acknowledge_payment",
          title: "Retry payment acknowledgement for Claim #102",
          description: "Auto-acknowledgement failed. Manual retry required.",
          priority: "high",
          status: "pending",
          required_documents: [],
          action: {
            label: "Retry Acknowledgement",
            endpoint: "/nhcx/api/v1/insurance/cashless/payment/acknowledge",
            payload_hint: { payment_reference: "PAY-2026-00001" },
          },
          created_at: "2026-05-13T08:30:00+05:30",
          updated_at: "2026-05-13T08:30:00+05:30",
        },
        {
          task_id: "T-203",
          claim_id: 103,
          cashless_case_id: 6,
          child_id: 25,
          workflow: "claim",
          task_type: "submit_documents",
          title: "Submit final bill for Riya Sharma claim",
          description:
            "Final invoice is available. Please submit the final claim for adjudication.",
          priority: "normal",
          status: "pending",
          required_documents: [{ code: "FINAL_BILL", display: "Final Bill" }],
          action: {
            label: "Submit Claim",
            endpoint: "/nhcx/api/v1/insurance/cashless/claims/submit",
            payload_hint: { claim_id: 103 },
          },
          created_at: "2026-05-14T12:00:00+05:30",
          updated_at: "2026-05-14T12:00:00+05:30",
        },
      ],
    };
  },

  getTask: async (task_id) => {
    await delay(400);
    return {
      task_id,
      claim_id: 101,
      cashless_case_id: 4,
      child_id: 12,
      workflow: "preauth",
      task_type: "respond_query",
      title: "Respond to preauth query from Sample Payer",
      description:
        "Payer has raised a query requesting investigation report and clinical justification.",
      priority: "urgent",
      status: "pending",
      required_documents: [
        { code: "INVESTIGATION_REPORT", display: "Investigation Report" },
        { code: "MEDICAL_CERTIFICATE", display: "Medical Certificate" },
      ],
      action: {
        label: "Respond to Query",
        endpoint: "/nhcx/api/v1/insurance/cashless/preauth/query-response",
        payload_hint: { claim_id: 101 },
      },
      metadata: {
        decision: "QUERIED",
        errors: [],
        payer_notes:
          "Clinical justification required for procedure code 47562.",
      },
      created_at: "2026-05-12T10:00:00+05:30",
      updated_at: "2026-05-12T10:00:00+05:30",
    };
  },

  completeTask: async (task_id, data = {}) => {
    await delay(500);
    return {
      task_id,
      status: "completed",
      note: data.note || "",
      updated_at: new Date().toISOString(),
    };
  },

  // ─── Communications ─────────────────────────────────────────────────────────
  listCommunications: async (params = {}) => {
    await delay(600);
    return {
      total_count: 2,
      limit: params.limit || 20,
      offset: params.offset || 0,
      communications: [
        {
          correlation_id: "comm-abc-001",
          payer_code: "1518@hcx",
          reason_code: "tatquery",
          reason_display: "TAT Query",
          topic_display: "Pre-authorization TAT Exceeded",
          priority: "high",
          claim_reference: "CLM-101",
          sent_at: "2026-05-13T09:00:00+05:30",
          acknowledged: true,
          acknowledged_at: "2026-05-13T09:01:00+05:30",
          pending_tasks: [],
        },
        {
          correlation_id: "comm-abc-002",
          payer_code: "2044@hcx",
          reason_code: "additionalinfo",
          reason_display: "Additional Information Request",
          topic_display: "Additional documents requested",
          priority: "normal",
          claim_reference: "CLM-102",
          sent_at: "2026-05-14T11:30:00+05:30",
          acknowledged: false,
          acknowledged_at: null,
          pending_tasks: [
            {
              task_id: "T-301",
              task_type: "review_communication",
              title: "Review payer communication",
              priority: "normal",
            },
          ],
        },
      ],
    };
  },

  getCommunicationStatus: async (correlation_id) => {
    await delay(500);
    return {
      correlation_id,
      payer_code: "1518@hcx",
      reason_code: "tatquery",
      reason_display: "TAT Query",
      topic_display: "Pre-authorization TAT Exceeded",
      priority: "high",
      claim_reference: "CLM-101",
      sent_at: "2026-05-13T09:00:00+05:30",
      acknowledged: true,
      acknowledged_at: "2026-05-13T09:01:00+05:30",
      payload: [
        {
          content_type: "text",
          content:
            "The pre-authorization for claim CLM-101 has exceeded the standard TAT of 2 hours. Please provide an update on the status.",
        },
      ],
      pending_tasks: [],
    };
  },

  // ─── Gateway Status Recovery ─────────────────────────────────────────────────
  requestGatewayStatus: async (data) => {
    await delay(500);
    return {
      correlation_id: data.correlation_id,
      status: "submitted",
      message: "NHCX gateway status request submitted",
    };
  },

  // ─── Facilities Admin ───────────────────────────────────────────────────────
  listFacilities: async (params = {}) => {
    await delay(500);
    return { facilities: [] };
  },
  createFacility: async (data) => {
    await delay(500);
    return { status: "success", facility_code: data.facility_code };
  },
  getFacility: async (facility_code) => {
    await delay(500);
    return { facility_code, name: "Mock Facility" };
  },
  updateFacility: async (facility_code, data) => {
    await delay(500);
    return { status: "success", facility_code };
  },
  uploadFacilityKey: async (facility_code, data) => {
    await delay(500);
    return { status: "success" };
  },
};
