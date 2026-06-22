import "./styles.css";
import { useState, useEffect } from "react";
import { ShiftProvider } from "./shifts/ShiftContext";
import { VesselSelector } from "./shifts/VesselSelector";
import { ShiftSelector } from "./shifts/ShiftSelector";
import { EngineRoomPanel } from "./shifts/EngineRoomPanel";
import { AnomalyTimeline } from "./shifts/AnomalyTimeline";
import { useShift } from "./shifts/ShiftContext";
import { ShiftHandover } from "./shifts/ShiftHandover";
import { BilgeWaterPanel } from "./shifts/BilgeWaterPanel";
import { DataManager } from "./shifts/DataManager";
import { MaintenanceReminder } from "./shifts/MaintenanceReminder";
import { RiskAssessmentPanel } from "./shifts/RiskAssessmentPanel";
import { getBilgeLevelStatus, isBilgeTreatmentUnfinished } from "./shifts/types";
import type { WatchRecord } from "./shifts/types";

import { DeviceHistoryPage } from "./shifts/DeviceHistoryPage";

type DeviceCategory = "主机" | "发电机" | "泵组" | "舱底水";

type PageState =
  | { type: "dashboard" }
  | { type: "history"; category?: DeviceCategory; device?: string };

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
    const pumpFault = latestBilgeWaterRecord.pumpStatus === "故障";
    if (levelStatus !== "normal" || treatmentUnfinished || pumpFault) {
      return { levelStatus, treatmentUnfinished, pumpFault, record: latestBilgeWaterRecord };
    }
    return null;
  })();

  const alertType = bilgeAlert
    ? bilgeAlert.levelStatus === "danger"
      ? "danger"
      : bilgeAlert.pumpFault
      ? "danger"
      : bilgeAlert.treatmentUnfinished && bilgeAlert.levelStatus === "normal"
      ? "warning"
      : bilgeAlert.levelStatus
    : "normal";

  return (
    <section className="metrics">
      {project.metrics.map((metric, index) => {
        const isBilge = metric === "舱底水液位";
        const bilgeClass = isBilge && bilgeAlert
          ? `metric-alert metric-alert-${alertType}`
          : "";
        return (
          <article key={metric} className={bilgeClass}>
            <small>
              {metric}
              {isBilge && bilgeAlert && (
                <span className={`metric-alert-badge badge-${alertType}`}>
                  {alertType === "danger" ? "⚠ 危险" : "⚠ 警戒"}
                </span>
              )}
            </small>
            <strong className={isBilge && bilgeAlert ? `level-text level-${alertType}` : ""}>
              {metricValues[index]}
              {metricValues[index] !== "--" && (
                <span className="unit">{project.metricUnits[index]}</span>
              )}
            </strong>
            {isBilge && latestBilgeWaterRecord ? (
              <div className="record-time bilge-record-time">
                <span>{new Date(latestBilgeWaterRecord.createdAt).toLocaleString("zh-CN")}</span>
                {bilgeAlert && (
                  <div className="bilge-metric-alert-info">
                    {bilgeAlert.levelStatus === "danger" && <span>液位危险</span>}
                    {bilgeAlert.levelStatus === "warning" && <span>液位警戒</span>}
                    {bilgeAlert.pumpFault && <span>泵故障</span>}
                    {bilgeAlert.treatmentUnfinished && <span>处理未完成</span>}
                  </div>
                )}
              </div>
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

function RecordForm({
  editingRecord,
  setEditingRecord,
}: {
  editingRecord: WatchRecord | null;
  setEditingRecord: (record: WatchRecord | null) => void;
}) {
  const { currentShift, addRecord, updateRecord } = useShift();
  const [form, setForm] = useState({
    device: "",
    params: "",
    anomaly: "",
    status: "",
    handoverNote: "",
  });
  const [saved, setSaved] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  useEffect(() => {
    if (editingRecord) {
      setForm({
        device: editingRecord.device,
        params: editingRecord.params,
        anomaly: editingRecord.anomaly,
        status: editingRecord.status,
        handoverNote: editingRecord.handoverNote,
      });
    }
  }, [editingRecord]);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
    setDuplicateWarning(false);
  };

  const handleCancelEdit = () => {
    setEditingRecord(null);
    setForm({ device: "", params: "", anomaly: "", status: "", handoverNote: "" });
    setDuplicateWarning(false);
  };

  const handleSubmit = () => {
    if (!form.device.trim()) return;

    if (editingRecord) {
      updateRecord(editingRecord.id, {
        device: form.device,
        params: form.params,
        anomaly: form.anomaly,
        status: form.status,
        handoverNote: form.handoverNote,
      });
      setEditingRecord(null);
      setForm({ device: "", params: "", anomaly: "", status: "", handoverNote: "" });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      const newKey = Date.now().toString() + Math.random().toString(36).slice(2);
      setIdempotencyKey(newKey);
      const result = addRecord({ ...form, idempotencyKey: newKey });
      if (!result.created) {
        setDuplicateWarning(true);
        setTimeout(() => setDuplicateWarning(false), 3000);
        return;
      }
      setForm({ device: "", params: "", anomaly: "", status: "", handoverNote: "" });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      const refreshKey = Date.now().toString() + Math.random().toString(36).slice(2);
      setIdempotencyKey(refreshKey);
    }
  };

  return (
    <section className={"panel form-panel" + (editingRecord ? " record-form-editing" : "")}>
      <div className="heading">
        <div>
          <p>{currentShift.label} · 专业字段</p>
          <h2>{editingRecord ? "编辑记录" : "新增记录"}</h2>
        </div>
        {editingRecord ? (
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={handleCancelEdit}>取消编辑</button>
            <button className="primary" onClick={handleSubmit}>
              {saved ? "已更新 ✓" : "更新记录"}
            </button>
          </div>
        ) : (
          <button className="primary" onClick={handleSubmit}>
            {saved ? "已保存 ✓" : "保存记录"}
          </button>
        )}
      </div>
      {duplicateWarning && (
        <div className="warning-banner" style={{ marginBottom: "16px" }}>
          <strong>该记录已存在，请勿重复提交</strong>
        </div>
      )}
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

function NavAside({ onNavigate }: { onNavigate: (page: PageState) => void }) {
  return (
    <aside className="panel">
      <h2>{project.domain}导航</h2>
      <div className="chips">
        {project.filters.map((item) => (
          <button
            key={item}
            onClick={() => onNavigate({ type: "history", category: item as DeviceCategory })}
          >
            {item}
          </button>
        ))}
      </div>
      <button
        className="primary history-nav-btn"
        onClick={() => onNavigate({ type: "history" })}
      >
        查看设备历史记录 →
      </button>
    </aside>
  );
}

function HistoryRecords({
  setEditingRecord,
}: {
  setEditingRecord: (record: WatchRecord) => void;
}) {
  const { currentRecords, deleteRecord } = useShift();

  const handleDelete = (id: string) => {
    if (window.confirm("确定要删除这条记录吗？")) {
      deleteRecord(id);
    }
  };

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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: "12px", flex: "1" }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    {record.device}
                    {record.isEdited && (
                      <span className="record-edit-tag">已编辑</span>
                    )}
                  </h3>
                  <p>
                    {record.params}
                    {record.anomaly && ` · ${record.anomaly}`}
                    {record.status && ` · ${record.status}`}
                  </p>
                  {record.isEdited && record.editedAt && (
                    <small className="record-time">
                      最后编辑时间：{new Date(record.editedAt).toLocaleString("zh-CN")}
                    </small>
                  )}
                </div>
                <div className="record-item-actions">
                  <button className="edit-btn" onClick={() => setEditingRecord(record)}>编辑</button>
                  <button className="delete-btn" onClick={() => handleDelete(record.id)}>删除</button>
                </div>
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
  const [page, setPage] = useState<PageState>({ type: "dashboard" });
  const [editingRecord, setEditingRecord] = useState<WatchRecord | null>(null);

  if (page.type === "history") {
    return (
      <DeviceHistoryPage
        onBack={() => setPage({ type: "dashboard" })}
        initialCategory={page.category}
        initialDevice={page.device}
      />
    );
  }

  const navigateToHistoryWithCategory = (category: DeviceCategory, deviceName?: string) => {
    setPage({ type: "history", category, device: deviceName });
  };

  return (
    <main className="app">
      <section className="hero">
        <p>{project.id} · Port {project.port}</p>
        <h1>{project.title}</h1>
        <span>
          当前值班：<strong>{currentShift.label}</strong>（{String(currentShift.startHour).padStart(2, "0")}:00 - {String(currentShift.endHour).padStart(2, "0")}:00）
        </span>
      </section>

      <VesselSelector />

      <ShiftSelector />

      <Dashboard />

      <RiskAssessmentPanel />

      <MaintenanceReminder onNavigateToHistory={navigateToHistoryWithCategory} />

      <div id="engine-room-section">
        <EngineRoomPanel />
      </div>

      <div id="bilge-water-section">
        <BilgeWaterPanel />
      </div>

      <section className="workspace">
        <NavAside onNavigate={setPage} />
        <RecordForm editingRecord={editingRecord} setEditingRecord={setEditingRecord} />
      </section>

      <div id="anomaly-timeline-section">
        <AnomalyTimeline />
      </div>

      <ShiftHandover />

      <DataManager />

      <div id="history-records-section">
        <HistoryRecords setEditingRecord={setEditingRecord} />
      </div>
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
