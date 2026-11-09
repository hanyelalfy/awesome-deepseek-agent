import { randomBytes } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const projectId = "demo-faultcost-local";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;

if (
  process.env.GCLOUD_PROJECT !== projectId ||
  !["127.0.0.1:9099", "localhost:9099"].includes(authHost) ||
  !["127.0.0.1:8080", "localhost:8080"].includes(firestoreHost)
) {
  throw new Error(
    "Refusing to seed: set the demo project ID and loopback Auth/Firestore emulator hosts.",
  );
}

initializeApp({ projectId });
const auth = getAuth();
const db = getFirestore();

async function seedUser(email, role, department) {
  const password = randomBytes(18).toString("base64url");
  let user;
  try {
    user = await auth.getUserByEmail(email);
    user = await auth.updateUser(user.uid, { password });
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    user = await auth.createUser({ email, password });
  }
  await auth.setCustomUserClaims(user.uid, {
    role,
    ...(department ? { department } : {}),
  });
  return { email, password, uid: user.uid };
}

const administrator = await seedUser("admin@faultcost.local", "administrator");
const costMonitor = await seedUser("monitor@faultcost.local", "costMonitor");
const technician = await seedUser(
  "technician@faultcost.local",
  "technician",
  "electrical",
);

await db.doc("machines/DEMO-01").set({
  active: true,
  criticality: 4,
  partCodes: ["PART-01"],
  name: "Test machine",
  updatedAt: FieldValue.serverTimestamp(),
});
await db.doc(`technicians/${technician.uid}`).set({
  active: true,
  department: "electrical",
  skillLevel: 4,
  status: "available",
  onShift: true,
  updatedAt: FieldValue.serverTimestamp(),
});

for (const [label, user] of [
  ["Administrator", administrator],
  ["Cost monitor", costMonitor],
  ["Technician", technician],
]) {
  console.log(`${label}: ${user.email} / ${user.password} (uid: ${user.uid})`);
}
