import { useEffect, useState } from "react";
import React from "react";
import { createRoot } from "react-dom/client";
import {
  auth,
  firebaseReady,
  functions,
  httpsCallable,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "./firebase";
import "./style.css";

const summary = [
  { label: "أعطال مفتوحة", value: "—", detail: "تظهر تفاصيلها في قائمة الأعطال", tone: "blue" },
  { label: "توقف الإنتاج", value: "—", detail: "الدقيقة المعيارية غير مهيأة", tone: "amber" },
  { label: "طلبات بانتظار فني", value: "—", detail: "تُحسب حسب التخصص والأولوية", tone: "violet" },
  { label: "تكلفة الخسائر", value: "—", detail: "لا توجد بيانات مالية معتمدة", tone: "green" },
];

const areas = [
  { name: "إدارة الأعطال", description: "التسجيل، الأولويات، وتوزيع الفنيين", icon: "01" },
  { name: "تحليل القطع", description: "تكرار الأعطال والعمر التشغيلي", icon: "02" },
  { name: "الهدر والجودة", description: "ربط أحداث الإنتاج والجودة مع FAC", icon: "03" },
  { name: "تقارير الخسائر", description: "زمن الانتظار والإصلاح وتكلفة التوقف", icon: "04" },
];

type Fault = {
  faultId: string;
  machineCode: string;
  partCode?: string | null;
  department: string;
  status: string;
  priorityScore: number;
  intervals?: { stage: string; startedAt: { _seconds?: number } }[];
};

const departments = [
  ["loading", "تحميل وتفريغ"],
  ["sorting", "الفرز"],
  ["generalMaintenance", "الصيانة العامة"],
  ["shanfara", "الشنفرية"],
  ["electrical", "الكهرباء"],
];

const statusNames: Record<string, string> = {
  pendingWait: "بانتظار فني",
  assigned: "تم الإسناد",
  arrived: "الفني حاضر",
  partWait: "بانتظار قطعة غيار",
  repairing: "قيد الإصلاح",
  testing: "قيد الاختبار",
  closureReview: "بانتظار اعتماد الإغلاق",
};

function AuthWorkspace() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState("");
  const [userDepartment, setUserDepartment] = useState("");
  const [faults, setFaults] = useState<Fault[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [machineCode, setMachineCode] = useState("");
  const [partCode, setPartCode] = useState("");
  const [department, setDepartment] = useState("electrical");
  const [severity, setSeverity] = useState("3");
  const [rootCauseCode, setRootCauseCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setRole("");
        setUserDepartment("");
        setFaults([]);
        return;
      }
      const token = await currentUser.getIdTokenResult();
      const currentRole = typeof token.claims.role === "string" ? token.claims.role : "";
      const currentDepartment =
        typeof token.claims.department === "string" ? token.claims.department : "";
      setRole(currentRole);
      setUserDepartment(currentDepartment);
      await refreshFaults(currentRole === "technician" ? currentDepartment : undefined);
    });
  }, []);

  async function refreshFaults(team?: string) {
    if (!functions) return;
    setBusy(true);
    setError("");
    try {
      const listFaults = httpsCallable<{ department?: string }, { faults: Fault[] }>(
        functions,
        "listOpenFaults",
      );
      const result = await listFaults(team ? { department: team } : {});
      setFaults(result.data.faults);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل الأعطال.");
    } finally {
      setBusy(false);
    }
  }

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return;
    setBusy(true);
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setPassword("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تسجيل الدخول.");
    } finally {
      setBusy(false);
    }
  }

  async function createFault(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!functions) return;
    setBusy(true);
    setError("");
    try {
      const openFault = httpsCallable<
        {
          machineCode: string;
          partCode?: string;
          department: string;
          severity: number;
          idempotencyKey: string;
        },
        { faultId: string; status: string }
      >(functions, "openFault");
      await openFault({
        machineCode: machineCode.trim(),
        ...(partCode.trim() ? { partCode: partCode.trim() } : {}),
        department,
        severity: Number(severity),
        idempotencyKey: crypto.randomUUID(),
      });
      setMachineCode("");
      setPartCode("");
      await refreshFaults();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر فتح العطل.");
    } finally {
      setBusy(false);
    }
  }

  async function transition(faultId: string, action: string, details: object = {}) {
    if (!functions) return;
    setBusy(true);
    setError("");
    try {
      const updateFault = httpsCallable<
        { faultId: string; action: string } & object,
        { faultId: string; status: string }
      >(functions, "transitionFault");
      await updateFault({ faultId, action, ...details });
      await refreshFaults(role === "technician" ? userDepartment : undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحديث حالة العطل.");
    } finally {
      setBusy(false);
    }
  }

  if (!firebaseReady) {
    return (
      <section className="panel auth-panel">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">واجهة Firebase</span>
            <h2>الاتصال غير مهيّأ</h2>
          </div>
          <span className="notice-badge">إعداد مطلوب</span>
        </div>
        <p className="auth-copy">
          أضف إعدادات مشروع FaultCost إلى متغيرات <code>VITE_FIREBASE_*</code> بعد إنشاء المشروع. لا تُضع مفاتيح
          Admin أو أسرار الخادم في تطبيق الويب.
        </p>
        <code className="env-hint">
          VITE_FIREBASE_API_KEY · VITE_FIREBASE_AUTH_DOMAIN · VITE_FIREBASE_PROJECT_ID · VITE_FIREBASE_APP_ID
        </code>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="panel auth-panel">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">دخول آمن</span>
            <h2>تسجيل الدخول إلى FaultCost</h2>
          </div>
          <span className="notice-badge">Firebase Authentication</span>
        </div>
        <form className="login-form" onSubmit={signIn}>
          <label>
            البريد الإلكتروني
            <input autoComplete="username" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            كلمة المرور
            <input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "جارٍ التحقق..." : "تسجيل الدخول"}
          </button>
        </form>
        {error && <p className="error-message" role="alert">{error}</p>}
        <p className="auth-copy">لا يوجد تسجيل ذاتي؛ ينشئ مسؤول النظام الحسابات ويعيّن الصلاحيات.</p>
      </section>
    );
  }

  const canOpenFault = ["costMonitor", "maintenanceManager", "administrator"].includes(role);
  const canCloseFault = role === "costMonitor";

  return (
    <section className="panel auth-panel">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">متصل بخادم FaultCost</span>
          <h2>الأعطال النشطة</h2>
        </div>
        <div className="auth-actions">
          <span className="notice-badge">{role || "دور غير معيّن"}</span>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void signOut(auth!)}
            type="button"
          >
            خروج
          </button>
        </div>
      </div>

      {canOpenFault && (
        <form className="fault-form" onSubmit={createFault}>
          <label>
            كود الماكينة
            <input value={machineCode} onChange={(event) => setMachineCode(event.target.value)} required />
          </label>
          <label>
            كود القطعة (اختياري)
            <input value={partCode} onChange={(event) => setPartCode(event.target.value)} />
          </label>
          <label>
            القسم المختص
            <select value={department} onChange={(event) => setDepartment(event.target.value)}>
              {departments.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
            </select>
          </label>
          <label>
            درجة الخطورة
            <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
              {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <button className="primary-button" disabled={busy} type="submit">
            تسجيل عطل
          </button>
        </form>
      )}

      {error && <p className="error-message" role="alert">{error}</p>}
      {busy && <p className="loading-message">جارٍ الاتصال بالخادم...</p>}
      {faults.length === 0 ? (
        <div className="empty-state compact-empty">
          <strong>لا توجد أعطال نشطة</strong>
          <p>تُحمّل القائمة من واجهة الخادم بعد المصادقة والتحقق من الدور.</p>
        </div>
      ) : (
        <div className="fault-list">
          {faults.map((fault) => (
            <article className="fault-row" key={fault.faultId}>
              <div>
                <strong>{fault.machineCode}{fault.partCode ? ` · ${fault.partCode}` : ""}</strong>
                <span>{statusNames[fault.status] ?? fault.status} · أولوية {fault.priorityScore}</span>
              </div>
              <div className="fault-actions">
                {role === "technician" && fault.status === "assigned" && (
                  <button disabled={busy} onClick={() => void transition(fault.faultId, "arrive")} type="button">تسجيل الحضور</button>
                )}
                {role === "technician" && fault.status === "arrived" && (
                  <button disabled={busy} onClick={() => void transition(fault.faultId, "startRepair")} type="button">بدء الإصلاح</button>
                )}
                {role === "technician" && fault.status === "repairing" && (
                  <button disabled={busy} onClick={() => void transition(fault.faultId, "finishRepair")} type="button">إنهاء الإصلاح</button>
                )}
                {role === "technician" && fault.status === "testing" && (
                  <button disabled={busy} onClick={() => void transition(fault.faultId, "finishTesting")} type="button">إنهاء الاختبار</button>
                )}
                {canCloseFault && fault.status === "closureReview" && (
                  <form
                    className="inline-close"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void transition(fault.faultId, "close", { rootCauseCode });
                      setRootCauseCode("");
                    }}
                  >
                    <input
                      aria-label="كود السبب الجذري"
                      onChange={(event) => setRootCauseCode(event.target.value)}
                      placeholder="كود السبب الجذري"
                      value={rootCauseCode}
                      required
                    />
                    <button disabled={busy} type="submit">اعتماد الإغلاق</button>
                  </form>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {role === "technician" && (
        <button className="secondary-button" disabled={busy} onClick={() => void refreshFaults(userDepartment)} type="button">
          تحديث قائمة القسم
        </button>
      )}
    </section>
  );
}

function App() {
  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="FaultCost الرئيسية">
          <span className="brand-mark">F</span>
          <span>Fault<span className="brand-light">Cost</span></span>
        </a>
        <div className="topbar-meta">
          <span className="status-dot" />
          <span>{import.meta.env.DEV ? "بيئة تطوير" : "FaultCost"}</span>
          <span className="avatar" aria-label="حالة المصادقة">—</span>
        </div>
      </header>

      <section className="welcome">
        <div>
          <span className="eyebrow">إدارة الصيانة والإنتاج</span>
          <h1>صباح الخير، <span>تابع الصورة كاملة.</span></h1>
          <p>من لحظة بلاغ العطل حتى تحليل الخسارة — دون إغفال زمن الانتظار أو الهدر.</p>
        </div>
        <div className="welcome-mark" aria-hidden="true">
          <span>Fc</span>
          <i />
          <i />
          <i />
        </div>
      </section>

      <section className="integration-notice" aria-label="حالة الربط">
        <span className="notice-icon" aria-hidden="true">↗</span>
        <div>
          <strong>تكامل الجودة FAC مخطّط عبر واجهة معتمدة</strong>
          <p>ستبقى سجلات الجودة في FAC. لم يتم إعداد اتصال أو بيانات إنتاج فعلية بعد.</p>
        </div>
        <span className="notice-badge">غير متصل</span>
      </section>

      <AuthWorkspace />

      <section className="metrics" aria-label="مؤشرات الإنتاج">
        {summary.map((item) => (
          <article className={`metric-card ${item.tone}`} key={item.label}>
            <div className="metric-heading">
              <span>{item.label}</span>
              <span className="metric-icon" aria-hidden="true">{item.label.slice(0, 1)}</span>
            </div>
            <strong className="metric-value">{item.value}</strong>
            <span className="metric-detail">{item.detail}</span>
          </article>
        ))}
      </section>

      <section className="workspace">
        <div className="section-heading">
          <div>
            <span className="eyebrow">مساحة العمل</span>
            <h2>المتابعة والتحليل</h2>
          </div>
          <span className="section-note">الوحدات قيد التجهيز</span>
        </div>
        <div className="area-grid">
          {areas.map((area) => (
            <article className="area-card" key={area.name}>
              <span className="area-number">{area.icon}</span>
              <h3>{area.name}</h3>
              <p>{area.description}</p>
              <span className="area-arrow" aria-hidden="true">←</span>
            </article>
          ))}
        </div>
      </section>

      <section className="bottom-grid">
        <article className="panel queue-panel">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">إسناد ذكي</span>
              <h2>طابور الأعطال</h2>
            </div>
            <span className="queue-count">—</span>
          </div>
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">✓</span>
            <strong>سجّل الدخول لعرض طابور الأعطال</strong>
            <p>يُرتّب الخادم الأعطال حسب الخطورة والتخصص ووقت البلاغ.</p>
          </div>
          <p className="policy-note">زمن انتظار الفني محسوب ضمن توقف الإنتاج، لا ضمن زمن مسؤولية القسم.</p>
        </article>

        <article className="panel loss-panel">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">تحليل البيانات</span>
              <h2>مؤشر الخسائر</h2>
            </div>
            <span className="period-chip">هذا الشهر</span>
          </div>
          <div className="chart-placeholder" role="img" aria-label="مخطط غير متاح حتى توافر بيانات الأعطال">
            <div className="chart-grid">
              <span>تكلفة التوقف</span>
              <i /><i /><i /><i />
              <div className="chart-empty">يظهر التحليل بعد توافر بيانات موثوقة ومعايير معتمدة</div>
            </div>
          </div>
          <div className="chart-legend">
            <span><i className="legend-dot downtime" /> توقف الإنتاج</span>
            <span><i className="legend-dot parts" /> قطع الغيار</span>
            <span><i className="legend-dot waste" /> الهدر</span>
          </div>
        </article>
      </section>

      <footer>
        <span>FaultCost <b>0.1 · نسخة تطوير</b></span>
        <span>أرقام التكاليف لا تظهر قبل تهيئة واعتماد بيانات المصنع.</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
