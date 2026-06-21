import { useState, useEffect } from "react";
import { useShift } from "./ShiftContext";
import {
  BILGE_WARNING_LEVEL,
  BILGE_DANGER_LEVEL,
  BILGE_PUMP_STATUS_OPTIONS,
  BILGE_TREATMENT_OPTIONS,
  getBilgeLevelStatus,
  isBilgeTreatmentUnfinished,
  type BilgePumpStatus,
  type BilgeTreatmentResult,
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
  const { currentShift, latestBilgeWaterRecord, currentBilgeWaterRecords, addBilgeWaterRecord } = useShift();
  const [form, setForm] = useState<BilgeForm>({
    liquidLevel: "",
    pumpStatus: "未运行",
    pumpRunDuration: "0",
    treatmentResult: "未处理",
    warningNote: "",
  });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (latestBilgeWaterRecord) {
      setForm({
        liquidLevel: String(latestBilgeWaterRecord.liquidLevel),
        pumpStatus: latestBilgeWaterRecord.pumpStatus,
        pumpRunDuration: String(latestBilgeWaterRecord.pumpRunDuration),
        treatmentResult: latestBilgeWaterRecord.treatmentResult,
        warningNote: latestBilgeWaterRecord.warningNote,
      });
    }
  }, [latestBilgeWaterRecord]);

  const handleChange = (field: keyof BilgeForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setSaved(false);
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

    addBilgeWaterRecord({
      liquidLevel: Number(form.liquidLevel),
      pumpStatus: form.pumpStatus,
      pumpRunDuration: Number(form.pumpRunDuration),
      treatmentResult: form.treatmentResult,
      warningNote: form.warningNote.trim(),
    });

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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

      <div className="bilge-form-divider">
        <span>录入新记录</span>
      </div>

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
        {latestBilgeWaterRecord && (
          <small>
            最近录入：{new Date(latestBilgeWaterRecord.createdAt).toLocaleString("zh-CN")}
            {currentBilgeWaterRecords.length > 1 && ` · 本班次共 ${currentBilgeWaterRecords.length} 条记录`}
          </small>
        )}
        <button className="primary" onClick={handleSubmit}>
          {saved ? "已保存 ✓" : "保存舱底水记录"}
        </button>
      </div>
    </section>
  );
}
