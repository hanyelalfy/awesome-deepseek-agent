import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import {
  assertFails,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

const projectId = "demo-faultcost-local";
let environment;

before(async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  });
});

after(async () => {
  await environment?.cleanup();
});

test("unauthenticated users cannot read or write any FaultCost records", async () => {
  const firestore = environment.unauthenticatedContext().firestore();
  for (const collection of [
    "faults",
    "machines",
    "parts",
    "technicians",
    "auditHeads",
    "auditEvents",
    "auditEvents",
    "idempotency",
  ]) {
    const reference = doc(firestore, collection, "record-1");
    await assertFails(getDoc(reference));
    await assertFails(setDoc(reference, { value: "untrusted" }));
  }
});

test("authenticated client roles cannot bypass the Cloud Functions boundary", async () => {
  const roles = [
    "technician",
    "costMonitor",
    "warehouse",
    "maintenanceManager",
    "productionManager",
    "administrator",
  ];
  for (const role of roles) {
    const firestore = environment
      .authenticatedContext(`user-${role}`, { role })
      .firestore();
    const reference = doc(firestore, "faults", "F-1");
    await assertFails(getDoc(reference));
    await assertFails(setDoc(reference, { role, status: "closed" }));
  }
});

test("records remain inaccessible through arbitrary nested collection paths", async () => {
  const firestore = environment
    .authenticatedContext("administrator", { role: "administrator" })
    .firestore();
  const reference = doc(
    firestore,
    "faults",
    "F-1",
    "events",
    "event-1",
  );
  await assertFails(getDoc(reference));
  assert.ok(environment);
});
