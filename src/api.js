const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const api = {
  // Dashboard
  getDashboardStats: async () => {
    await delay(500);
    return {
      claims: {
        total: 18,
        pending: 6,
        partial: 2,
        complete: 9,
        failed: 1,
        preauth_pending: 4
      },
      patients: {
        with_claims: 13
      }
    };
  },

  // Child / Patient Registry
  searchChildren: async () => {
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
            case_id: 4,
            claim_id: 101,
            status: "pending",
            current_step: "insurance_and_eligibility",
            payer_code: "1518@hcx",
            policy_number: "POL-91711234567890-2026",
            preauth_status: "pending",
            created_at: "2026-05-04T10:35:00+05:30"
          }
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
            case_id: 5,
            claim_id: 102,
            status: "complete",
            current_step: "preauth_ready",
            payer_code: "2044@hcx",
            policy_number: "POL-ALT-2026",
            preauth_status: "approved",
            created_at: "2026-05-04T11:05:00+05:30"
          }
        }
      ]
    };
  },

  // Payer Search
  searchPayers: async (params = {}) => {
    await delay(400);
    const allPayers = [
      { participant_code: "1518@hcx", name: "Sample Payer", scheme_type: "PMJAY", status: "active" },
      { participant_code: "2044@hcx", name: "Star Health & Allied", scheme_type: "Retail", status: "active" },
      { participant_code: "3011@hcx", name: "HDFC ERGO", scheme_type: "Corporate", status: "active" },
      { participant_code: "4022@hcx", name: "Universal Life", scheme_type: "Public Health", status: "active" }
    ];
    if (params.name) {
      return allPayers.filter(p => p.name.toLowerCase().includes(params.name.toLowerCase()));
    }
    return allPayers;
  },

  // Policy Fetch
  fetchPolicies: async (data) => {
    await delay(1000);
    return {
      status: "success",
      data: {
        patient_id: data.patientId,
        payer_code: data.payerCode,
        policies: [
          {
            policyNumber: "POL-91711234567890-2026",
            productName: "GeneralHealth-2026",
            payerId: data.payerCode,
            payerName: "Sample Payer",
            status: "active",
            sumInsured: 500000,
            currency: "INR",
            effectiveFrom: "2026-01-01",
            effectiveTo: "2026-12-31"
          },
          {
            policyNumber: "POL-ALT-2026",
            productName: "Family Floater Plus",
            payerId: data.payerCode,
            payerName: "Sample Payer",
            status: "active",
            sumInsured: 300000,
            currency: "INR",
            effectiveFrom: "2026-01-01",
            effectiveTo: "2026-12-31"
          }
        ]
      }
    };
  },

  // Cashless Preparation
  prepareCashless: async (data) => {
    await delay(800);
    return {
      case_id: 4,
      claim_id: data.claim_id,
      child_id: data.child_id,
      payer_code: "1518@hcx",
      policy_number: data.policyNumber,
      status: "pending",
      current_step: "insurance_and_eligibility",
      next_actions: ["refresh"],
      procedures: {
        source: "claim_db",
        items: [
          { category: "SE", code: "47562", name: "Laparoscopic cholecystectomy" }
        ]
      },
      insurance_plan: {
        status: "pending",
        correlation_id: "550e8400-e29b-41d4-a716-446655440000"
      },
      coverage_eligibility: {
        status: "pending",
        correlation_id: "9e5c60bf-4014-4b72-a2f0-1fe4f9a75e61"
      }
    };
  },

  getCashlessStatus: async (caseId) => {
    await delay(1000);
    // Simulate completion on the second poll
    return {
      case_id: caseId,
      claim_id: 101,
      child_id: 12,
      status: "complete",
      current_step: "preauth_ready",
      next_actions: ["prepare_preauth"],
      procedures: {
        source: "claim_db",
        items: [
          { category: "SE", code: "47562", name: "Laparoscopic cholecystectomy" }
        ]
      },
      insurance_plan: {
        status: "complete",
        correlation_id: "550e8400-e29b-41d4-a716-446655440000",
        plan_details: {
          name: "GeneralHealth-2026",
          status: "active"
        },
        inclusions: [
          { code: "ROOM", name: "Room rent" },
          { code: "ICU", name: "ICU Charges" }
        ],
        exclusions: [
          { code: "COSMETIC", name: "Cosmetic surgery" },
          { code: "DENTAL", name: "Routine Dental" }
        ],
        pricing: {
          sum_insured: 500000,
          currency: "INR"
        },
        document_requirements: [
          { name: "Admission note" },
          { name: "Doctor prescription" }
        ],
        raw_payload: {
          resourceType: "InsurancePlan"
        }
      },
      coverage_eligibility: {
        status: "complete",
        correlation_id: "9e5c60bf-4014-4b72-a2f0-1fe4f9a75e61",
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
                productOrService: { code: "47562", display: "Laparoscopic cholecystectomy" },
                excluded: false,
                benefit: [
                  { 
                    type: { code: "benefit", display: "Benefit Limit" },
                    allowed: { type: "Money", value: 75000, currency: "INR" },
                    used: { type: "Money", value: 0, currency: "INR" }
                  }
                ],
                authorizationRequired: true,
                authorizationSupporting: [
                  { code: "MEDICAL_CERTIFICATE", display: "Medical Certificate" },
                  { code: "ESTIMATE", display: "Estimated bill" }
                ]
              },
              {
                sequence: 2,
                category: { code: "ROOM", display: "Room rent" },
                productOrService: { code: "WARD-PVT", display: "Private Ward" },
                excluded: false,
                benefit: [
                  { 
                    type: { code: "room-rent", display: "Room Rent Limit" },
                    allowed: { type: "Money", value: 5000, currency: "INR" },
                    used: { type: "Money", value: 0, currency: "INR" }
                  }
                ],
                authorizationRequired: false
              }
            ]
          }
        ],
        errors: []
      }
    };
  },

  // Preauthorization
  preparePreauth: async (params = {}) => {
    await delay(800);
    return {
      claim_id: params.claim_id,
      payer_code: params.payer_code,
      policy_number: params.policyNumber,
      patient: {
        id: 12,
        name: "Arjun Mehta",
        gender: "male",
        dob: "2020-01-01"
      },
      admission_date: "2026-05-04",
      inpatient: true,
      urgent: false,
      diagnoses: [
        { code: "K80.20", name: "Calculus of gallbladder", primary: true, on_admission: true }
      ],
      procedures: [
        { code: "47562", name: "Laparoscopic cholecystectomy", date: "2026-05-04" }
      ],
      items: [
        { service_code: "47562", service_name: "Laparoscopic cholecystectomy", category: "SE", quantity: 1, unit_price: 50000, net_amount: 50000 }
      ],
      total_amount: 50000
    };
  },

  submitPreauth: async () => {
    await delay(1000);
    return {
      correlation_id: "5c2a6db0-b4c1-47e2-bf6d-3db2ed6e8f11",
      status: "submitted",
      message: "Preauthorization request submitted"
    };
  },

  getPreauthStatus: async (correlationId) => {
    await delay(1500);
    return {
      correlation_id: correlationId,
      claim_id: 101,
      status: "complete",
      decision: "APPROVED",
      preauth_ref: "PA-2026-00001",
      errors: []
    };
  }
};
