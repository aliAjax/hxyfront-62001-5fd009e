import { useState, useMemo, useEffect } from "react";
import { useShift } from "./ShiftContext";
import { SHIFTS, getPreviousShiftId, getStatusClass, getAnomalyOriginShiftLabel, formatHandoverPath, getAnomalyCloseShiftLabel } from "./types";

export function ShiftHandover() {
  const {
    currentShift,
    currentHandoverSummary,
    previousShiftSummary,
    saveHandover,
    generateAutoSummary,
    isDataDirty,
    carriedOverAnomalies,
    anomalyRecords,
  } = useShift();

  const [manualNote, setManualNote] = useState(
    currentHandoverSummary?.manualNote ?? ""
  );
  const [savedDraft, setSavedDraft] = useState(false);
  const [savedFinal, setSavedFinal] = useState(false);
  const [showSyncToast, setShowSyncToast] = useState(false);

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

  const previousShiftCarriedOverAnomalies = useMemo(() => {
    const prevId = getPreviousShiftId(currentShift.id);
    if (!prevId) return [];
    return (anomalyRecords[currentShift.id] ?? []).filter(
      (r) => !r.deletedAt && r.currentStatus !== "已关闭" && r.isCarriedOver && r.carryOverFromShiftId === prevId
    );
  }, [currentShift.id, anomalyRecords]);

  const [refreshCounter, setRefreshCounter] = useState(0);

  const currentAutoSummary = useMemo(() => {
    void refreshCounter;
    return generateAutoSummary(currentShift.id);
  }, [currentShift.id, generateAutoSummary, refreshCounter]);

  const previousShiftUnclosedAnomalies = useMemo(() => {
    const prevId = getPreviousShiftId(currentShift.id);
    if (!prevId) return [];
    return (anomalyRecords[prevId] ?? []).filter(
      (r) => !r.deletedAt && r.currentStatus !== "已关闭" && !r.isCarriedOver
    );
  }, [currentShift.id, anomalyRecords]);

  const dataDirty = isDataDirty(currentShift.id);

  const triggerSyncToast = () => {
    setShowSyncToast(true);
    setTimeout(() => setShowSyncToast(false), 2000);
  };

  const handleSaveDraft = () => {
    saveHandover(manualNote, true);
    setSavedDraft(true);
    setTimeout(() => setSavedDraft(false), 2000);
    triggerSyncToast();
  };

  const handleSaveFinal = () => {
    saveHandover(manualNote, false);
    setSavedFinal(true);
    setTimeout(() => setSavedFinal(false), 2000);
    triggerSyncToast();
  };

  const draftStatus = currentHandoverSummary?.isDraft ? "草稿" : currentHandoverSummary ? "已确认" : "未保存";

  const hasPreviousShiftInfo = previousShiftSummary ||
    previousShiftCarriedOverAnomalies.length > 0 ||
    previousShiftUnclosedAnomalies.length > 0;

  const handleRefresh = () => {
    setRefreshCounter((c) => c + 1);
    triggerSyncToast();
  };

  return (
    <section className="handover-module">
      {showSyncToast && (
        <div className="summary-sync-toast">摘要已同步 ✓</div>
      )}

      {hasPreviousShiftInfo && (
        <section className="panel handover-previous-panel">
          <div className="heading">
            <div>
              <p>{previousShiftLabel} · 交接遗留</p>
              <h2>上一班交接事项</h2>
            </div>
            {previousShiftSummary && (
              <span className={`handover-status-tag ${previousShiftSummary.isDraft ? "draft" : "confirmed"}`}>
                {previousShiftSummary.isDraft ? "草稿" : "已确认"}
              </span>
            )}
            {!previousShiftSummary && (previousShiftCarriedOverAnomalies.length > 0 || previousShiftUnclosedAnomalies.length > 0) && (
              <span className="handover-status-tag draft">未生成摘要</span>
            )}
          </div>
          <div className="handover-summary-block">
            {previousShiftSummary && (
              <div className="summary-section">
                <h4>自动摘要</h4>
                <pre className="summary-text">{previousShiftSummary.autoSummary}</pre>
              </div>
            )}
            {previousShiftCarriedOverAnomalies.length > 0 && (
              <div className="summary-section">
                <h4>跨班次遗留异常（已带入本班次）</h4>
                <ul className="carryover-anomaly-list">
                  {previousShiftCarriedOverAnomalies.map((r) => (
                    <li key={r.id} className="carryover-anomaly-item">
                      <div className="carryover-anomaly-header">
                        <strong>{r.device}</strong>
                        <span className={`status-tag ${getStatusClass(r.currentStatus)}`}>{r.currentStatus}</span>
                      </div>
                      <div className="carryover-anomaly-body">
                        <p className="carryover-anomaly-desc">{r.anomalyDescription}</p>
                        <div className="carryover-anomaly-meta">
                          <span className="carryover-origin-tag">
                            📍 原始：{getAnomalyOriginShiftLabel(r)}
                          </span>
                          {formatHandoverPath(r) && (
                            <span className="carryover-path-tag">
                              🔄 {formatHandoverPath(r)}
                            </span>
                          )}
                          {getAnomalyCloseShiftLabel(r) && (
                            <span className="carryover-closed-tag">
                              ✅ 关闭于：{getAnomalyCloseShiftLabel(r)}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!previousShiftSummary && previousShiftUnclosedAnomalies.length > 0 && previousShiftCarriedOverAnomalies.length === 0 && (
              <div className="summary-section">
                <h4>上一班遗留未关闭异常（注意：尚未选择带入本班次）</h4>
                <ul className="carryover-anomaly-list">
                  {previousShiftUnclosedAnomalies.map((r) => (
                    <li key={r.id} className="carryover-anomaly-item">
                      <strong>{r.device}</strong>
                      <span className={`status-tag ${getStatusClass(r.currentStatus)}`}>{r.currentStatus}</span>
                      <span>{r.anomalyDescription}</span>
                    </li>
                  ))}
                </ul>
                <p className="handover-hint">
                  ⚠ 提示：这些异常来自 {previousShiftLabel}，请在班次切换时选择「遗留并切换」以将其带入本班次。
                </p>
              </div>
            )}
            {previousShiftSummary?.manualNote && (
              <div className="summary-section">
                <h4>轮机员备注</h4>
                <pre className="summary-text manual-note">{previousShiftSummary.manualNote}</pre>
              </div>
            )}
            {previousShiftSummary && (
              <div className="summary-meta">
                <span>创建时间：{new Date(previousShiftSummary.createdAt).toLocaleString("zh-CN")}</span>
                <span>更新时间：{new Date(previousShiftSummary.updatedAt).toLocaleString("zh-CN")}</span>
              </div>
            )}
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
            <button className="secondary-btn refresh-btn" onClick={handleRefresh} title="重新生成摘要">
              🔄 刷新
            </button>
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
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "8px" }}>
              <h4 style={{ margin: 0 }}>自动生成摘要</h4>
              {dataDirty && (
                <span className="summary-dirty-indicator">数据已变更，摘要待更新</span>
              )}
            </div>
            <pre className="summary-text">{currentAutoSummary}</pre>
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
