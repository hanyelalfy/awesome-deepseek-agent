import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const projectId = process.env.GCLOUD_PROJECT;
const uid = process.argv[2];
if (!projectId || !uid || process.env.CONFIRM_BOOTSTRAP_ADMIN !== projectId) {
  console.error(
    "Refusing to set claims. Set GCLOUD_PROJECT, pass a user UID, and set CONFIRM_BOOTSTRAP_ADMIN to the exact project ID.",
  );
  process.exitCode = 1;
} else {
  initializeApp({ credential: applicationDefault(), projectId });
  const auth = getAuth();
  const user = await auth.getUser(uid);
  if (user.customClaims?.role) {
    throw new Error("User already has a role; refusing to overwrite existing claims.");
  }
  await auth.setCustomUserClaims(uid, { ...user.customClaims, role: "administrator" });
  console.log(`Administrator role assigned to ${uid} in ${projectId}.`);
}
