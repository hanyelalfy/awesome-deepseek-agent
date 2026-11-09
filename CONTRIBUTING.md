# Contributing to FaultCost

FaultCost is being developed as a safety-conscious maintenance and cost-analysis system. Changes to time accounting, authorization, event delivery, or financial metrics need tests and a clear statement of their assumptions.

## Before changing behavior

- Read `docs/architecture.md` and `docs/fac-integration.md`.
- Keep production downtime separate from department/technician responsibility time.
- Do not use client-side checks as authorization.
- Do not add credentials, production data, or undocumented FAC endpoints.
- Do not publish a composite loss coefficient until its formula and standards are approved.

## Validation

Run the relevant checks from the package being changed:

```powershell
cd server\fault_cost_server
dart pub get
dart format --output=none --set-exit-if-changed lib test
dart analyze
dart test
```

For Flutter, web-admin, and integration packages, use the commands in that package's README after its scaffold and lockfile are added. Do not claim a package is validated if its toolchain or required FAC test environment is unavailable.

## Change expectations

- Add domain and authorization tests for new fault transitions or permissions.
- Preserve idempotency for retried writes and incoming FAC events.
- Keep externally supplied values validated at the server boundary.
- Document any change to the FAC contract in its versioned contract file and add contract tests.
- Keep mock/demo data clearly labeled and separate from production data.
