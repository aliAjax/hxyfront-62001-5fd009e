import { useState, useEffect, useMemo } from "react";
import { useShift } from "./ShiftContext";
import { generateIdempotencyKey, type EngineRoomRecord } from "./domain";

const engineRoomFields = [
  { key: "mainEngineSpeed", label: "主机转速", unit: "rpm", placeholder: "请输入主机转速" },
  { key: "lubricatingOilPressure", label: "滑油压力", unit: "MPa", placeholder: "请输入滑油压力" },
  { key: "coolingWaterTemp", label: "冷却水温", unit: "℃", placeholder: "请输入冷却水温" },
  { key: "fuelConsumption", label: "燃油消耗", unit: "L/h", placeholder: "请输入燃油消耗" },
] as const;

type EngineRoomForm = {
  mainEngineSpeed: string;
  lubricatingOilPressure: string;
  coolingWaterTemp: string;
  fuelConsumption: string;
};

export function EngineRoomPanel() {
  const {
    currentShift,
    latestEngineRoomRecord,
    currentEngineRoomRecords,
    engineRoomRecords,
    addEngineRoomRecord,
    updateEngineRoomRecord,
    deleteEngineRoomRecord,
  } = useShift();

  const [form, setForm] = useState<EngineRoomForm>({
    mainEngineSpeed: "",
    lubricatingOilPressure: "",
    coolingWaterTemp: "",
    fuelConsumption: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof EngineRoomForm, string>>>({});
  const [saved, setSaved] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey());
  const [editingRecord, setEditingRecord] = useState<EngineRoomRecord | null>(null);

  useEffect(() => {
    if (editingRecord) return;
    if (latestEngineRoomRecord) {
      setForm({
        mainEngineSpeed: String(latestEngineRoomRecord.mainEngineSpeed),
        lubricatingOilPressure: String(latestEngineRoomRecord.lubricatingOilPressure),
        coolingWaterTemp: String(latestEngineRoomRecord.coolingWaterTemp),
        fuelConsumption: String(latestEngineRoomRecord.fuelConsumption),
      });
    }
  }, [latestEngineRoomRecord, editingRecord]);

  const handleChange = (field: keyof EngineRoomForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setSaved(false);
    setDuplicateWarning(false);
    setIdempotencyKey(generateIdempotencyKey());
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof EngineRoomForm, string>> = {};
    let isValid = true;

    engineRoomFields.forEach((field) => {
      const value = form[field.key].trim();
      if (!value) {
        newErrors[field.key] = "请填写此项";
        isValid = false;
      } else if (isNaN(Number(value))) {
        newErrors[field.key] = "请输入有效的数字";
        isValid = false;
      }
    });

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    const payload = {
      mainEngineSpeed: Number(form.mainEngineSpeed),
      lubricatingOilPressure: Number(form.lubricatingOilPressure),
      coolingWaterTemp: Number(form.coolingWaterTemp),
      fuelConsumption: Number(form.fuelConsumption),
    };

    const result = addEngineRoomRecord({ ...payload, idempotencyKey });

    if (result.created) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      setDuplicateWarning(true);
      setTimeout(() => setDuplicateWarning(false), 3000);
    }
  };

  const handleEdit = (record: EngineRoomRecord) => {
    setEditingRecord(record);
    setForm({
      mainEngineSpeed: String(record.mainEngineSpeed),
      lubricatingOilPressure: String(record.lubricatingOilPressure),
      coolingWaterTemp: String(record.coolingWaterTemp),
      fuelConsumption: String(record.fuelConsumption),
    });
    setErrors({});
    setSaved(false);
    setDuplicateWarning(false);
  };

  const handleCancelEdit = () => {
    setEditingRecord(null);
    setErrors({});
    setSaved(false);
    setDuplicateWarning(false);
    if (latestEngineRoomRecord) {
      setForm({
        mainEngineSpeed: String(latestEngineRoomRecord.mainEngineSpeed),
        lubricatingOilPressure: String(latestEngineRoomRecord.lubricatingOilPressure),
        coolingWaterTemp: String(latestEngineRoomRecord.coolingWaterTemp),
        fuelConsumption: String(latestEngineRoomRecord.fuelConsumption),
      });
    } else {
      setForm({
        mainEngineSpeed: "",
        lubricatingOilPressure: "",
        coolingWaterTemp: "",
        fuelConsumption: "",
      });
    }
  };

  const handleUpdate = () => {
    if (!editingRecord || !validate()) return;

    const patch = {
      mainEngineSpeed: Number(form.mainEngineSpeed),
      lubricatingOilPressure: Number(form.lubricatingOilPressure),
      coolingWaterTemp: Number(form.coolingWaterTemp),
      fuelConsumption: Number(form.fuelConsumption),
    };

    updateEngineRoomRecord(editingRecord.id, patch);
    setEditingRecord(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDelete = (record: EngineRoomRecord) => {
    if (!window.confirm(`确认删除该记录吗？\n录入时间：${new Date(record.createdAt).toLocaleString("zh-CN")}`)) {
      return;
    }
    deleteEngineRoomRecord(record.id);
    if (editingRecord?.id === record.id) {
      handleCancelEdit();
    }
  };

  const sortedRecords = [...currentEngineRoomRecords].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const allSortedRecords = useMemo(() => {
    const all = Object.values(engineRoomRecords)
      .flat()
      .filter((r) => !r.deletedAt);
    return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [engineRoomRecords]);

  const comparisonRecord = useMemo<EngineRoomRecord | null>(() => {
    if (editingRecord) {
      const idx = allSortedRecords.findIndex((r) => r.id === editingRecord.id);
      if (idx >= 0 && idx < allSortedRecords.length - 1) {
        return allSortedRecords[idx + 1];
      }
      return null;
    }
    return latestEngineRoomRecord ?? null;
  }, [editingRecord, allSortedRecords, latestEngineRoomRecord]);

  const computeDiff = (field: keyof EngineRoomForm): { value: number; sign: "up" | "down" | "zero" } | null => {
    if (!comparisonRecord) return null;
    const rawValue = form[field].trim();
    if (!rawValue) return null;
    const current = Number(rawValue);
    const prev = comparisonRecord[field as keyof EngineRoomRecord] as number;
    if (isNaN(current) || isNaN(prev)) return null;
    const diff = Number((current - prev).toFixed(2));
    if (diff > 0) return { value: diff, sign: "up" };
    if (diff < 0) return { value: diff, sign: "down" };
    return { value: 0, sign: "zero" };
  };

  const formTitle = editingRecord ? "编辑记录" : "参数录入";
  const submitButtonText = editingRecord
    ? saved
      ? "已更新 ✓"
      : "更新记录"
    : saved
    ? "已保存 ✓"
    : "保存参数";

  return (
    <section className="panel engine-room-panel">
      <div className="heading">
        <div>
          <p>{currentShift.label} · 机舱参数</p>
          <h2>{formTitle}</h2>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          {editingRecord && (
            <button onClick={handleCancelEdit}>取消编辑</button>
          )}
          <button className="primary" onClick={editingRecord ? handleUpdate : handleSubmit}>
            {submitButtonText}
          </button>
        </div>
      </div>
      <div className="field-grid">
        {engineRoomFields.map((field) => {
          const diff = computeDiff(field.key);
          return (
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
              {diff && (
                <span className={`diff-hint diff-${diff.sign}`}>
                  {diff.sign === "up" && `↑ +${diff.value} ${field.unit}`}
                  {diff.sign === "down" && `↓ ${diff.value} ${field.unit}`}
                  {diff.sign === "zero" && "— 无变化"}
                </span>
              )}
              {errors[field.key] && <span className="error-text">{errors[field.key]}</span>}
            </label>
          );
        })}
      </div>
      {duplicateWarning && (
        <div style={{ marginTop: "12px", padding: "10px 14px", borderRadius: "6px", background: "#fef3c7", color: "#92400e", fontSize: "13px", fontWeight: 500 }}>
          该记录已存在，请勿重复提交
        </div>
      )}
      {latestEngineRoomRecord && !editingRecord && (
        <div className="last-record">
          <small>
            最近录入时间：
            {new Date(latestEngineRoomRecord.createdAt).toLocaleString("zh-CN")}
          </small>
        </div>
      )}

      {sortedRecords.length > 0 && (
        <div className="engine-room-history" style={{ marginTop: "20px", paddingTop: "18px", borderTop: "1px solid var(--border)" }}>
          <h3 style={{ margin: "0 0 14px", fontSize: "15px", color: "#1e293b" }}>本班次记录</h3>
          <div style={{ display: "grid", gap: "12px" }}>
            {sortedRecords.map((record) => (
              <div
                key={record.id}
                className={`er-record-item ${editingRecord?.id === record.id ? "er-record-editing" : ""}`}
                style={{
                  padding: "14px",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  background: editingRecord?.id === record.id ? "color-mix(in srgb, var(--primary) 6%, #ffffff)" : "#fbfdff",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 18px", marginBottom: "6px" }}>
                      <div style={{ fontSize: "13px" }}>
                        <span style={{ color: "#64748b" }}>主机转速：</span>
                        <strong style={{ color: "#1e293b" }}>{record.mainEngineSpeed} rpm</strong>
                      </div>
                      <div style={{ fontSize: "13px" }}>
                        <span style={{ color: "#64748b" }}>滑油压力：</span>
                        <strong style={{ color: "#1e293b" }}>{record.lubricatingOilPressure} MPa</strong>
                      </div>
                      <div style={{ fontSize: "13px" }}>
                        <span style={{ color: "#64748b" }}>冷却水温：</span>
                        <strong style={{ color: "#1e293b" }}>{record.coolingWaterTemp} ℃</strong>
                      </div>
                      <div style={{ fontSize: "13px" }}>
                        <span style={{ color: "#64748b" }}>燃油消耗：</span>
                        <strong style={{ color: "#1e293b" }}>{record.fuelConsumption} L/h</strong>
                      </div>
                    </div>
                    <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                      录入时间：{new Date(record.createdAt).toLocaleString("zh-CN")}
                      {record.isEdited && record.editedAt && (
                        <span style={{ marginLeft: "10px" }}>
                          · 已编辑 · 最后编辑：{new Date(record.editedAt).toLocaleString("zh-CN")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="er-record-actions" style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                    <button
                      onClick={() => handleEdit(record)}
                      style={{
                        minHeight: "32px",
                        padding: "0 12px",
                        fontSize: "12px",
                        color: "var(--primary)",
                        border: "1px solid var(--primary)",
                        background: "#ffffff",
                        borderRadius: "6px",
                        cursor: "pointer",
                      }}
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(record)}
                      style={{
                        minHeight: "32px",
                        padding: "0 12px",
                        fontSize: "12px",
                        color: "#dc2626",
                        border: "1px solid #dc2626",
                        background: "#ffffff",
                        borderRadius: "6px",
                        cursor: "pointer",
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
