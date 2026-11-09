import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  type User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
  type HttpsCallable,
} from "firebase/functions";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const isConfigured = Object.values(config).every(
  (value) => typeof value === "string" && value.trim().length > 0,
);

const app = isConfigured
  ? getApps().length > 0
    ? getApp()
    : initializeApp(config)
  : undefined;

export const firebaseReady = isConfigured;
export const auth = app ? getAuth(app) : undefined;
export const functions = app
  ? getFunctions(app, import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "us-central1")
  : undefined;

if (import.meta.env.VITE_FIREBASE_USE_EMULATORS === "true" && auth && functions) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

export {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  httpsCallable,
};
export type { HttpsCallable, User };
