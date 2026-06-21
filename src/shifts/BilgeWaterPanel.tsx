import { useState, useEffect, useMemo } from "react";
import { useShift } from "./ShiftContext";
import {
  BILGE_WARNING_LEVEL,
  BILGE_DANGER_LEVEL,
  BILGE_PUMP_STATUS_OPTIONS,
  BILGE_TREATMENT_OPTIONS,
  getBilgeLevelStatus,
  isBilgeTreatmentUnfinished,
  generateIdempotencyKey,
  type BilgePumpStatus,
  type BilgeTreatmentResult,
  type BilgeWaterRecord,
} from "./types";

const bilgeFields = [
  { key: "liquidLevel", label: "舱底水液位", unit: "%", placeholder: "请输入液位百分比（0-100）" },
  { key: "pumpRunDuration", label: "泵运行时长", unit: "min", placeholder: "请输入本次运行分钟数" },
] as const;

type BilgeForm = {
  liquidLevel: string;
  pumpStatus: BilgePumpStatus;
  pumpRunDuration: string;
  treatmentResult: BilgeTreatmentResult;
  warningNote: string;
};

export function BilgeWaterPanel() {
  const { currentShift, latestBilgeWaterRecord, currentBilgeWaterRecords, addBilgeWaterRecord, updateBilgeWaterRecord, deleteBilgeWaterRecord } = useShift();
  const [form, setForm] = useState<BilgeForm>({
    liquidLevel: "",
    pumpStatus: "未运行",
    pumpRunDuration: "0",
    treatmentResult: "未处理",
    warningNote: "",
  });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [saved, setSaved] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(generateIdempotencyKey());
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);

  useEffect(() => {
    if (editingRecordId) return;
    if (latestBilgeWaterRecord) {
      setForm({
        liquidLevel: String(latestBilgeWaterRecord.liquidLevel),
        pumpStatus: latestBilgeWaterRecord.pumpStatus,
        pumpRunDuration: String(latestBilgeWaterRecord.pumpRunDuration),
        treatmentResult: latestBilgeWaterRecord.treatmentResult,
        warningNote: latestBilgeWaterRecord.warningNote,
      });
    }
  }, [latestBilgeWaterRecord, editingRecordId]);

  const handleChange = (field: keyof BilgeForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setSaved(false);
    setDuplicateWarning(false);
    setIdempotencyKey(generateIdempotencyKey());
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<string, string>> = {};
    let isValid = true;

    const level = Number(form.liquidLevel.trim());
    if (!form.liquidLevel.trim()) {
      newErrors.liquidLevel = "请填写液位";
      isValid = false;
    } else if (isNaN(level) || level < 0 || level > 100) {
      newErrors.liquidLevel = "请输入 0-100 之间的数字";
      isValid = false;
    }

    const duration = Number(form.pumpRunDuration.trim());
    if (form.pumpRunDuration.trim() === "" || isNaN(duration) || duration < 0) {
      newErrors.pumpRunDuration = "请输入有效的分钟数";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    if (editingRecordId) {
      updateBilgeWaterRecord(editingRecordId, {
        liquidLevel: Number(form.liquidLevel),
        pumpStatus: form.pumpStatus,
        pumpRunDuration: Number(form.pumpRunDuration),
        treatmentResult: form.treatmentResult,
        warningNote: form.warningNote.trim(),
      });
      setEditingRecordId(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return;
    }

    const result = addBilgeWaterRecord({
      liquidLevel: Number(form.liquidLevel),
      pumpStatus: form.pumpStatus,
      pumpRunDuration: Number(form.pumpRunDuration),
      treatmentResult: form.treatmentResult,
      warningNote: form.warningNote.trim(),
      idempotencyKey,
    });

    if (!result.created) {
      setDuplicateWarning(true);
      setTimeout(() => setDuplicateWarning(false), 3000);
      return;
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleEdit = (record: BilgeWaterRecord) => {
    setEditingRecordId(record.id);
    setForm({
      liquidLevel: String(record.liquidLevel),
      pumpStatus: record.pumpStatus,
      pumpRunDuration: String(record.pumpRunDuration),
      treatmentResult: record.treatmentResult,
      warningNote: record.warningNote,
    });
    setErrors({});
    setDuplicateWarning(false);
  };

  const handleCancelEdit = () => {
    setEditingRecordId(null);
    setErrors({});
    setDuplicateWarning(false);
    if (latestBilgeWaterRecord) {
      setForm({
        liquidLevel: String(latestBilgeWaterRecord.liquidLevel),
        pumpStatus: latestBilgeWaterRecord.pumpStatus,
        pumpRunDuration: String(latestBilgeWaterRecord.pumpRunDuration),
        treatmentResult: latestBilgeWaterRecord.treatmentResult,
        warningNote: latestBilgeWaterRecord.warningNote,
      });
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("确定要删除这条舱底水记录吗？")) {
      deleteBilgeWaterRecord(id);
      if (editingRecordId === id) {
        setEditingRecordId(null);
      }
    }
  };

  const levelStatus = latestBilgeWaterRecord
    ? getBilgeLevelStatus(latestBilgeWaterRecord.liquidLevel)
    : "normal";
  const treatmentUnfinished = latestBilgeWaterRecord
    ? isBilgeTreatmentUnfinished(latestBilgeWaterRecord.treatmentResult)
    : false;
  const needsAttention = levelStatus !== "normal" || treatmentUnfinished;

  const fillPercent = latestBilgeWaterRecord
    ? Math.max(0, Math.min(100, latestBilgeWaterRecord.liquidLevel))
    : 0;

  const sortedRecords = useMemo(() => {
    return [...currentBilgeWaterRecords].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [currentBilgeWaterRecords]);

  return (
    <section className={`panel bilge-water-panel ${needsAttention ? "bilge-alert-panel" : ""}`}>
      <div className="heading">
        <div>
          <p>{currentShift.label} · 舱底水系统</p>
          <h2>舱底水状态监控</h2>
        </div>
        {needsAttention && (
          <div className="bilge-alert-badge">
            <span className="alert-pulse" />
            需关注
          </div>
        )}
      </div>

      {needsAttention && latestBilgeWaterRecord && (
        <div className={`bilge-alert-banner bilge-alert-${levelStatus}`}>
          <div className="alert-icon">
            {levelStatus === "danger" ? "🚨" : levelStatus === "warning" ? "⚠️" : "⚙️"}
          </div>
          <div className="alert-content">
            {levelStatus === "danger" && (
              <strong>液位已达危险级别（{latestBilgeWaterRecord.liquidLevel}%），请立即启动排水！</strong>
            )}
            {levelStatus === "warning" && (
              <strong>液位接近警戒线（{latestBilgeWaterRecord.liquidLevel}%），请密切关注！</strong>
            )}
            {levelStatus === "normal" && treatmentUnfinished && (
              <strong>处理状态未完成（{latestBilgeWaterRecord.treatmentResult}），请跟进处理！</strong>
            )}
            {latestBilgeWaterRecord.warningNote && (
              <p>备注：{latestBilgeWaterRecord.warningNote}</p>
            )}
          </div>
        </div>
      )}

      <div className="bilge-dashboard">
        <div className="bilge-tank-visual">
          <div className="tank-container">
            <div
              className={`tank-fill tank-fill-${levelStatus}`}
              style={{ height: `${fillPercent}%` }}
            >
              <div className="tank-fill-text">{fillPercent}%</div>
            </div>
            <div
              className="tank-warning-line"
              style={{ bottom: `${BILGE_WARNING_LEVEL}%` }}
              title="警戒水位 80%"
            >
              <span>警戒 80%</span>
            </div>
            <div
              className="tank-danger-line"
              style={{ bottom: `${BILGE_DANGER_LEVEL}%` }}
              title="危险水位 90%"
            >
              <span>危险 90%</span>
            </div>
            <div className="tank-scale">
              {[0, 25, 50, 75, 100].map((v) => (
                <div key={v} className="scale-mark" style={{ bottom: `${v}%` }}>
                  {v}%
                </div>
              ))}
            </div>
          </div>
          <div className="tank-label">液位可视化</div>
        </div>

        <div className="bilge-status-cards">
          <div className="bilge-status-card">
            <small>当前液位</small>
            <strong className={`level-value level-${levelStatus}`}>
              {latestBilgeWaterRecord ? `${latestBilgeWaterRecord.liquidLevel}%` : "--"}
              <span className="level-status-tag">
                {levelStatus === "danger" ? "危险" : levelStatus === "warning" ? "警戒" : "正常"}
              </span>
            </strong>
          </div>
          <div className="bilge-status-card">
            <small>泵运行状态</small>
            <strong>
              <span className={`pump-indicator pump-${latestBilgeWaterRecord?.pumpStatus ?? "未运行"}`} />
              {latestBilgeWaterRecord?.pumpStatus ?? "--"}
            </strong>
          </div>
          <div className="bilge-status-card">
            <small>运行时长</small>
            <strong>
              {latestBilgeWaterRecord ? `${latestBilgeWaterRecord.pumpRunDuration} min` : "--"}
            </strong>
          </div>
          <div className="bilge-status-card">
            <small>处理结果</small>
            <strong className={treatmentUnfinished ? "treatment-unfinished" : "treatment-ok"}>
              {latestBilgeWaterRecord?.treatmentResult ?? "--"}
            </strong>
          </div>
        </div>
      </div>

      <div className={`bilge-form-divider ${editingRecordId ? "bilge-history-editing" : ""}`}>
        <span>{editingRecordId ? "编辑记录" : "录入新记录"}</span>
      </div>

      {duplicateWarning && (
        <div className="bilge-alert-banner bilge-alert-warning" style={{ marginBottom: "16px" }}>
          <div className="alert-icon">⚠️</div>
          <div className="alert-content">
            <strong>该记录已存在，请勿重复提交</strong>
          </div>
        </div>
      )}

      <div className="field-grid">
        {bilgeFields.map((field) => (
          <label key={field.key}>
            <span>
              {field.label} ({field.unit})
            </span>
            <input
              type="number"
              step="any"
              placeholder={field.placeholder}
              value={form[field.key]}
              onChange={(e) => handleChange(field.key, e.target.value)}
              className={errors[field.key] ? "input-error" : ""}
            />
            {errors[field.key] && <span className="error-text">{errors[field.key]}</span>}
          </label>
        ))}

        <label>
          <span>泵运行情况</span>
          <select
            value={form.pumpStatus}
            onChange={(e) => handleChange("pumpStatus", e.target.value)}
          >
            {BILGE_PUMP_STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </label>

        <label>
          <span>排水处理结果</span>
          <select
            value={form.treatmentResult}
            onChange={(e) => handleChange("treatmentResult", e.target.value)}
          >
            {BILGE_TREATMENT_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </label>

        <label className="col-span-2">
          <span>警戒线备注</span>
          <input
            placeholder="填写警戒线相关备注，如异常情况、处理措施等…"
            value={form.warningNote}
            onChange={(e) => handleChange("warningNote", e.target.value)}
          />
        </label>
      </div>

      <div className="bilge-form-actions">
        {latestBilgeWaterRecord && !editingRecordId && (
          <small>
            最近录入：{new Date(latestBilgeWaterRecord.createdAt).toLocaleString("zh-CN")}
            {currentBilgeWaterRecords.length > 1 && ` · 本班次共 ${currentBilgeWaterRecords.length} 条记录`}
          </small>
        )}
        {editingRecordId && (
          <small>正在编辑记录</small>
        )}
        <div style={{ display: "flex", gap: "10px" }}>
          {editingRecordId && (
            <button onClick={handleCancelEdit}>取消编辑</button>
          )}
          <button className="primary" onClick={handleSubmit}>
            {saved ? "已保存 ✓" : editingRecordId ? "更新记录" : "保存舱底水记录"}
          </button>
        </div>
      </div>

      {sortedRecords.length > 0 && (
        <div className="bilge-history-list">
          <div className="bilge-form-divider" style={{ marginTop: "20px" }}>
            <span>本班次记录历史（{sortedRecords.length}）</span>
            {sortedRecords.filter(
              (r) =>
                getBilgeLevelStatus(r.liquidLevel) !== "normal" ||
                isBilgeTreatmentUnfinished(r.treatmentResult) ||
                r.pumpStatus === "故障"
            ).length > 0 && (
              <span className="history-alert-count">
                <span className="alert-dot-small" />
                需关注{" "}
                {
                  sortedRecords.filter(
                    (r) =>
                      getBilgeLevelStatus(r.liquidLevel) !== "normal" ||
                      isBilgeTreatmentUnfinished(r.treatmentResult) ||
                      r.pumpStatus === "故障"
                  ).length
                }
                条
              </span>
            )}
          </div>
          {sortedRecords.map((record) => {
            const recLevelStatus = getBilgeLevelStatus(record.liquidLevel);
            const recTreatmentUnfinished = isBilgeTreatmentUnfinished(record.treatmentResult);
            const recPumpFault = record.pumpStatus === "故障";
            const isAlertRec =
              recLevelStatus !== "normal" || recTreatmentUnfinished || recPumpFault;
            return (
              <div
                key={record.id}
                className={`bilge-history-item ${editingRecordId === record.id ? "bilge-history-editing" : ""} ${
                  isAlertRec ? "bilge-history-alert" : ""
                } ${recLevelStatus === "danger" ? "bilge-history-danger" : ""}`}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "6px" }}>
                    {isAlertRec && (
                      <span className={`history-alert-icon ${recLevelStatus === "danger" ? "danger-icon" : "warning-icon"}`}>
                        {recLevelStatus === "danger" ? "🚨" : "⚠️"}
                      </span>
                    )}
                    <strong className={`bilge-level-value level-${recLevelStatus}`}>
                      {record.liquidLevel}%
                      <span className="level-status-tag">
                        {recLevelStatus === "danger" ? "危险" : recLevelStatus === "warning" ? "警戒" : "正常"}
                      </span>
                    </strong>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      <span className={`pump-indicator pump-${record.pumpStatus}`} />
                      {record.pumpStatus}
                    </span>
                    <span>{record.pumpRunDuration} min</span>
                    <span className={isBilgeTreatmentUnfinished(record.treatmentResult) ? "treatment-unfinished" : "treatment-ok"}>
                      {record.treatmentResult}
                    </span>
                    {record.isEdited && (
                      <span style={{ fontSize: "11px", color: "#94a3b8" }}>（已编辑）</span>
                    )}
                  </div>
                  {isAlertRec && (
                    <div className="history-alert-tags">
                      {recLevelStatus === "danger" && <span className="alert-tag alert-danger">液位危险</span>}
                      {recLevelStatus === "warning" && <span className="alert-tag alert-warning">液位警戒</span>}
                      {recPumpFault && <span className="alert-tag alert-danger">泵故障</span>}
                      {recTreatmentUnfinished && <span className="alert-tag alert-warning">处理未完成</span>}
                    </div>
                  )}
                  {record.warningNote && (
                    <p className="history-warning-note">
                      📝 {record.warningNote}
                    </p>
                  )}
                  <small style={{ display: "block", marginTop: "4px", color: "#94a3b8" }}>
                    {new Date(record.createdAt).toLocaleString("zh-CN")}
                    {record.editedAt && ` · 编辑于 ${new Date(record.editedAt).toLocaleString("zh-CN")}`}
                  </small>
                </div>
                <div className="bilge-history-actions">
                  <button className="edit-btn" onClick={() => handleEdit(record)}>编辑</button>
                  <button className="delete-btn" onClick={() => handleDelete(record.id)}>删除</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
