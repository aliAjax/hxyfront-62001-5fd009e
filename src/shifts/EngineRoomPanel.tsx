import { useState, useEffect } from "react";
import { useShift } from "./ShiftContext";

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
  const { currentShift, latestEngineRoomRecord, addEngineRoomRecord } = useShift();
  const [form, setForm] = useState<EngineRoomForm>({
    mainEngineSpeed: "",
    lubricatingOilPressure: "",
    coolingWaterTemp: "",
    fuelConsumption: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof EngineRoomForm, string>>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (latestEngineRoomRecord) {
      setForm({
        mainEngineSpeed: String(latestEngineRoomRecord.mainEngineSpeed),
        lubricatingOilPressure: String(latestEngineRoomRecord.lubricatingOilPressure),
        coolingWaterTemp: String(latestEngineRoomRecord.coolingWaterTemp),
        fuelConsumption: String(latestEngineRoomRecord.fuelConsumption),
      });
    }
  }, [latestEngineRoomRecord]);

  const handleChange = (field: keyof EngineRoomForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setSaved(false);
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

    addEngineRoomRecord({
      mainEngineSpeed: Number(form.mainEngineSpeed),
      lubricatingOilPressure: Number(form.lubricatingOilPressure),
      coolingWaterTemp: Number(form.coolingWaterTemp),
      fuelConsumption: Number(form.fuelConsumption),
    });

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <section className="panel engine-room-panel">
      <div className="heading">
        <div>
          <p>{currentShift.label} · 机舱参数</p>
          <h2>参数录入</h2>
        </div>
        <button className="primary" onClick={handleSubmit}>
          {saved ? "已保存 ✓" : "保存参数"}
        </button>
      </div>
      <div className="field-grid">
        {engineRoomFields.map((field) => (
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
      </div>
      {latestEngineRoomRecord && (
        <div className="last-record">
          <small>
            最近录入时间：
            {new Date(latestEngineRoomRecord.createdAt).toLocaleString("zh-CN")}
          </small>
        </div>
      )}
    </section>
  );
}
