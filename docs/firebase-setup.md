# Firebase setup and local test

## Local emulator test (no cloud project)

Requirements: Node.js 20+, npm, Java 21+, and network access to download npm packages and the Firestore emulator on first run.

1. Install packages and build both apps:

   ```powershell
   npm install
   Copy-Item web-admin\.env.example web-admin\.env.local
   npm run build
   ```

2. Start the local Firebase Emulator Suite in one terminal:

   ```powershell
   npm run emulators
   ```

3. In a second terminal, seed sample accounts, one machine, and one technician. The script refuses to run unless both Auth and Firestore emulator hosts are loopback addresses and the project ID is exactly `demo-faultcost-local`:

   ```powershell
   $env:GCLOUD_PROJECT = "demo-faultcost-local"
   $env:FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"
   $env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
   npm run seed:emulator
   ```

   The command prints temporary local-only credentials for an administrator, cost monitor, and technician. They are regenerated each time the seed script runs.

4. Open `http://127.0.0.1:5000` and sign in with a seeded account. The emulator dashboard is at `http://127.0.0.1:4000`. The sample machine code is `DEMO-01`; the technician is assigned to `electrical`.

5. Run the tests (the rules test starts a separate Firestore-only emulator):

   ```powershell
   npm test
   ```

The emulator uses a `demo-*` project ID and does not create or access a Firebase cloud project. Stop it with Ctrl+C.

## Create and configure a cloud project

Cloud resource creation is an account-level action and is intentionally not run automatically. Choose a globally unique project ID and confirm billing requirements with the project owner. Cloud Functions deployment may require the Blaze billing plan.

1. Install dependencies, authenticate the Firebase CLI, create/select a project:

   ```powershell
   npm install
   npx firebase-tools login
   npx firebase-tools projects:create faultcost-<unique-suffix> --display-name "FaultCost"
   npx firebase-tools use --add
   ```

   Select the project you just created. `firebase use --add` creates a local `.firebaserc`; do not commit a personal project mapping.

2. In Firebase Console, enable **Authentication > Email/Password**, create the Firestore database in the approved region, and register a Web app. Copy its Firebase web config into `web-admin\.env.local` as `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID`. Set `VITE_FIREBASE_USE_EMULATORS=false` or remove that variable. Functions currently deploy in `us-central1`; the web client must use the same region. Never put Admin SDK credentials in the web app.

3. Create the first user in Firebase Authentication. Assign administrator claims once, from a trusted local environment with Google Application Default Credentials:

   ```powershell
   gcloud auth application-default login
   $env:GCLOUD_PROJECT = "your-project-id"
   $env:CONFIRM_BOOTSTRAP_ADMIN = "your-project-id"
   npm run bootstrap:admin -- <auth-user-uid>
   ```

   The bootstrap script refuses to overwrite an existing role. Later custom-claim changes require a separately reviewed trusted Admin SDK process; editing a user in Firebase Console does not set custom claims.

   This step requires the Google Cloud CLI (`gcloud`) in addition to the Firebase CLI.

4. Build and deploy Firestore rules/indexes, Functions, and Hosting:

   ```powershell
   npm run build
   npx firebase-tools deploy --only firestore:rules,firestore:indexes,functions,hosting
   ```

   Review the target project in `.firebaserc` before deploying. Cloud Functions Admin SDK operations bypass Firestore rules; changes to callable functions require their own authorization review and tests.

No live project, production credentials, or FAC connection is included in this repository. Do not deploy or enter production data until an owner approves the project, region, billing, users, assets, and cost standards.
