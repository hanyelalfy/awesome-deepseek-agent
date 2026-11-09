# FaultCost architecture

## Ownership and service boundaries

- **FaultCost** owns maintenance fault records, departments and technician assignments, non-overlapping stage intervals, spare-part requests, obstacles, waste costs, and cost calculations.
- **FAC** owns quality inspections, defects, and quality records. The systems exchange only the versioned events in `packages/fac_contract/v1/events.yaml`.
- **Firebase Cloud Functions v2** is the trusted boundary for authorization, state transitions, assignment transactions, financial calculations, audit records, and future FAC event delivery.
- **Firebase Authentication** signs users in; server-side Functions require role custom claims. UI role checks only control what is shown and never grant permission.
- **React** is the web client. Firestore Security Rules deny client reads and writes; clients use callable Functions for data operations.
- **Firebase Hosting** serves the React single-page app.

## Fault timing and state

A fault begins in `assignmentWait`; it remains there while the required technicians are unavailable. Assignment closes that interval and opens `response`. Arrival starts diagnosis, repair and parts waiting can alternate, and obstacles pause the active stage rather than overlap it. Testing and cost-monitor approval are separate stages. Closing is permitted only after testing and a root-cause code have been recorded and a cost monitor has approved the closure.

The sum of stage intervals is bounded by the reported-to-closed downtime. Assignment waiting is part of production downtime, but is not charged to the department or technician. Priority uses `severity × machine criticality`; ties are FIFO. A manager override must include an audit reason.

## Loss calculations

The domain exposes downtime minutes, stage durations, downtime cost, and optional comparisons with approved standard downtime and standard fault cost. Missing standards yield missing comparison factors instead of invented defaults. Recurrence and severity are exposed as separate factors. The proposed composite in the source materials is not treated as an approved accounting formula and is not calculated.

## Persistence, transactions, and audit

Cloud Functions use Firestore transactions for fault creation, technician availability, idempotency, and audit-head updates. When a technician becomes free, the highest-priority waiting fault in their department is assigned inside the same transaction. Firestore indexes are declared in `firestore.indexes.json`; the Firebase Emulator Suite supports isolated local testing.

- Firestore client rules deny every direct read/write, including for signed-in administrators; all access is mediated by callable Functions.
- Functions require Firebase authentication and server-verified role claims; technician actions are also checked against the assigned technician and department.
- Idempotency keys are hashed before use as Firestore document IDs and bound to the request payload.
- Fault/shift audit events are appended in the same Firestore transaction as the state change, with a SHA-256 chain head.
- Cloud Functions use Firebase Admin privileges, which bypass Firestore rules. Authorization and input validation in each function are therefore mandatory.

## Current implementation boundary

The current service covers opening faults, priority-ordered technician assignment/queues, stage transitions, role checks, cost components, audit-chain entries, and listing active faults. Firebase project creation, account provisioning, production deployment, offline mobile clients, cost approval, and live FAC transport still require environment setup or follow-up implementation. Only the pure domain suite and Firestore rule suite are configured; no production data is included.
