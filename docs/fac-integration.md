# FaultCost and FAC integration

## Boundary

FAC remains the system of record for quality inspections and quality records. FaultCost owns maintenance faults, technician assignments, maintenance timing, spare-part usage, downtime costs, and the fault/loss analysis derived from them. The systems exchange versioned events through FAC's approved API or Cloud Functions; mobile and web clients never connect directly to FAC's Firestore database.

The event contract is in `packages/fac_contract/v1/events.yaml`. The logical event names are defined there; actual Cloud Function names, URLs, request envelopes, claims, and deployed authentication must be mapped from the FAC source/API before any live connection is enabled. No endpoint or credential is assumed by this repository.

## Event flows

| Direction | Events | Purpose |
|---|---|---|
| FaultCost to FAC | `fault.opened`, `fault.closed`, `waste.recorded`, `part.replaced` | Link maintenance activity, downtime, waste, and replacements to quality records |
| FAC to FaultCost | `qc.defect.critical`, `qc.gate.rejected`, `qc.part.flagged` | Surface critical defects, rejected batches, and short-life part signals |

Events include stable IDs, UTC occurrence times, and an idempotency key. A receiving adapter records the outcome before acknowledging delivery, retries transient failures, and moves exhausted events to an operator-visible failed-event queue. Replayed events must not create duplicate faults or duplicate quality records.

## Security requirements

- Use the service-to-service identity and authorization mechanism already supported by FAC; do not put Firebase service-account credentials in Flutter, React, source control, or logs.
- Cloud Functions using a privileged Firebase Admin SDK bypass Firestore client security rules. Therefore the function must independently authenticate the caller, authorize the requested event, validate the full payload, constrain the affected record/path, and write an audit entry. Existing client Firestore rules remain in force for the FAC app but do not replace these server checks.
- Reject stale signed messages outside the contract replay window, and bind authentication to the exact event body.
- Never trust a client-supplied mapping from a quality record to a machine or part without validating it against configured asset mappings.
- Store only linked FAC record identifiers and the minimum event data needed for cost analysis in FaultCost. FAC remains authoritative for quality inspection detail.

## Implementation sequence

1. Inspect the FAC repository and its deployed API/Cloud Functions, Firestore data shapes, rules, service identities, and existing tests.
2. Confirm event ownership, identifiers, retry behavior, authentication, and machine/part mapping with the FAC maintainer; update the versioned contract before coding transport adapters.
3. Implement an outbox and idempotent event processor in FaultCost, plus an adapter that calls only the approved FAC surface. Keep event persistence and retries transactional; Redis is not required for the initial local setup.
4. Add contract tests against FAC-compatible mocks, then integration tests against a non-production FAC environment. Do not enable production writes until both sides pass the agreed contract tests.

## Current limitation

This repository does not contain FAC source, a deployed API specification, a non-production endpoint, or service credentials. The contract is an integration proposal, not proof of connectivity. Production integration requires the FAC API/source and approved environment configuration; missing values must remain explicit rather than being guessed.
