import { createHash } from "node:crypto";

export const DEPARTMENTS = [
  "loading",
  "sorting",
  "generalMaintenance",
  "shanfara",
  "electrical",
] as const;

export type Department = (typeof DEPARTMENTS)[number];

export const FAULT_STAGES = [
  "assignmentWait",
  "response",
  "diagnosis",
  "partWait",
  "repair",
  "obstacle",
  "testing",
  "closureReview",
] as const;

export type FaultStage = (typeof FAULT_STAGES)[number];

export interface StageInterval {
  stage: FaultStage;
  startedAt: number;
  endedAt?: number;
  reasonCode?: string;
  responsibleTeam?: string;
}

export interface QueueFault {
  id: string;
  department: Department;
  status: string;
  priorityScore: number;
  reportedAt: number;
}

export interface QueueTechnician {
  uid: string;
  department: Department;
  skillLevel: number;
  isAvailable: boolean;
  onShift: boolean;
}

export function parseDepartment(value: unknown): Department | undefined {
  return typeof value === "string" &&
    (DEPARTMENTS as readonly string[]).includes(value)
    ? (value as Department)
    : undefined;
}

export function parseIdentifier(value: unknown, name: string): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > 128 ||
    value.includes("/")
  ) {
    throw new Error(`${name} must be a non-empty identifier of at most 128 characters.`);
  }
  return value;
}

export function parseSeverity(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 5) {
    throw new Error("severity must be an integer from 1 to 5.");
  }
  return value as number;
}

export function selectTechnician<T extends QueueTechnician>(
  candidates: readonly T[],
  department: Department,
): T | undefined {
  return [...candidates]
    .filter(
      (technician) =>
        technician.department === department &&
        technician.isAvailable &&
        technician.onShift &&
        technician.uid.trim().length > 0 &&
        Number.isInteger(technician.skillLevel) &&
        technician.skillLevel >= 1 &&
        technician.skillLevel <= 5,
    )
    .sort(
      (left, right) =>
        right.skillLevel - left.skillLevel || left.uid.localeCompare(right.uid),
    )[0];
}

export function selectNextFault<T extends QueueFault>(
  faults: readonly T[],
  department: Department,
): T | undefined {
  return [...faults]
    .filter(
      (fault) =>
        fault.status === "pendingWait" && fault.department === department,
    )
    .sort(
      (left, right) =>
        right.priorityScore - left.priorityScore ||
        left.reportedAt - right.reportedAt ||
        left.id.localeCompare(right.id),
    )[0];
}

export function transitionStage(
  intervals: readonly StageInterval[],
  nextStage: FaultStage,
  at: number,
  details: Pick<StageInterval, "reasonCode" | "responsibleTeam"> = {},
): StageInterval[] {
  if (!Number.isSafeInteger(at) || at < 0) {
    throw new Error("Stage timestamp must be a non-negative integer.");
  }
  const active = intervals.at(-1);
  if (!active || active.endedAt !== undefined || at < active.startedAt) {
    throw new Error("There must be one active interval and time cannot move backwards.");
  }
  const closed = { ...active, endedAt: at };
  return [...intervals.slice(0, -1), closed, { stage: nextStage, startedAt: at, ...details }];
}

export function finishStage(
  intervals: readonly StageInterval[],
  at: number,
): StageInterval[] {
  if (!Number.isSafeInteger(at) || at < 0) {
    throw new Error("Stage timestamp must be a non-negative integer.");
  }
  const active = intervals.at(-1);
  if (!active || active.endedAt !== undefined || at < active.startedAt) {
    throw new Error("There must be one active interval and time cannot move backwards.");
  }
  return [...intervals.slice(0, -1), { ...active, endedAt: at }];
}

export function elapsedMinutes(start: number, end: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error("Time interval is invalid.");
  }
  return (end - start) / 60_000;
}

export interface CostInputs {
  costPerDowntimeMinute?: number;
  spareParts?: number;
  waste?: number;
  labor?: number;
  rework?: number;
}

export function applySparePartCost(
  existing: CostInputs,
  quantity: number,
  unitCost: number,
): CostInputs {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Spare part quantity must be a finite positive number.");
  }
  if (!Number.isFinite(unitCost) || unitCost < 0) {
    throw new Error("Spare part unit cost must be a finite non-negative number.");
  }
  const line = quantity * unitCost;
  if (!Number.isFinite(line)) {
    throw new Error("Spare part cost must be finite.");
  }
  const previous = existing.spareParts ?? 0;
  if (!Number.isFinite(previous) || previous < 0) {
    throw new Error("Existing spareParts cost must be finite and non-negative.");
  }
  const total = previous + line;
  if (!Number.isFinite(total)) {
    throw new Error("Total spare part cost must be finite.");
  }
  return { ...existing, spareParts: total };
}

export function calculateCosts(
  downtimeMinutes: number,
  costs: CostInputs,
  approvedStandardDowntimeMinutes?: number,
  approvedStandardFaultCost?: number,
): {
  downtimeCost: number | null;
  totalCost: number | null;
  timeFactor: number | null;
  financialFactor: number | null;
} {
  if (!Number.isFinite(downtimeMinutes) || downtimeMinutes < 0) {
    throw new Error("Downtime must be finite and non-negative.");
  }
  const values = [
    costs.costPerDowntimeMinute,
    costs.spareParts,
    costs.waste,
    costs.labor,
    costs.rework,
  ];
  for (const value of values) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      throw new Error("Cost inputs must be finite non-negative values.");
    }
  }
  for (const standard of [
    approvedStandardDowntimeMinutes,
    approvedStandardFaultCost,
  ]) {
    if (standard !== undefined && (!Number.isFinite(standard) || standard <= 0)) {
      throw new Error("Approved standards must be finite positive values.");
    }
  }
  const downtimeCost =
    costs.costPerDowntimeMinute === undefined
      ? null
      : downtimeMinutes * costs.costPerDowntimeMinute;
  const totalCost =
    downtimeCost === null || values.slice(1).some((value) => value === undefined)
      ? null
      : downtimeCost +
        values.slice(1).reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return {
    downtimeCost,
    totalCost,
    timeFactor:
      approvedStandardDowntimeMinutes === undefined
        ? null
        : downtimeMinutes / approvedStandardDowntimeMinutes,
    financialFactor:
      approvedStandardFaultCost === undefined || totalCost === null
        ? null
        : totalCost / approvedStandardFaultCost,
  };
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function auditHash(
  previousHash: string | null,
  record: Readonly<Record<string, unknown>>,
): string {
  return sha256(
    JSON.stringify({
      previousHash,
      record: Object.fromEntries(
        Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
      ),
    }),
  );
}
