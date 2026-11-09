import { initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import {
  applySparePartCost,
  auditHash,
  calculateCosts,
  finishStage,
  parseDepartment,
  parseIdentifier,
  parseSeverity,
  sha256,
  selectTechnician,
  transitionStage,
  type CostInputs,
  type FaultStage,
  type QueueTechnician,
  type StageInterval,
} from "./domain.js";

initializeApp();
const db = getFirestore();
const functionRegion = "us-central1";

type UserRole =
  | "technician"
  | "costMonitor"
  | "warehouse"
  | "maintenanceManager"
  | "productionManager"
  | "administrator";

function requireRole(
  request: CallableRequest<unknown>,
  allowed: readonly UserRole[],
): { uid: string; role: UserRole } {
  const uid = request.auth?.uid;
  const role = request.auth?.token.role;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in is required.");
  }
  if (typeof role !== "string" || !allowed.includes(role as UserRole)) {
    throw new HttpsError("permission-denied", "This role cannot perform the operation.");
  }
  return { uid, role: role as UserRole };
}

function inputObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "Request data must be an object.");
  }
  return value as Record<string, unknown>;
}

function wrapValidation<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      "invalid-argument",
      error instanceof Error ? error.message : "Invalid request.",
    );
  }
}

function appendAudit(
  transaction: FirebaseFirestore.Transaction,
  entityId: string,
  actorId: string,
  action: string,
  details: Record<string, unknown>,
  previousHash: string | null,
): void {
  const headRef = db.doc(`auditHeads/${entityId}`);
  const eventRef = db.collection(`auditEvents/${entityId}/events`).doc();
  const now = Timestamp.now();
  const record = {
    eventId: eventRef.id,
    actorId,
    action,
    entityId,
    details,
    createdAtMillis: now.toMillis(),
  };
  const hash = auditHash(previousHash, record);
  transaction.create(eventRef, {
    ...record,
    previousHash,
    hash,
    createdAt: FieldValue.serverTimestamp(),
  });
  transaction.set(headRef, {
    hash,
    eventId: eventRef.id,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

function beginStage(
  intervals: readonly StageInterval[],
  nextStage: FaultStage,
  at: number,
  details: Pick<StageInterval, "reasonCode" | "responsibleTeam"> = {},
): StageInterval[] {
  try {
    return transitionStage(intervals, nextStage, at, details);
  } catch (error) {
    throw new HttpsError(
      "failed-precondition",
      error instanceof Error ? error.message : "Invalid stage transition.",
    );
  }
}

function endStage(
  intervals: readonly StageInterval[],
  at: number,
): StageInterval[] {
  try {
    return finishStage(intervals, at);
  } catch (error) {
    throw new HttpsError(
      "failed-precondition",
      error instanceof Error ? error.message : "Invalid stage completion.",
    );
  }
}

function readCostInputs(value: unknown): CostInputs {
  if (value === null || value === undefined) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("data-loss", "Fault cost record is invalid.");
  }
  const raw = value as Record<string, unknown>;
  const costs: CostInputs = {};
  for (const key of [
    "costPerDowntimeMinute",
    "spareParts",
    "waste",
    "labor",
    "rework",
  ] as const) {
    if (raw[key] === undefined) continue;
    costs[key] = parseAmount(raw[key], key);
  }
  return costs;
}

function mergeCostInputs(
  existing: CostInputs,
  data: Record<string, unknown>,
  options: { allowSparePartsOverride?: boolean } = {},
): CostInputs {
  const next = { ...existing };
  if (data.costPerDowntimeMinute !== undefined) {
    next.costPerDowntimeMinute = parseAmount(
      data.costPerDowntimeMinute,
      "costPerDowntimeMinute",
    );
  }
  if (data.waste !== undefined) {
    next.waste = parseAmount(data.waste, "waste");
  }
  if (data.labor !== undefined) {
    next.labor = parseAmount(data.labor, "labor");
  }
  if (data.rework !== undefined) {
    next.rework = parseAmount(data.rework, "rework");
  }
  if (options.allowSparePartsOverride && data.spareParts !== undefined) {
    next.spareParts = parseAmount(data.spareParts, "spareParts");
  }
  return next;
}

function toTechnician(
  snapshot: QueryDocumentSnapshot,
): QueueTechnician | undefined {
  const data = snapshot.data();
  const department = parseDepartment(data.department);
  if (!department) return undefined;
  return {
    uid: snapshot.id,
    department,
    skillLevel: data.skillLevel,
    isAvailable: data.status === "available",
    onShift: data.onShift === true,
  };
}

function readIntervals(value: unknown): StageInterval[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpsError("data-loss", "Fault stage history is missing.");
  }
  return value.map((raw) => {
    if (raw === null || typeof raw !== "object") {
      throw new HttpsError("data-loss", "Fault stage history is invalid.");
    }
    const interval = raw as Record<string, unknown>;
    if (
      typeof interval.stage !== "string" ||
      !Number.isFinite(interval.startedAt instanceof Timestamp
        ? interval.startedAt.toMillis()
        : interval.startedAt)
    ) {
      throw new HttpsError("data-loss", "Fault stage history is invalid.");
    }
    const endedAt =
      interval.endedAt instanceof Timestamp
        ? interval.endedAt.toMillis()
        : interval.endedAt;
    return {
      stage: interval.stage as FaultStage,
      startedAt:
        interval.startedAt instanceof Timestamp
          ? interval.startedAt.toMillis()
          : (interval.startedAt as number),
      ...(endedAt === undefined ? {} : { endedAt: endedAt as number }),
      ...(typeof interval.reasonCode === "string" ? { reasonCode: interval.reasonCode } : {}),
      ...(typeof interval.responsibleTeam === "string"
        ? { responsibleTeam: interval.responsibleTeam }
        : {}),
    };
  });
}

function storeIntervals(intervals: readonly StageInterval[]): object[] {
  return intervals.map((interval) => ({
    ...interval,
    startedAt: Timestamp.fromMillis(interval.startedAt),
    ...(interval.endedAt === undefined
      ? {}
      : { endedAt: Timestamp.fromMillis(interval.endedAt) }),
  }));
}

function parseAmount(value: unknown, name: string, allowZero = true): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (allowZero ? value < 0 : value <= 0)
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${name} must be a finite ${allowZero ? "non-negative" : "positive"} number.`,
    );
  }
  return value;
}

export const openFault = onCall({ region: functionRegion }, async (request) => {
  const actor = requireRole(request, [
    "costMonitor",
    "maintenanceManager",
    "administrator",
  ]);
  const data = inputObject(request.data);
  const machineCode = wrapValidation(() => parseIdentifier(data.machineCode, "machineCode"));
  const department = parseDepartment(data.department);
  if (!department) {
    throw new HttpsError("invalid-argument", "A valid department is required.");
  }
  const severity = wrapValidation(() => parseSeverity(data.severity));
  const partCode =
    data.partCode === undefined || data.partCode === null
      ? null
      : wrapValidation(() => parseIdentifier(data.partCode, "partCode"));
  const idempotencyKey = wrapValidation(() =>
    parseIdentifier(data.idempotencyKey, "idempotencyKey"),
  );
  if (idempotencyKey.length < 16) {
    throw new HttpsError("invalid-argument", "idempotencyKey must contain at least 16 characters.");
  }
  const keyHash = sha256(idempotencyKey);
  const requestHash = JSON.stringify({ machineCode, partCode, department, severity });
  const idempotencyRef = db.doc(`idempotency/${keyHash}`);
  const faultRef = db.collection("faults").doc();
  const machineRef = db.collection("machines").doc(machineCode);

  return db.runTransaction(async (transaction) => {
    const [existingKey, machineSnapshot] = await Promise.all([
      transaction.get(idempotencyRef),
      transaction.get(machineRef),
    ]);
    if (existingKey.exists) {
      const previous = existingKey.data()!;
      if (previous.requestHash !== requestHash || typeof previous.faultId !== "string") {
        throw new HttpsError(
          "already-exists",
          "This idempotency key was already used for a different request.",
        );
      }
      return { faultId: previous.faultId, deduplicated: true };
    }
    if (!machineSnapshot.exists || machineSnapshot.data()?.active !== true) {
      throw new HttpsError("not-found", "Machine does not exist or is inactive.");
    }
    if (
      partCode !== null &&
      machineSnapshot.data()?.partCodes?.includes(partCode) !== true
    ) {
      throw new HttpsError("invalid-argument", "Part does not belong to this machine.");
    }
    const machine = machineSnapshot.data()!;
    const machineCriticality = machine.criticality;
    if (!Number.isInteger(machineCriticality) || machineCriticality < 1 || machineCriticality > 5) {
      throw new HttpsError("failed-precondition", "Machine criticality is not configured.");
    }
    const technicianQuery = db
      .collection("technicians")
      .where("department", "==", department)
      .where("status", "==", "available")
      .where("onShift", "==", true)
      .where("active", "==", true)
      .orderBy("skillLevel", "desc")
      .limit(20);
    const technicians = await transaction.get(technicianQuery);
    const assigned = selectTechnician(
      technicians.docs.flatMap((document) => {
        const technician = toTechnician(document);
        return technician ? [technician] : [];
      }),
      department,
    );
    const auditHeadRef = db.doc(`auditHeads/${faultRef.id}`);
    const auditHead = await transaction.get(auditHeadRef);
    const now = Timestamp.now();
    const nowMillis = now.toMillis();
    const intervals: StageInterval[] = [
      {
        stage: "assignmentWait",
        startedAt: nowMillis,
        ...(assigned ? { endedAt: nowMillis } : {}),
      },
      ...(assigned ? [{ stage: "response" as const, startedAt: nowMillis }] : []),
    ];
    const status = assigned ? "assigned" : "pendingWait";
    const fault = {
      machineCode,
      partCode,
      reportedById: actor.uid,
      department,
      severity,
      machineCriticality,
      priorityScore: severity * machineCriticality,
      status,
      reportedAt: FieldValue.serverTimestamp(),
      intervals: storeIntervals(intervals),
      ...(assigned
        ? {
            assignedTechnicianId: assigned.uid,
            assignedAt: FieldValue.serverTimestamp(),
          }
        : {}),
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.create(faultRef, fault);
    if (assigned) {
      transaction.update(db.doc(`technicians/${assigned.uid}`), {
        status: "busy",
        currentFaultId: faultRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    transaction.create(idempotencyRef, {
      operation: "openFault",
      requestHash,
      faultId: faultRef.id,
      actorId: actor.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    appendAudit(transaction, faultRef.id, actor.uid, "fault.opened", {
      machineCode,
      partCode,
      department,
      severity,
      status,
    }, auditHead.data()?.hash ?? null);
    return { faultId: faultRef.id, deduplicated: false, status };
  });
});

export const transitionFault = onCall({ region: functionRegion }, async (request) => {
  const data = inputObject(request.data);
  const faultId = wrapValidation(() => parseIdentifier(data.faultId, "faultId"));
  const action = data.action;
  const actor = requireRole(request, [
    "technician",
    "warehouse",
    "costMonitor",
    "administrator",
  ]);
  const faultRef = db.doc(`faults/${faultId}`);
  const now = Timestamp.now();
  const nowMillis = now.toMillis();

  return db.runTransaction(async (transaction) => {
    let releasedTechnician:
      | { ref: FirebaseFirestore.DocumentReference; onShift: boolean }
      | undefined;
    let queuedAssignment:
      | {
          ref: FirebaseFirestore.DocumentReference;
          id: string;
          intervals: StageInterval[];
          auditHeadHash: string | null;
        }
      | undefined;
    const faultSnapshot = await transaction.get(faultRef);
    if (!faultSnapshot.exists) {
      throw new HttpsError("not-found", "Fault does not exist.");
    }
    const fault = faultSnapshot.data()!;
    const technicianId = fault.assignedTechnicianId;
    if (
      actor.role === "technician" &&
      (technicianId !== actor.uid ||
        fault.department !== parseDepartment(request.auth?.token.department))
    ) {
      throw new HttpsError("permission-denied", "Fault is not assigned to this technician.");
    }
    const intervals = readIntervals(fault.intervals);
    let status: string;
    let nextIntervals: StageInterval[];
    const update: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    switch (action) {
      case "arrive":
        if (actor.role !== "technician" || fault.status !== "assigned") {
          throw new HttpsError("failed-precondition", "Only the assigned technician can record arrival.");
        }
        status = "arrived";
        nextIntervals = beginStage(intervals, "diagnosis", nowMillis);
        update.arrivedAt = FieldValue.serverTimestamp();
        break;
      case "startRepair":
        if (actor.role !== "technician" || fault.status !== "arrived") {
          throw new HttpsError("failed-precondition", "Repair can start only after arrival.");
        }
        status = "repairing";
        nextIntervals = beginStage(intervals, "repair", nowMillis);
        break;
      case "requestPart":
        if (
          actor.role !== "technician" ||
          (fault.status !== "arrived" && fault.status !== "repairing")
        ) {
          throw new HttpsError("failed-precondition", "A part can only be requested during work.");
        }
        status = "partWait";
        nextIntervals = beginStage(intervals, "partWait", nowMillis);
        update.resumeStatus = fault.status;
        update.partRequest = {
          partCode: wrapValidation(() => parseIdentifier(data.partCode, "partCode")),
          requestedById: actor.uid,
          requestedAt: FieldValue.serverTimestamp(),
        };
        break;
      case "partArrived": {
        if (actor.role !== "warehouse" || fault.status !== "partWait") {
          throw new HttpsError("failed-precondition", "Warehouse can fulfill only an open part wait.");
        }
        status = fault.resumeStatus;
        if (status !== "arrived" && status !== "repairing") {
          throw new HttpsError("failed-precondition", "Part wait has no valid resume state.");
        }
        nextIntervals = beginStage(intervals, status === "arrived" ? "diagnosis" : "repair", nowMillis);
        const quantity = parseAmount(data.quantity, "quantity", false);
        const unitCost = parseAmount(data.unitCost, "unitCost");
        if (
          fault.partRequest === null ||
          typeof fault.partRequest !== "object" ||
          Array.isArray(fault.partRequest)
        ) {
          throw new HttpsError("data-loss", "The part request is missing.");
        }
        const existingCosts = readCostInputs(fault.costs);
        const nextCosts = wrapValidation(() =>
          applySparePartCost(existingCosts, quantity, unitCost),
        );
        update.partRequest = {
          ...(fault.partRequest as Record<string, unknown>),
          issuedById: actor.uid,
          arrivedAt: FieldValue.serverTimestamp(),
          unitCost,
          quantity,
        };
        update.costs = nextCosts;
        break;
      }
      case "recordCosts": {
        if (
          actor.role !== "costMonitor" &&
          actor.role !== "administrator"
        ) {
          throw new HttpsError(
            "permission-denied",
            "Only a cost monitor or administrator can record cost components.",
          );
        }
        if (fault.status === "closed") {
          throw new HttpsError(
            "failed-precondition",
            "Costs cannot be changed after the fault is closed.",
          );
        }
        status = fault.status;
        nextIntervals = intervals;
        update.costs = mergeCostInputs(readCostInputs(fault.costs), data, {
          allowSparePartsOverride: true,
        });
        break;
      }
      case "startObstacle": {
        if (
          actor.role !== "technician" ||
          (fault.status !== "arrived" && fault.status !== "repairing")
        ) {
          throw new HttpsError("failed-precondition", "An obstacle requires an active work stage.");
        }
        const reasonCode = wrapValidation(() => parseIdentifier(data.reasonCode, "reasonCode"));
        const responsibleTeam = wrapValidation(() =>
          parseIdentifier(data.responsibleTeam, "responsibleTeam"),
        );
        status = "obstacleWait";
        nextIntervals = beginStage(intervals, "obstacle", nowMillis, {
          reasonCode,
          responsibleTeam,
        });
        update.resumeStatus = fault.status;
        break;
      }
      case "resolveObstacle":
        if (actor.role !== "technician" || fault.status !== "obstacleWait") {
          throw new HttpsError("failed-precondition", "There is no active obstacle to resolve.");
        }
        status = fault.resumeStatus;
        if (status !== "arrived" && status !== "repairing") {
          throw new HttpsError("failed-precondition", "Obstacle has no valid resume state.");
        }
        nextIntervals = beginStage(intervals, status === "arrived" ? "diagnosis" : "repair", nowMillis);
        break;
      case "finishRepair":
        if (actor.role !== "technician" || fault.status !== "repairing") {
          throw new HttpsError("failed-precondition", "Repair is not active.");
        }
        status = "testing";
        nextIntervals = beginStage(intervals, "testing", nowMillis);
        update.repairEndedAt = FieldValue.serverTimestamp();
        break;
      case "finishTesting":
        if (actor.role !== "technician" || fault.status !== "testing") {
          throw new HttpsError("failed-precondition", "Testing is not active.");
        }
        status = "closureReview";
        nextIntervals = beginStage(intervals, "closureReview", nowMillis);
        update.testedAt = FieldValue.serverTimestamp();
        break;
      case "close": {
        if (actor.role !== "costMonitor" || fault.status !== "closureReview") {
          throw new HttpsError("permission-denied", "Cost monitor approval is required to close a fault.");
        }
        const rootCauseCode = wrapValidation(() =>
          parseIdentifier(data.rootCauseCode, "rootCauseCode"),
        );
        const costData = fault.costs as Record<string, number | undefined> | undefined;
        if (!(fault.reportedAt instanceof Timestamp)) {
          throw new HttpsError("data-loss", "Fault report timestamp is missing.");
        }
        const downtimeMinutes = (nowMillis - fault.reportedAt.toMillis()) / 60_000;
        const metrics = calculateCosts(
          downtimeMinutes,
          costData ?? {},
          fault.approvedStandardDowntimeMinutes,
          fault.approvedStandardFaultCost,
        );
        status = "closed";
        nextIntervals = endStage(intervals, nowMillis);
        update.closedAt = FieldValue.serverTimestamp();
        update.rootCauseCode = rootCauseCode;
        update.metrics = metrics;
        if (typeof technicianId === "string") {
          const technicianRef = db.doc(`technicians/${technicianId}`);
          const technicianSnapshot = await transaction.get(technicianRef);
          if (technicianSnapshot.exists && technicianSnapshot.data()?.currentFaultId === faultId) {
            const technician = technicianSnapshot.data()!;
            const department = parseDepartment(technician.department);
            const onShift = technician.onShift === true;
            releasedTechnician = { ref: technicianRef, onShift };
            if (onShift && department) {
              const nextFaultQuery = db
                .collection("faults")
                .where("department", "==", department)
                .where("status", "==", "pendingWait")
                .orderBy("priorityScore", "desc")
                .orderBy("reportedAt", "asc")
                .limit(1);
              const pending = await transaction.get(nextFaultQuery);
              const nextFault = pending.docs[0];
              if (nextFault) {
                const nextIntervals = beginStage(
                  readIntervals(nextFault.data().intervals),
                  "response",
                  nowMillis,
                );
                const nextAuditHead = await transaction.get(
                  db.doc(`auditHeads/${nextFault.id}`),
                );
                queuedAssignment = {
                  ref: nextFault.ref,
                  id: nextFault.id,
                  intervals: nextIntervals,
                  auditHeadHash: nextAuditHead.data()?.hash ?? null,
                };
              }
            }
          }
        }
        break;
      }
      default:
        throw new HttpsError("invalid-argument", "Unknown fault transition.");
    }

    update.status = status;
    update.intervals = storeIntervals(nextIntervals);
    const auditHeadRef = db.doc(`auditHeads/${faultId}`);
    const auditHead = await transaction.get(auditHeadRef);
    if (releasedTechnician) {
      transaction.update(releasedTechnician.ref, {
        status: queuedAssignment ? "busy" : releasedTechnician.onShift ? "available" : "offShift",
        ...(queuedAssignment
          ? { currentFaultId: queuedAssignment.id }
          : { currentFaultId: FieldValue.delete() }),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (queuedAssignment) {
      transaction.update(queuedAssignment.ref, {
        status: "assigned",
        assignedTechnicianId: technicianId,
        assignedAt: FieldValue.serverTimestamp(),
        intervals: storeIntervals(queuedAssignment.intervals),
        updatedAt: FieldValue.serverTimestamp(),
      });
      appendAudit(
        transaction,
        queuedAssignment.id,
        actor.uid,
        "fault.assignedFromQueue",
        { technicianId },
        queuedAssignment.auditHeadHash,
      );
    }
    transaction.update(faultRef, update);
    appendAudit(transaction, faultId, actor.uid, `fault.${String(action)}`, {
      previousStatus: fault.status,
      status,
    }, auditHead.data()?.hash ?? null);
    return { faultId, status };
  });
});

export const listOpenFaults = onCall({ region: functionRegion }, async (request) => {
  requireRole(request, [
    "technician",
    "costMonitor",
    "warehouse",
    "maintenanceManager",
    "productionManager",
    "administrator",
  ]);
  const department = parseDepartment(request.data?.department);
  if (
    request.auth?.token.role === "technician" &&
    (!department || department !== parseDepartment(request.auth.token.department))
  ) {
    throw new HttpsError("permission-denied", "Technicians can only request their own department queue.");
  }
  const query = department
    ? db
        .collection("faults")
      .where("department", "==", department)
      .where("status", "in", [
        "pendingWait",
        "assigned",
        "arrived",
        "partWait",
        "repairing",
        "testing",
        "closureReview",
        "obstacleWait",
      ])
      .orderBy("priorityScore", "desc")
      .limit(100)
    : db
      .collection("faults")
      .where("status", "in", [
        "pendingWait",
        "assigned",
        "arrived",
        "partWait",
        "repairing",
        "testing",
        "closureReview",
        "obstacleWait",
      ])
      .orderBy("priorityScore", "desc")
      .limit(100);
  const snapshot = await query.get();
  return {
    faults: snapshot.docs.map((document) => {
      const { reportedById: _reporter, ...fault } = document.data();
      return { faultId: document.id, ...fault };
    }),
  };
});

export const setTechnicianAvailability = onCall({ region: functionRegion }, async (request) => {
  const actor = requireRole(request, ["technician", "administrator"]);
  const data = inputObject(request.data);
  const onShift = data.onShift;
  if (typeof onShift !== "boolean") {
    throw new HttpsError("invalid-argument", "onShift must be a boolean.");
  }
  const technicianRef = db.doc(`technicians/${actor.uid}`);
  return db.runTransaction(async (transaction) => {
    const technician = await transaction.get(technicianRef);
    if (!technician.exists || technician.data()?.active !== true) {
      throw new HttpsError("permission-denied", "Active technician profile is required.");
    }
    if (technician.data()?.status === "busy") {
      throw new HttpsError("failed-precondition", "Busy technicians cannot change availability.");
    }
    const department = parseDepartment(technician.data()?.department);
    if (!department) {
      throw new HttpsError("failed-precondition", "Technician department is not configured.");
    }
    const nextFaultQuery = db
      .collection("faults")
      .where("department", "==", department)
      .where("status", "==", "pendingWait")
      .orderBy("priorityScore", "desc")
      .orderBy("reportedAt", "asc")
      .limit(1);
    const pending = onShift ? await transaction.get(nextFaultQuery) : undefined;
    const candidate = pending?.docs[0];
    const auditHeadRef = db.doc(`auditHeads/technician-${actor.uid}`);
    const auditHead = await transaction.get(auditHeadRef);
    const now = Timestamp.now();
    if (candidate) {
      const fault = candidate.data();
      const intervals = readIntervals(fault.intervals);
      const nextIntervals = transitionStage(
        intervals,
        "response",
        now.toMillis(),
      );
      transaction.update(technicianRef, {
        onShift: true,
        status: "busy",
        currentFaultId: candidate.id,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(candidate.ref, {
        status: "assigned",
        assignedTechnicianId: actor.uid,
        assignedAt: FieldValue.serverTimestamp(),
        intervals: storeIntervals(nextIntervals),
        updatedAt: FieldValue.serverTimestamp(),
      });
      appendAudit(
        transaction,
        `technician-${actor.uid}`,
        actor.uid,
        "technician.shiftStarted",
        { assignedFaultId: candidate.id },
        auditHead.data()?.hash ?? null,
      );
      return { onShift: true, assignedFaultId: candidate.id };
    } else {
      transaction.update(technicianRef, {
        onShift,
        status: onShift ? "available" : "offShift",
        updatedAt: FieldValue.serverTimestamp(),
      });
      appendAudit(
        transaction,
        `technician-${actor.uid}`,
        actor.uid,
        onShift ? "technician.shiftStarted" : "technician.shiftEnded",
        {},
        auditHead.data()?.hash ?? null,
      );
    }
    return { onShift };
  });
});
