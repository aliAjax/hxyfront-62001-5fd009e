import { useState, useMemo, useEffect } from "react";
import { useShift } from "./ShiftContext";
import { SHIFTS, getPreviousShiftId } from "./types";

export function ShiftHandover() {
  const {
    currentShift,
    currentHandoverSummary,
    previousShiftSummary,
    saveHandover,
    engineRoomRecords,
    anomalyRecords,
    records,
  } = useShift();

  const [manualNote, setManualNote] = useState(
    currentHandoverSummary?.manualNote ?? ""
  );
  const [savedDraft, setSavedDraft] = useState(false);
  const [savedFinal, setSavedFinal] = useState(false);

  useEffect(() => {
    setManualNote(currentHandoverSummary?.manualNote ?? "");
    setSavedDraft(false);
    setSavedFinal(false);
  }, [currentShift.id]);

  const previousShiftLabel = useMemo(() => {
    const prevId = getPreviousShiftId(currentShift.id);
    if (!prevId) return "";
    const found = SHIFTS.find((s) => s.id === prevId);
    return found ? found.label : "";
  }, [currentShift.id]);

  const autoSummary = useMemo(() => {
    const parts: string[] = [];
    const shiftId = currentShift.id;

    const shiftRecords = engineRoomRecords[shiftId] ?? [];
    if (shiftRecords.length > 0) {
      const latest = shiftRecords[shiftRecords.length - 1];
      parts.push(
        `【机舱参数】主机转速 ${latest.mainEngineSpeed} rpm，滑油压力 ${latest.lubricatingOilPressure} MPa，冷却水温 ${latest.coolingWaterTemp} ℃，燃油消耗 ${latest.fuelConsumption} L/h`
      );
    }

    const shiftAnomalies = (anomalyRecords[shiftId] ?? []).filter(
      (r) => r.currentStatus !== "已关闭"
    );
    if (shiftAnomalies.length > 0) {
      const items = shiftAnomalies.map(
        (r) => `${r.device}（${r.currentStatus}）：${r.anomalyDescription}`
      );
      parts.push(`【异常巡检项·未关闭】\n${items.join("\n")}`);
    }

    const unfinishedRecords = (records[shiftId] ?? []).filter(
      (r) => r.status && r.status !== "已解决" && r.status !== "正常巡检"
    );
    if (unfinishedRecords.length > 0) {
      const items = unfinishedRecords.map(
        (r) => `${r.device} - ${r.status}${r.anomaly ? "：" + r.anomaly : ""}`
      );
      parts.push(`【未完成处理】\n${items.join("\n")}`);
    }

    if (parts.length === 0) {
      parts.push("本班次运行正常，无异常事项需交接。");
    }

    return parts.join("\n\n");
  }, [currentShift.id, engineRoomRecords, anomalyRecords, records]);

  const handleSaveDraft = () => {
    saveHandover(manualNote, true);
    setSavedDraft(true);
    setTimeout(() => setSavedDraft(false), 2000);
  };

  const handleSaveFinal = () => {
    saveHandover(manualNote, false);
    setSavedFinal(true);
    setTimeout(() => setSavedFinal(false), 2000);
  };

  const draftStatus = currentHandoverSummary?.isDraft ? "草稿" : currentHandoverSummary ? "已确认" : "未保存";

  return (
    <section className="handover-module">
      {previousShiftSummary && (
        <section className="panel handover-previous-panel">
          <div className="heading">
            <div>
              <p>{previousShiftLabel} · 交接遗留</p>
              <h2>上一班交接事项</h2>
            </div>
            <span className={`handover-status-tag ${previousShiftSummary.isDraft ? "draft" : "confirmed"}`}>
              {previousShiftSummary.isDraft ? "草稿" : "已确认"}
            </span>
          </div>
          <div className="handover-summary-block">
            <div className="summary-section">
              <h4>自动摘要</h4>
              <pre className="summary-text">{previousShiftSummary.autoSummary}</pre>
            </div>
            {previousShiftSummary.manualNote && (
              <div className="summary-section">
                <h4>轮机员备注</h4>
                <pre className="summary-text manual-note">{previousShiftSummary.manualNote}</pre>
              </div>
            )}
            <div className="summary-meta">
              <span>创建时间：{new Date(previousShiftSummary.createdAt).toLocaleString("zh-CN")}</span>
              <span>更新时间：{new Date(previousShiftSummary.updatedAt).toLocaleString("zh-CN")}</span>
            </div>
          </div>
        </section>
      )}

      <section className="panel handover-current-panel">
        <div className="heading">
          <div>
            <p>{currentShift.label} · 交接班摘要</p>
            <h2>生成交接班摘要</h2>
          </div>
          <div className="handover-actions">
            <span className={`handover-status-tag ${draftStatus === "草稿" ? "draft" : draftStatus === "已确认" ? "confirmed" : "unsaved"}`}>
              {draftStatus}
            </span>
            <button className="secondary-btn" onClick={handleSaveDraft}>
              {savedDraft ? "已保存草稿 ✓" : "保存草稿"}
            </button>
            <button className="primary" onClick={handleSaveFinal}>
              {savedFinal ? "已确认交接 ✓" : "确认交接"}
            </button>
          </div>
        </div>

        <div className="handover-summary-block">
          <div className="summary-section">
            <h4>自动生成摘要</h4>
            <pre className="summary-text">{autoSummary}</pre>
          </div>

          <div className="summary-section">
            <h4>轮机员手动备注</h4>
            <textarea
              className="handover-textarea"
              placeholder="补充交接备注，如需要下一班注意的事项、遗留问题说明等…"
              value={manualNote}
              onChange={(e) => setManualNote(e.target.value)}
              rows={5}
            />
          </div>
        </div>

        {currentHandoverSummary && (
          <div className="summary-meta">
            <span>创建时间：{new Date(currentHandoverSummary.createdAt).toLocaleString("zh-CN")}</span>
            <span>更新时间：{new Date(currentHandoverSummary.updatedAt).toLocaleString("zh-CN")}</span>
          </div>
        )}
      </section>
    </section>
  );
}
