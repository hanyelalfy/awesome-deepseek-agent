import React from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const summary = [
  { label: "أعطال مفتوحة", value: "—", detail: "بانتظار ربط الخادم", tone: "blue" },
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
          <span>بيئة تطوير</span>
          <span className="avatar" aria-label="دخول غير مفعّل">—</span>
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
            <strong>لا توجد بيانات أعطال حتى الآن</strong>
            <p>سيُرتّب الطابور حسب الخطورة والتخصص ووقت البلاغ عند تفعيل الخادم.</p>
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
