import "./styles.css";
import { useState } from "react";
import { ShiftProvider } from "./shifts/ShiftContext";
import { ShiftSelector } from "./shifts/ShiftSelector";
import { EngineRoomPanel } from "./shifts/EngineRoomPanel";
import { AnomalyTimeline } from "./shifts/AnomalyTimeline";
import { useShift } from "./shifts/ShiftContext";
import { ShiftHandover } from "./shifts/ShiftHandover";
import { BilgeWaterPanel } from "./shifts/BilgeWaterPanel";
import { DataManager } from "./shifts/DataManager";
import { getBilgeLevelStatus, isBilgeTreatmentUnfinished } from "./shifts/types";

import { DeviceHistoryPage } from "./shifts/DeviceHistoryPage";

type Page = "dashboard" | "history";

const project = {
  id: "hxyfront-62001",
  port: 62001,
  title: "船舶轮机值班记录",
  domain: "船舶轮机",
  palette: ["#0f766e", "#2563eb", "#f97316"],
  metrics: ["主机转速", "滑油压力", "冷却水温", "燃油消耗", "舱底水液位"],
  metricUnits: ["rpm", "MPa", "℃", "L/h", "%"],
  filters: ["主机", "发电机", "泵组", "舱底水"],
  fields: ["设备名称", "参数读数", "异常描述", "处理状态", "交接备注"],
};

function Dashboard() {
  const { currentShift, currentRecords, latestEngineRoomRecord, latestBilgeWaterRecord } = useShift();

  const metricValues = project.metrics.map((metric, i) => {
    if (metric === "舱底水液位") {
      return latestBilgeWaterRecord ? latestBilgeWaterRecord.liquidLevel : "--";
    }
    if (latestEngineRoomRecord && i < 4) {
      const keys = [
        "mainEngineSpeed",
        "lubricatingOilPressure",
        "coolingWaterTemp",
        "fuelConsumption",
      ] as const;
      return latestEngineRoomRecord[keys[i]];
    }
    if (i < 4) {
      const values = currentRecords
        .map((r) => {
          const parts = r.params.split(/[,，、]/);
          const val = parseFloat(parts[i]?.replace(/[^\d.]/g, "") ?? "");
          return isNaN(val) ? null : val;
        })
        .filter((v): v is number => v !== null);
      return values.length > 0 ? values[values.length - 1] : "--";
    }
    return "--";
  });

  const bilgeAlert = (() => {
    if (!latestBilgeWaterRecord) return null;
    const levelStatus = getBilgeLevelStatus(latestBilgeWaterRecord.liquidLevel);
    const treatmentUnfinished = isBilgeTreatmentUnfinished(latestBilgeWaterRecord.treatmentResult);
    if (levelStatus !== "normal" || treatmentUnfinished) {
      return { levelStatus, treatmentUnfinished, record: latestBilgeWaterRecord };
    }
    return null;
  })();

  return (
    <section className="metrics">
      {project.metrics.map((metric, index) => {
        const isBilge = metric === "舱底水液位";
        const bilgeClass = isBilge && bilgeAlert
          ? `metric-alert metric-alert-${bilgeAlert.levelStatus}`
          : "";
        return (
          <article key={metric} className={bilgeClass}>
            <small>
              {metric}
              {isBilge && bilgeAlert && <span className="metric-alert-dot" />}
            </small>
            <strong className={isBilge && bilgeAlert ? `level-text level-${bilgeAlert.levelStatus}` : ""}>
              {metricValues[index]}
              {metricValues[index] !== "--" && (
                <span className="unit">{project.metricUnits[index]}</span>
              )}
            </strong>
            {isBilge && latestBilgeWaterRecord ? (
              <small className="record-time">
                {new Date(latestBilgeWaterRecord.createdAt).toLocaleString("zh-CN")}
                {bilgeAlert && <span className="metric-alert-note"> · 需关注</span>}
              </small>
            ) : latestEngineRoomRecord ? (
              <small className="record-time">
                {new Date(latestEngineRoomRecord.createdAt).toLocaleString("zh-CN")}
              </small>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}

function RecordForm() {
  const { currentShift, addRecord } = useShift();
  const [form, setForm] = useState({
    device: "",
    params: "",
    anomaly: "",
    status: "",
    handoverNote: "",
  });
  const [saved, setSaved] = useState(false);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSubmit = () => {
    if (!form.device.trim()) return;
    addRecord(form);
    setForm({ device: "", params: "", anomaly: "", status: "", handoverNote: "" });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <section className="panel form-panel">
      <div className="heading">
        <div>
          <p>{currentShift.label} · 专业字段</p>
          <h2>新增记录</h2>
        </div>
        <button className="primary" onClick={handleSubmit}>
          {saved ? "已保存 ✓" : "保存记录"}
        </button>
      </div>
      <div className="field-grid">
        {project.fields.map((field) => {
          const key = field === "设备名称"
            ? "device"
            : field === "参数读数"
            ? "params"
            : field === "异常描述"
            ? "anomaly"
            : field === "处理状态"
            ? "status"
            : "handoverNote";
          return (
            <label key={field}>
              <span>{field}</span>
              {field === "处理状态" ? (
                <select
                  value={form[key as keyof typeof form]}
                  onChange={(e) => handleChange(key, e.target.value)}
                >
                  <option value="">请选择</option>
                  <option value="正常巡检">正常巡检</option>
                  <option value="已安排复查">已安排复查</option>
                  <option value="已记录交班">已记录交班</option>
                  <option value="处理中">处理中</option>
                  <option value="已解决">已解决</option>
                </select>
              ) : (
                <input
                  placeholder={"填写" + field}
                  value={form[key as keyof typeof form]}
                  onChange={(e) => handleChange(key, e.target.value)}
                />
              )}
            </label>
          );
        })}
      </div>
    </section>
  );
}

function NavAside({ onNavigate }: { onNavigate: (page: Page) => void }) {
  return (
    <aside className="panel">
      <h2>{project.domain}导航</h2>
      <div className="chips">
        {project.filters.map((item) => (
          <button
            key={item}
            onClick={() => onNavigate("history")}
          >
            {item}
          </button>
        ))}
      </div>
      <button
        className="primary history-nav-btn"
        onClick={() => onNavigate("history")}
      >
        查看设备历史记录 →
      </button>
    </aside>
  );
}

function HistoryRecords() {
  const { currentRecords } = useShift();

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>历史记录</p>
          <h2>近期工作台</h2>
        </div>
        <button>导出摘要</button>
      </div>
      <div className="records">
        {currentRecords.length === 0 ? (
          <div className="empty-state">暂无记录，请添加新记录</div>
        ) : (
          currentRecords.map((record, index) => (
            <article key={record.id}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <div>
                <h3>{record.device}</h3>
                <p>
                  {record.params}
                  {record.anomaly && ` · ${record.anomaly}`}
                  {record.status && ` · ${record.status}`}
                </p>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function AppContent() {
  const { currentShift } = useShift();
  const [page, setPage] = useState<Page>("dashboard");

  if (page === "history") {
    return <DeviceHistoryPage onBack={() => setPage("dashboard")} />;
  }

  return (
    <main className="app">
      <section className="hero">
        <p>{project.id} · Port {project.port}</p>
        <h1>{project.title}</h1>
        <span>
          当前值班：<strong>{currentShift.label}</strong>（{String(currentShift.startHour).padStart(2, "0")}:00 - {String(currentShift.endHour).padStart(2, "0")}:00）
        </span>
      </section>

      <ShiftSelector />

      <Dashboard />

      <EngineRoomPanel />

      <BilgeWaterPanel />

      <section className="workspace">
        <NavAside onNavigate={setPage} />
        <RecordForm />
      </section>

      <AnomalyTimeline />

      <ShiftHandover />

      <DataManager />

      <HistoryRecords />
    </main>
  );
}

function App() {
  return (
    <ShiftProvider>
      <AppContent />
    </ShiftProvider>
  );
}

export default App;
