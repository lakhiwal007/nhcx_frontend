# Claim Journey — Cashless Case, Start to End

A simple walkthrough of what happens to one cashless claim in NHCX, from
the patient being admitted to the payment landing in the hospital's account.

**Live app:** https://api-stage4.docterz.in/nhcx/service/ — walk through
any stage below yourself on the staging build.

Every claim moves through the same 6 stages, shown as the vertical rail on
the left of the case screen. Two extra stages can branch off after a
decision comes back, if needed.

```
1. Payer & Policy
2. Eligibility
3. Preauth
4. Decision ──┬── 4a. Enhancement (optional, if approved)
              └── 4b. Reprocess   (optional, if rejected)
5. Claim
6. Payment
```

---

## 1. Payer & Policy

Hospital staff pick the patient's insurer and their active policy for this
admission. This anchors the case — everything downstream (eligibility
checks, preauth, claim) is filed against this payer + policy.

## 2. Eligibility

The system checks with the payer whether this admission is actually covered:
is the policy active, does it cover this kind of care, and what's the
benefit limit. Any missing patient details (needed by the payer) get
flagged and resolved here too. If the payer doesn't respond in time, staff
can re-run the check.

## 3. Preauth

Staff review the draft pre-authorization request — the treatment, the
estimated cost — and submit it to the payer for approval before treatment
proceeds.

## 4. Decision

The case now waits on the payer. Three things can happen:

- **Approved / Partially approved** — treatment can go ahead (for the
  approved amount).
- **Queried** — the payer wants more information before deciding; staff
  respond to the query and the case waits again.
- **Rejected** — the request was turned down.

This is a waiting stage — while the payer is deciding, the task shows up in
the hospital's **Work Queue** so staff know it needs a response when
something changes, rather than someone having to keep checking.

### 4a. Enhancement *(only if approved)*

If the treatment turns out to need more than what was approved — an added
procedure, extra documents — staff can request an increase to the approved
amount without starting a new case.

### 4b. Reprocess *(only if rejected)*

If the payer rejected the request, staff can appeal or resubmit with
corrections, rather than the case being a dead end.

## 5. Claim

Once care is complete, staff submit the discharge summary and the final
itemized bill as the claim for the approved treatment.

## 6. Payment

The payer settles the claim. Staff reconcile the payment received (amount,
UTR reference) against what was billed, and the case is closed.

---

## A few things worth knowing

- **Nothing is lost if you close the tab.** Every stage is saved on the
  server against the case, not just in the browser — coming back later
  (even a different day) picks up exactly where it left off.
- **Waiting on the payer shows up as a task, not a blank screen.** Anything
  that needs a person to act next (respond to a query, submit the final
  claim, acknowledge a payment) becomes a Work Queue item.
- **A case can also be viewed read-only across all facilities** by an
  admin — but only one facility can act on and submit a given case.
