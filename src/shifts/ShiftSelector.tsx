import { useState, useEffect, useCallback, useRef } from "react";
import { useShift } from "./ShiftContext";

export function ShiftSelector() {
  const {
    shifts,
    currentShift,
    setCurrentShiftId,
    anomalyRecords,
    currentHandoverSummary,
    carriedOverAnomalies,
    carryOverAnomaliesToShift,
  } = useShift();

  const [bannerVisible, setBannerVisible] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingShiftId, setPendingShiftId] = useState<string | null>(null);
  const [pendingUnclosedCount, setPendingUnclosedCount] = useState(0);
  const [pendingHasDraft, setPendingHasDraft] = useState(false);

  const prevShiftIdRef = useRef<string>(currentShift.id);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prevShiftIdRef.current !== currentShift.id) {
      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current);
      }
      setBannerVisible(true);
      bannerTimerRef.current = setTimeout(() => {
        setBannerVisible(false);
        bannerTimerRef.current = null;
      }, 3000);
      prevShiftIdRef.current = currentShift.id;
    }
    return () => {
      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current);
      }
    };
  }, [currentShift.id, currentShift.label, carriedOverAnomalies.length]);

  const getUnclosedAnomalies = useCallback(
    (shiftId: string) => {
      return (anomalyRecords[shiftId] ?? []).filter(
        (r) => !r.deletedAt && r.currentStatus !== "已关闭"
      );
    },
    [anomalyRecords]
  );

  const performSwitch = useCallback(
    (targetShiftId: string, doCarryOver: boolean) => {
      const unclosed = getUnclosedAnomalies(currentShift.id);
      if (doCarryOver && unclosed.length > 0) {
        carryOverAnomaliesToShift(
          unclosed.map((r) => r.id),
          targetShiftId
        );
      }
      setCurrentShiftId(targetShiftId);
    },
    [
      currentShift.id,
      getUnclosedAnomalies,
      carryOverAnomaliesToShift,
      setCurrentShiftId,
    ]
  );

  const handleTabClick = useCallback(
    (shiftId: string) => {
      if (shiftId === currentShift.id) return;

      const unclosed = getUnclosedAnomalies(currentShift.id);
      const hasDraft = currentHandoverSummary?.isDraft ?? false;

      if (unclosed.length > 0 || hasDraft) {
        setPendingShiftId(shiftId);
        setPendingUnclosedCount(unclosed.length);
        setPendingHasDraft(hasDraft);
        setShowConfirmDialog(true);
      } else {
        performSwitch(shiftId, false);
      }
    },
    [currentShift.id, currentHandoverSummary, getUnclosedAnomalies, performSwitch]
  );

  const handleConfirm = useCallback(
    (doCarryOver: boolean) => {
      if (pendingShiftId) {
        performSwitch(pendingShiftId, doCarryOver);
      }
      setShowConfirmDialog(false);
      setPendingShiftId(null);
    },
    [pendingShiftId, performSwitch]
  );

  const handleCancel = useCallback(() => {
    setShowConfirmDialog(false);
    setPendingShiftId(null);
  }, []);

  return (
    <>
      <div className="shift-selector">
        <span className="shift-label">值班班次</span>
        <div className="shift-tabs">
          {shifts.map((shift) => (
            <button
              key={shift.id}
              className={`shift-tab${shift.id === currentShift.id ? " active" : ""}`}
              onClick={() => handleTabClick(shift.id)}
            >
              {shift.label}
            </button>
          ))}
        </div>
      </div>

      {bannerVisible && (
        <div className="carryover-banner">
          <span className="carryover-banner-icon">ℹ</span>
          <div className="carryover-banner-content">
            <strong>已切换至 {currentShift.label}</strong>
            {carriedOverAnomalies.length > 0 ? (
              <span>，该班次有 {carriedOverAnomalies.length} 项从上一班遗留的异常</span>
            ) : (
              <span>，无遗留异常</span>
            )}
          </div>
        </div>
      )}

      {showConfirmDialog && (
        <div className="modal-overlay" onClick={handleCancel}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>班次切换提示</h3>
              <button className="modal-close" onClick={handleCancel}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="shift-switch-hint">
                {pendingUnclosedCount > 0 && (
                  <p>
                    <strong>当前班次有 {pendingUnclosedCount} 项未关闭异常</strong>
                    ，是否确认遗留到下一班？
                  </p>
                )}
                {pendingHasDraft && (
                  <p>
                    <strong>当前班次交接摘要为草稿状态</strong>
                    ，请确认是否已完成交接。
                  </p>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={handleCancel}>取消</button>
              {pendingUnclosedCount > 0 && (
                <button className="secondary-btn" onClick={() => handleConfirm(false)}>
                  不遗留，直接切换
                </button>
              )}
              <button
                className="primary"
                onClick={() => handleConfirm(pendingUnclosedCount > 0)}
              >
                {pendingUnclosedCount > 0 ? "遗留并切换" : "确认切换"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
