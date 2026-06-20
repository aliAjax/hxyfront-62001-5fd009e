import { useState, useMemo } from "react";
import { useShift } from "./ShiftContext";
import {
  ANOMALY_STATUS_OPTIONS,
  getStatusClass,
  type AnomalyStatus,
  type AnomalyRecord,
} from "./types";

interface AnomalyFormData {
  device: string;
  anomalyDescription: string;
  status: AnomalyStatus;
  reviewTime: string;
  handoverNote: string;
}

interface StatusUpdateForm {
  recordId: string;
  newStatus: AnomalyStatus;
  note: string;
}

function formatDateTimeLocal(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDisplay(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AnomalyForm({
  onSubmit,
}: {
  onSubmit: (data: AnomalyFormData) => void;
}) {
  const { currentShift } = useShift();
  const [form, setForm] = useState<AnomalyFormData>({
    device: "",
    anomalyDescription: "",
    status: "待处理",
    reviewTime: formatDateTimeLocal(new Date().toISOString()),
    handoverNote: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const handleChange = (field: keyof AnomalyFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setSaved(false);
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.device.trim()) newErrors.device = "请填写设备名称";
    if (!form.anomalyDescription.trim()) newErrors.anomalyDescription = "请填写异常描述";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    onSubmit(form);
    setForm({
      device: "",
      anomalyDescription: "",
      status: "待处理",
      reviewTime: formatDateTimeLocal(new Date().toISOString()),
      handoverNote: "",
    });
    setErrors({});
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <section className="panel anomaly-form-panel">
      <div className="heading">
        <div>
          <p>{currentShift.label} · 异常巡检</p>
          <h2>提交异常记录</h2>
        </div>
        <button className="primary" onClick={handleSubmit}>
          {saved ? "已提交 ✓" : "提交记录"}
        </button>
      </div>
      <div className="field-grid">
        <label>
          <span>设备名称 *</span>
          <input
            placeholder="例如：主机、1号发电机、冷却水泵"
            value={form.device}
            onChange={(e) => handleChange("device", e.target.value)}
            className={errors.device ? "input-error" : ""}
          />
          {errors.device && <span className="error-text">{errors.device}</span>}
        </label>
        <label>
          <span>处理状态</span>
          <select
            value={form.status}
            onChange={(e) => handleChange("status", e.target.value)}
          >
            {ANOMALY_STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2">
          <span>异常描述 *</span>
          <input
            placeholder="请详细描述异常现象、发生时间、影响范围等"
            value={form.anomalyDescription}
            onChange={(e) => handleChange("anomalyDescription", e.target.value)}
            className={errors.anomalyDescription ? "input-error" : ""}
          />
          {errors.anomalyDescription && (
            <span className="error-text">{errors.anomalyDescription}</span>
          )}
        </label>
        <label>
          <span>复查时间</span>
          <input
            type="datetime-local"
            value={form.reviewTime}
            onChange={(e) => handleChange("reviewTime", e.target.value)}
          />
        </label>
        <label>
          <span>交接备注</span>
          <input
            placeholder="需要下一班注意的事项"
            value={form.handoverNote}
            onChange={(e) => handleChange("handoverNote", e.target.value)}
          />
        </label>
      </div>
    </section>
  );
}

function StatusUpdateModal({
  record,
  onClose,
  onSubmit,
}: {
  record: AnomalyRecord;
  onClose: () => void;
  onSubmit: (recordId: string, newStatus: AnomalyStatus, note: string) => void;
}) {
  const { currentShift } = useShift();
  const [newStatus, setNewStatus] = useState<AnomalyStatus>(record.currentStatus);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = () => {
    if (newStatus === record.currentStatus && !note.trim()) {
      setError("状态未变更或请填写处理备注");
      return;
    }
    onSubmit(record.id, newStatus, note);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>更新状态</h3>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="original-info">
            <p>
              <strong>设备：</strong>
              {record.device}
            </p>
            <p>
              <strong>原始异常：</strong>
              {record.anomalyDescription}
            </p>
            <p>
              <strong>当前状态：</strong>
              <span
                className={`status-tag ${getStatusClass(record.currentStatus)}`}
              >
                {record.currentStatus}
              </span>
            </p>
          </div>
          <div className="field-grid" style={{ marginTop: "16px" }}>
            <label>
              <span>新状态</span>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as AnomalyStatus)}
              >
                {ANOMALY_STATUS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>操作人</span>
              <input value={currentShift.label} disabled />
            </label>
            <label className="col-span-2">
              <span>处理备注</span>
              <input
                placeholder="描述处理措施、结果或复查说明"
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  setError("");
                }}
              />
            </label>
          </div>
          {error && <p className="error-text" style={{ marginTop: "8px" }}>{error}</p>}
        </div>
        <div className="modal-footer">
          <button onClick={onClose}>取消</button>
          <button className="primary" onClick={handleSubmit}>
            确认更新
          </button>
        </div>
      </div>
    </div>
  );
}

function TimelineCard({
  record,
  onUpdateStatus,
  index,
}: {
  record: AnomalyRecord;
  onUpdateStatus: (record: AnomalyRecord) => void;
  index: number;
}) {
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="timeline-card">
      <div className="timeline-dot" data-status={record.currentStatus}>
        {index + 1}
      </div>
      <div className="timeline-content">
        <div className="timeline-header">
          <div className="timeline-title-row">
            <h4 className="timeline-device">{record.device}</h4>
            <span
              className={`status-tag ${getStatusClass(record.currentStatus)}`}
            >
              {record.currentStatus}
            </span>
          </div>
          <div className="timeline-meta">
            <span>{formatDisplay(record.createdAt)}</span>
            <span className="timeline-shift">{record.createdBy}</span>
          </div>
        </div>

        <div className="timeline-body">
          <div className="info-row">
            <span className="info-label">异常描述</span>
            <span className="info-value anomaly-desc">{record.anomalyDescription}</span>
          </div>
          {record.reviewTime && (
            <div className="info-row">
              <span className="info-label">复查时间</span>
              <span className="info-value">{formatDisplay(record.reviewTime)}</span>
            </div>
          )}
          {record.handoverNote && (
            <div className="info-row">
              <span className="info-label">交接备注</span>
              <span className="info-value">{record.handoverNote}</span>
            </div>
          )}
          {record.initialStatus !== record.currentStatus && (
            <div className="info-row">
              <span className="info-label">原始状态</span>
              <span className={`status-tag ${getStatusClass(record.initialStatus)}`}>
                {record.initialStatus}
              </span>
            </div>
          )}
        </div>

        {record.statusHistory.length > 0 && (
          <div className="status-history-section">
            <button
              className="history-toggle-btn"
              onClick={() => setShowHistory(!showHistory)}
            >
              {showHistory ? "收起" : "查看"}状态变更记录 ({record.statusHistory.length})
              <span className={`arrow ${showHistory ? "up" : "down"}`}>▼</span>
            </button>
            {showHistory && (
              <div className="status-history-list">
                {record.statusHistory.map((update, i) => (
                  <div key={update.id} className="history-item">
                    <div className="history-index">#{i + 1}</div>
                    <div className="history-content">
                      <div className="history-header">
                        <span className={`status-tag ${getStatusClass(update.status)}`}>
                          {update.status}
                        </span>
                        <span className="history-time">{formatDisplay(update.updatedAt)}</span>
                        <span className="history-operator">{update.updatedBy}</span>
                      </div>
                      {update.note && (
                        <p className="history-note">{update.note}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="timeline-actions">
          <button className="update-btn" onClick={() => onUpdateStatus(record)}>
            更新状态
          </button>
        </div>
      </div>
    </div>
  );
}

function StatsBar({ records }: { records: AnomalyRecord[] }) {
  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    ANOMALY_STATUS_OPTIONS.forEach((s) => (counts[s] = 0));
    records.forEach((r) => {
      counts[r.currentStatus] = (counts[r.currentStatus] ?? 0) + 1;
    });
    return counts;
  }, [records]);

  return (
    <div className="stats-bar">
      <div className="stat-total">
        <strong>{records.length}</strong>
        <span>异常总数</span>
      </div>
      {ANOMALY_STATUS_OPTIONS.map((status) => (
        <div key={status} className="stat-item">
          <span className={`status-dot ${getStatusClass(status)}`}></span>
          <span className="stat-label">{status}</span>
          <span className="stat-count">{stats[status] ?? 0}</span>
        </div>
      ))}
    </div>
  );
}

export function AnomalyTimeline() {
  const { currentShift, allAnomalyRecords, addAnomalyRecord, updateAnomalyStatus } = useShift();
  const [editingRecord, setEditingRecord] = useState<AnomalyRecord | null>(null);
  const [filterStatus, setFilterStatus] = useState<AnomalyStatus | "全部">("全部");

  const sortedRecords = useMemo(() => {
    let records = [...allAnomalyRecords];
    if (filterStatus !== "全部") {
      records = records.filter((r) => r.currentStatus === filterStatus);
    }
    return records.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [allAnomalyRecords, filterStatus]);

  const handleSubmit = (data: AnomalyFormData) => {
    addAnomalyRecord({
      device: data.device.trim(),
      anomalyDescription: data.anomalyDescription.trim(),
      status: data.status,
      reviewTime: data.reviewTime ? new Date(data.reviewTime).toISOString() : "",
      handoverNote: data.handoverNote.trim(),
    });
  };

  const handleUpdateStatus = (
    recordId: string,
    newStatus: AnomalyStatus,
    note: string
  ) => {
    updateAnomalyStatus(recordId, newStatus, note.trim(), currentShift.label);
  };

  return (
    <section className="anomaly-timeline-module">
      <AnomalyForm onSubmit={handleSubmit} />

      <section className="panel timeline-panel">
        <div className="heading">
          <div>
            <p>异常巡检</p>
            <h2>时间线记录</h2>
          </div>
          <div className="filter-bar">
            <select
              value={filterStatus}
              onChange={(e) =>
                setFilterStatus(e.target.value as AnomalyStatus | "全部")
              }
            >
              <option value="全部">全部状态</option>
              {ANOMALY_STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>

        <StatsBar records={allAnomalyRecords} />

        {sortedRecords.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            暂无异常记录
            <span>
              {filterStatus !== "全部"
                ? `${filterStatus}状态下暂无记录`
                : "提交第一条异常记录开始追踪"}
            </span>
          </div>
        ) : (
          <div className="timeline-container">
            {sortedRecords.map((record, index) => (
              <TimelineCard
                key={record.id}
                record={record}
                index={index}
                onUpdateStatus={setEditingRecord}
              />
            ))}
          </div>
        )}
      </section>

      {editingRecord && (
        <StatusUpdateModal
          record={editingRecord}
          onClose={() => setEditingRecord(null)}
          onSubmit={handleUpdateStatus}
        />
      )}
    </section>
  );
}
