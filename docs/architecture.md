# FaultCost architecture

## Ownership and service boundaries

- **FaultCost** owns maintenance fault records, departments and technician assignments, non-overlapping stage intervals, spare-part requests, obstacles, waste costs, and cost calculations.
- **FAC** owns quality inspections, defects, and quality records. The systems exchange only the event data defined in `packages/fac_contract/v1/events.yaml`.
- **Serverpod** is the trusted boundary for authorization, state transitions, assignment transactions, financial calculations, audit records, and FAC event delivery.
- **Flutter** is the field client. It may queue operations locally while offline, but server authorization and server timestamps remain authoritative for synchronized records.
- **React** is the administrative and analytics client. Hiding an action in the UI is not a permission check.

## Fault timing and state

A fault begins in `assignmentWait`; it remains there while the required technicians are unavailable. Assignment closes that interval and opens `response`. Arrival starts diagnosis, repair and parts waiting can alternate, and obstacles pause the active stage rather than overlap it. Testing and cost-monitor approval are separate stages. Closing is permitted only after testing and a root-cause code have been recorded and a cost monitor has approved the closure.

The sum of stage intervals is bounded by the reported-to-closed downtime. Assignment waiting is part of production downtime, but is not charged to the department or technician. Any persistence implementation must update the fault, technician availability, interval, and audit/outbox records atomically.

Priority currently uses `severity × machine criticality`; ties are FIFO with a stable ID tie-breaker. This intentionally avoids an undocumented monetary normalizer. A manager override must include an audit reason.

## Loss calculations

The domain exposes downtime minutes, stage durations, downtime cost, and optional comparisons with approved standard downtime and standard fault cost. Missing standards yield missing comparison factors instead of invented defaults. Recurrence and severity are exposed as separate factors. The proposed composite in the source materials is not treated as an approved accounting formula and is not calculated in the current domain package.

## Persistence, transactions, and audit

The planned Serverpod service uses PostgreSQL, including Serverpod's embedded PostgreSQL for local development without Docker. Fault transitions, technician assignment, idempotency records, audit entries, and outbound event-outbox inserts must be committed transactionally. Audit events are append-only at the application/API boundary; production database privileges and backup/restore procedures still need to enforce and verify this guarantee.

Redis is not required for initial local operation. A database-backed priority query and outbox avoid adding a queue service before measured need. Any later Redis use must not replace the durable database state or idempotency records.

## Current implementation boundary

`server/fault_cost_server` currently contains a pure Dart domain package and tests for fault transitions, queue ordering, loss components, and basic access policy. It is not yet a running Serverpod service and does not provide persistent storage, HTTP endpoints, authentication, or deployed clients. These must be added before real factory data is entered.
