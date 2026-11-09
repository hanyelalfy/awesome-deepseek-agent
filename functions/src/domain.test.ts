import assert from "node:assert/strict";
import test from "node:test";
import {
  applySparePartCost,
  calculateCosts,
  elapsedMinutes,
  finishStage,
  parseDepartment,
  parseIdentifier,
  parseSeverity,
  selectNextFault,
  selectTechnician,
  transitionStage,
  type Department,
  type QueueFault,
  type QueueTechnician,
} from "./domain.js";

test("validates department, identifier, and severity inputs", () => {
  assert.equal(parseDepartment("electrical"), "electrical");
  assert.equal(parseDepartment("unknown"), undefined);
  assert.equal(parseIdentifier("M-1", "machineCode"), "M-1");
  assert.throws(() => parseIdentifier(" M-1", "machineCode"));
  assert.throws(() => parseIdentifier("machine/nested", "machineCode"));
  assert.equal(parseSeverity(5), 5);
  assert.throws(() => parseSeverity(6));
});

test("selects only available on-shift technicians with matching specialty", () => {
  const candidates: QueueTechnician[] = [
    { uid: "off", department: "electrical", skillLevel: 5, isAvailable: true, onShift: false },
    { uid: "busy", department: "electrical", skillLevel: 5, isAvailable: false, onShift: true },
    { uid: "other", department: "sorting", skillLevel: 5, isAvailable: true, onShift: true },
    { uid: "junior", department: "electrical", skillLevel: 3, isAvailable: true, onShift: true },
    { uid: "senior", department: "electrical", skillLevel: 5, isAvailable: true, onShift: true },
  ];
  assert.equal(selectTechnician(candidates, "electrical")?.uid, "senior");
});

test("selects the highest priority pending fault then the oldest fault", () => {
  const faults: QueueFault[] = [
    { id: "low", department: "electrical", status: "pendingWait", priorityScore: 5, reportedAt: 1 },
    { id: "high-new", department: "electrical", status: "pendingWait", priorityScore: 20, reportedAt: 5 },
    { id: "high-old", department: "electrical", status: "pendingWait", priorityScore: 20, reportedAt: 2 },
    { id: "other-team", department: "sorting", status: "pendingWait", priorityScore: 99, reportedAt: 1 },
    { id: "assigned", department: "electrical", status: "assigned", priorityScore: 100, reportedAt: 1 },
  ];
  assert.equal(selectNextFault(faults, "electrical")?.id, "high-old");
});

test("records stage intervals without overlap and rejects negative durations", () => {
  const intervals = transitionStage(
    [{ stage: "assignmentWait", startedAt: 1_000 }],
    "response",
    301_000,
  );
  assert.deepEqual(intervals, [
    { stage: "assignmentWait", startedAt: 1_000, endedAt: 301_000 },
    { stage: "response", startedAt: 301_000 },
  ]);
  assert.equal(elapsedMinutes(1_000, 301_000), 5);
  assert.throws(() => transitionStage(intervals, "diagnosis", 1));
  assert.deepEqual(finishStage(intervals, 601_000), [
    { stage: "assignmentWait", startedAt: 1_000, endedAt: 301_000 },
    { stage: "response", startedAt: 301_000, endedAt: 601_000 },
  ]);
});

test("keeps downtime costs and approved factors unavailable when inputs are missing", () => {
  const missing = calculateCosts(90, { costPerDowntimeMinute: 50, waste: 0 });
  assert.deepEqual(missing, {
    downtimeCost: 4_500,
    totalCost: null,
    timeFactor: null,
    financialFactor: null,
  });
  const complete = calculateCosts(
    90,
    { costPerDowntimeMinute: 50, spareParts: 200, waste: 300, labor: 0, rework: 0 },
    60,
    3_000,
  );
  assert.equal(complete.downtimeCost, 4_500);
  assert.equal(complete.totalCost, 5_000);
  assert.equal(complete.timeFactor, 1.5);
  assert.equal(complete.financialFactor, 5 / 3);
  assert.throws(() => calculateCosts(10, {}, 0));
});

test("adds spare part costs without replacing existing cost components", () => {
  const costs = { spareParts: 30, labor: 10 };
  assert.deepEqual(applySparePartCost(costs, 2, 15), {
    spareParts: 60,
    labor: 10,
  });
  assert.deepEqual(costs, { spareParts: 30, labor: 10 });
  assert.throws(() => applySparePartCost({}, 0, 10));
  assert.throws(() => applySparePartCost({}, 1, -1));
  assert.throws(() => applySparePartCost({}, Number.MAX_VALUE, Number.MAX_VALUE));
  assert.throws(() =>
    applySparePartCost({ spareParts: Number.MAX_VALUE }, 1, Number.MAX_VALUE),
  );
});

test("restricts parsed departments to the supported specialties", () => {
  const departments: readonly Department[] = [
    "loading",
    "sorting",
    "generalMaintenance",
    "shanfara",
    "electrical",
  ];
  for (const department of departments) {
    assert.equal(parseDepartment(department), department);
  }
});
