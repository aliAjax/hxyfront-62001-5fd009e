import { useState, useMemo, useEffect } from "react";
import { useShift } from "./ShiftContext";
import {
  ANOMALY_STATUS_OPTIONS,
  SHIFTS,
  getStatusClass,
  generateIdempotencyKey,
  type AnomalyStatus,
  type AnomalyRecord,
  type HandoverStep,
} from "./domain";

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

interface AnomalyEditForm {
  device: string;
  anomalyDescription: string;
  reviewTime: string;
  handoverNote: string;
}

interface ToastMessage {
  id: string;
  text: string;
  type: "info" | "warning" | "success" | "error";
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

function getShiftLabelById(shiftId: string): string {
  const shift = SHIFTS.find((s) => s.id === shiftId);
  return shift ? shift.label : shiftId;
}

function AnomalyForm({
  onSubmit,
  idempotencyKey,
}: {
  onSubmit: (data: AnomalyFormData & { idempotencyKey: string }) => { created: boolean };
  idempotencyKey: string;
}) {
  const { currentShift } = useShift();
  const [form, setForm] = useState<AnomalyFormData>({
    device: "",
    anomalyDescription: "",
    status: "待处理",
    reviewTime: formatDateTimeLocal(new Date().toISOString()),
    handoverNote: "",
  });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [saved, setSaved] = useState(false);
  const [duplicateError, setDuplicateError] = useState("");

  const handleChange = (field: keyof AnomalyFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setSaved(false);
    setDuplicateError("");
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
    const result = onSubmit({ ...form, idempotencyKey });
    if (!result.created) {
      setDuplicateError("该异常记录已存在，请勿重复提交");
      return;
    }
    setForm({
      device: "",
      anomalyDescription: "",
      status: "待处理",
      reviewTime: formatDateTimeLocal(new Date().toISOString()),
      handoverNote: "",
    });
    setErrors({});
    setDuplicateError("");
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
      {duplicateError && (
        <div className="error-banner" style={{ marginBottom: "16px" }}>
          <strong>{duplicateError}</strong>
        </div>
      )}
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

function AnomalyEditModal({
  record,
  onClose,
  onSubmit,
}: {
  record: AnomalyRecord;
  onClose: () => void;
  onSubmit: (recordId: string, patch: Partial<AnomalyEditForm>) => void;
}) {
  const [form, setForm] = useState<AnomalyEditForm>({
    device: record.device,
    anomalyDescription: record.anomalyDescription,
    reviewTime: formatDateTimeLocal(record.reviewTime),
    handoverNote: record.handoverNote,
  });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  const handleChange = (field: keyof AnomalyEditForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
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
    onSubmit(record.id, {
      device: form.device.trim(),
      anomalyDescription: form.anomalyDescription.trim(),
      reviewTime: form.reviewTime ? new Date(form.reviewTime).toISOString() : "",
      handoverNote: form.handoverNote.trim(),
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>编辑异常记录</h3>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="field-grid">
            <label>
              <span>设备名称 *</span>
              <input
                value={form.device}
                onChange={(e) => handleChange("device", e.target.value)}
                className={errors.device ? "input-error" : ""}
              />
              {errors.device && <span className="error-text">{errors.device}</span>}
            </label>
            <label>
              <span>复查时间</span>
              <input
                type="datetime-local"
                value={form.reviewTime}
                onChange={(e) => handleChange("reviewTime", e.target.value)}
              />
            </label>
            <label className="col-span-2">
              <span>异常描述 *</span>
              <input
                value={form.anomalyDescription}
                onChange={(e) => handleChange("anomalyDescription", e.target.value)}
                className={errors.anomalyDescription ? "input-error" : ""}
              />
              {errors.anomalyDescription && (
                <span className="error-text">{errors.anomalyDescription}</span>
              )}
            </label>
            <label className="col-span-2">
              <span>交接备注</span>
              <input
                placeholder="需要下一班注意的事项"
                value={form.handoverNote}
                onChange={(e) => handleChange("handoverNote", e.target.value)}
              />
            </label>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose}>取消</button>
          <button className="primary" onClick={handleSubmit}>
            保存修改
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({
  title,
  message,
  onClose,
  onConfirm,
}: {
  title: string;
  message: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p style={{ margin: 0, color: "#334155", lineHeight: 1.6 }}>{message}</p>
        </div>
        <div className="modal-footer">
          <button onClick={onClose}>取消</button>
          <button
            className="primary"
            style={{ background: "#dc2626", borderColor: "#dc2626" }}
            onClick={onConfirm}
          >
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
}

function ToastContainer({ toasts }: { toasts: ToastMessage[] }) {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: "20px",
        right: "20px",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="toast-message"
          style={{
            padding: "12px 18px",
            borderRadius: "8px",
            background: toast.type === "info" ? "#f0fdfa" : 
                       toast.type === "warning" ? "#fffbeb" :
                       toast.type === "error" ? "#fef2f2" : "#f0fdf4",
            border: `1px solid ${toast.type === "info" ? "#99f6e4" :
                                toast.type === "warning" ? "#fde68a" :
                                toast.type === "error" ? "#fecaca" : "#bbf7d0"}`,
            color: toast.type === "info" ? "#0f766e" :
                   toast.type === "warning" ? "#92400e" :
                   toast.type === "error" ? "#991b1b" : "#166534",
            fontWeight: 600,
            fontSize: "13px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
            animation: "toastSlideIn 0.3s ease",
          }}
        >
          {toast.text}
        </div>
      ))}
    </div>
  );
}

function TimelineCard({
  record,
  onUpdateStatus,
  onEdit,
  onDelete,
  index,
}: {
  record: AnomalyRecord;
  onUpdateStatus: (record: AnomalyRecord) => void;
  onEdit: (record: AnomalyRecord) => void;
  onDelete: (record: AnomalyRecord) => void;
  index: number;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [showHandoverPath, setShowHandoverPath] = useState(false);
  const {
    getAnomalyOriginShiftLabel,
    getAnomalyCurrentShiftLabel,
    getAnomalyCloseShiftLabel,
    getHandoverPathLabels,
    formatHandoverPath,
    getAnomalyLifecycleStatus,
  } = useShift();

  const originLabel = getAnomalyOriginShiftLabel(record);
  const currentLabel = getAnomalyCurrentShiftLabel(record);
  const closeLabel = getAnomalyCloseShiftLabel(record);
  const handoverPathLabels = getHandoverPathLabels(record);
  const handoverPathStr = formatHandoverPath(record);
  const lifecycleStatus = getAnomalyLifecycleStatus(record);
  const hasHandoverPath = handoverPathLabels.length > 1;

  const getLifecycleBadge = () => {
    switch (lifecycleStatus) {
      case "closed":
        return { text: "已关闭", className: "lifecycle-badge lifecycle-closed" };
      case "carried":
        return { text: "跨班次流转", className: "lifecycle-badge lifecycle-carried" };
      case "reopened":
        return { text: "已重新打开", className: "lifecycle-badge lifecycle-reopened" };
      default:
        return { text: "本班新增", className: "lifecycle-badge lifecycle-open" };
    }
  };

  const lifecycleBadge = getLifecycleBadge();

  return (
    <div className="timeline-card">
      <div className="timeline-dot" data-status={record.currentStatus}>
        {index + 1}
      </div>
      <div className="timeline-content">
        <div className="timeline-header">
          <div className="timeline-title-row">
            <h4 className="timeline-device">{record.device}</h4>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span className={lifecycleBadge.className}>{lifecycleBadge.text}</span>
              {record.isCarriedOver && record.carryOverFromShiftId && (
                <span className="carryover-tag">
                  从 {getShiftLabelById(record.carryOverFromShiftId)} 交接
                </span>
              )}
              <span
                className={`status-tag ${getStatusClass(record.currentStatus)}`}
              >
                {record.currentStatus}
              </span>
            </div>
          </div>
          <div className="timeline-meta">
            <span>{formatDisplay(record.createdAt)}</span>
            <span className="timeline-shift">{record.createdBy}</span>
          </div>
        </div>

        <div className="timeline-body">
          <div className="lifecycle-info-panel">
            <div className="lifecycle-row">
              <div className="lifecycle-item">
                <span className="lifecycle-label">📍 原始班次</span>
                <span className="lifecycle-value origin">{originLabel}</span>
              </div>
              <div className="lifecycle-item">
                <span className="lifecycle-label">🔄 当前处理班次</span>
                <span className="lifecycle-value current">{currentLabel}</span>
              </div>
              {closeLabel && (
                <div className="lifecycle-item">
                  <span className="lifecycle-label">✅ 关闭班次</span>
                  <span className="lifecycle-value closed">{closeLabel}</span>
                </div>
              )}
            </div>
            {hasHandoverPath && (
              <div className="handover-path-display">
                <div
                  className="handover-path-header"
                  onClick={() => setShowHandoverPath(!showHandoverPath)}
                >
                  <span className="handover-path-label">交接路径：{handoverPathStr}</span>
                  <span className="expand-arrow">{showHandoverPath ? "▲" : "▼"}</span>
                </div>
                {showHandoverPath && (
                  <div className="handover-path-visual">
                    <div className="handover-path-flow">
                      {handoverPathLabels.map((label, i) => (
                        <div key={i} className="handover-path-node">
                          <div className={`path-node ${i === 0 ? "path-node-origin" : i === handoverPathLabels.length - 1 ? "path-node-current" : "path-node-middle"}`}>
                            {label}
                          </div>
                          {i < handoverPathLabels.length - 1 && (
                            <div className="path-arrow">→</div>
                          )}
                        </div>
                      ))}
                    </div>
                    {record.handoverPath && record.handoverPath.length > 0 && (
                      <div className="handover-steps-detail">
                        <h5 className="handover-steps-title">交接明细</h5>
                        {record.handoverPath.map((step: HandoverStep, i: number) => (
                          <div key={step.id} className="handover-step-item">
                            <span className="step-index">#{i + 1}</span>
                            <span className="step-shift">
                              {getShiftLabelById(step.fromShiftId)} → {getShiftLabelById(step.toShiftId)}
                            </span>
                            <span className="step-time">{formatDisplay(step.handedAt)}</span>
                            <span className="step-operator">{step.handedBy}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

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
          {record.closedAt && (
            <div className="info-row">
              <span className="info-label">关闭时间</span>
              <span className="info-value">{formatDisplay(record.closedAt)}</span>
              {record.closedBy && <span className="info-value">· {record.closedBy}</span>}
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
                        {update.shiftId && (
                          <span className="history-shift">{getShiftLabelById(update.shiftId)}</span>
                        )}
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
          <button className="edit-btn" onClick={() => onEdit(record)}>
            编辑
          </button>
          <button
            className="delete-btn"
            onClick={() => onDelete(record)}
            style={{
              color: "#dc2626",
              borderColor: "#fecaca",
              background: "#fef2f2",
            }}
          >
            删除
          </button>
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
  const {
    currentShift,
    allAnomalyRecords,
    addAnomalyRecord,
    updateAnomalyStatus,
    updateAnomalyRecord,
    deleteAnomalyRecord,
  } = useShift();

  const [statusUpdateRecord, setStatusUpdateRecord] = useState<AnomalyRecord | null>(null);
  const [editingRecord, setEditingRecord] = useState<AnomalyRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<AnomalyRecord | null>(null);
  const [filterStatus, setFilterStatus] = useState<AnomalyStatus | "全部">("全部");
  const [filterCarriedOver, setFilterCarriedOver] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [anomalyFormKey, setAnomalyFormKey] = useState(generateIdempotencyKey());

  const showToast = (text: string, type: ToastMessage["type"] = "info") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  const sortedRecords = useMemo(() => {
    let records = [...allAnomalyRecords];
    if (filterStatus !== "全部") {
      records = records.filter((r) => r.currentStatus === filterStatus);
    }
    if (filterCarriedOver) {
      records = records.filter((r) => r.isCarriedOver);
    }
    return records.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [allAnomalyRecords, filterStatus, filterCarriedOver]);

  const handleSubmit = (data: AnomalyFormData & { idempotencyKey: string }) => {
    const result = addAnomalyRecord({
      device: data.device.trim(),
      anomalyDescription: data.anomalyDescription.trim(),
      status: data.status,
      reviewTime: data.reviewTime ? new Date(data.reviewTime).toISOString() : "",
      handoverNote: data.handoverNote.trim(),
      idempotencyKey: data.idempotencyKey,
    });
    if (result.created) {
      showToast("交接班摘要将自动更新", "info");
      setAnomalyFormKey(generateIdempotencyKey());
    }
    return result;
  };

  const handleUpdateStatus = (
    recordId: string,
    newStatus: AnomalyStatus,
    note: string
  ) => {
    updateAnomalyStatus(recordId, newStatus, note.trim(), currentShift.label);
    showToast("交接班摘要将自动更新", "info");
  };

  const handleEditSubmit = (
    recordId: string,
    patch: Partial<AnomalyEditForm>
  ) => {
    updateAnomalyRecord(recordId, patch);
    showToast("交接班摘要将自动更新", "info");
  };

  const handleDelete = () => {
    if (deletingRecord) {
      deleteAnomalyRecord(deletingRecord.id);
      showToast("交接班摘要将自动更新", "info");
      setDeletingRecord(null);
    }
  };

  return (
    <section className="anomaly-timeline-module">
      <ToastContainer toasts={toasts} />

      <AnomalyForm onSubmit={handleSubmit} idempotencyKey={anomalyFormKey} />

      <section className="panel timeline-panel">
        <div className="heading">
          <div>
            <p>异常巡检</p>
            <h2>时间线记录</h2>
          </div>
          <div className="filter-bar" style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
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
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                minHeight: "38px",
                padding: "0 12px",
                border: "1px solid var(--border)",
                borderRadius: "7px",
                background: "#ffffff",
                cursor: "pointer",
                fontSize: "13px",
                color: filterCarriedOver ? "var(--primary)" : "#475569",
                fontWeight: filterCarriedOver ? 600 : 400,
                borderColor: filterCarriedOver ? "var(--primary)" : "var(--border)",
              }}
            >
              <input
                type="checkbox"
                checked={filterCarriedOver}
                onChange={(e) => setFilterCarriedOver(e.target.checked)}
                style={{ width: "auto", minHeight: "auto", margin: 0 }}
              />
              仅显示遗留项
            </label>
          </div>
        </div>

        <StatsBar records={allAnomalyRecords} />

        {sortedRecords.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            暂无异常记录
            <span>
              {filterCarriedOver
                ? "暂无跨班次遗留的异常记录"
                : filterStatus !== "全部"
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
                onUpdateStatus={setStatusUpdateRecord}
                onEdit={setEditingRecord}
                onDelete={setDeletingRecord}
              />
            ))}
          </div>
        )}
      </section>

      {statusUpdateRecord && (
        <StatusUpdateModal
          record={statusUpdateRecord}
          onClose={() => setStatusUpdateRecord(null)}
          onSubmit={handleUpdateStatus}
        />
      )}

      {editingRecord && (
        <AnomalyEditModal
          record={editingRecord}
          onClose={() => setEditingRecord(null)}
          onSubmit={handleEditSubmit}
        />
      )}

      {deletingRecord && (
        <ConfirmModal
          title="确认删除"
          message={`确定要删除设备「${deletingRecord.device}」的异常记录吗？此操作不可撤销。`}
          onClose={() => setDeletingRecord(null)}
          onConfirm={handleDelete}
        />
      )}
    </section>
  );
}
