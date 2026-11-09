# Contributing to FaultCost

FaultCost is being developed as a safety-conscious maintenance and cost-analysis system. Changes to time accounting, authorization, event delivery, or financial metrics need tests and a clear statement of their assumptions.

## Before changing behavior

- Read `docs/architecture.md` and `docs/fac-integration.md`.
- Keep production downtime separate from department/technician responsibility time.
- Do not use client-side checks as authorization.
- Do not add credentials, production data, or undocumented FAC endpoints.
- Do not publish a composite loss coefficient until its formula and standards are approved.

## Validation

Run the relevant checks:

```powershell
npm install
npm run build
npm run test:domain
npm run test:rules
```

The Firestore rules suite uses only the local Firebase Emulator Suite with project ID `demo-faultcost-local`. Do not point tests at a production project.

## Change expectations

- Add domain and authorization tests for new fault transitions or permissions.
- Preserve idempotency for retried writes and incoming FAC events.
- Keep externally supplied values validated at the server boundary.
- Document any change to the FAC contract in its versioned contract file and add contract tests.
- Keep mock/demo data clearly labeled and separate from production data.
