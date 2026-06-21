import { useState, useRef, useMemo } from "react";
import { useShift } from "./ShiftContext";
import {
  type ImportPreview,
  type ImportConflict,
  type ImportStrategy,
  validateAndParseImportFile,
  detectConflicts,
  SHIFTS,
} from "./types";

const CONFLICT_TYPE_LABELS: Record<ImportConflict["type"], string> = {
  records: "值班记录",
  engineRoomRecords: "机舱参数记录",
  anomalyRecords: "异常巡检记录",
  bilgeWaterRecords: "舱底水记录",
  handoverSummaries: "交接摘要",
};

function getShiftLabel(shiftId: string): string {
  const shift = SHIFTS.find((s) => s.id === shiftId);
  return shift ? shift.label : shiftId;
}

export function DataManager() {
  const { exportData, importData, records, engineRoomRecords, anomalyRecords, bilgeWaterRecords, handoverSummaries } = useShift();
  const [showImportModal, setShowImportModal] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [strategy, setStrategy] = useState<ImportStrategy>("merge");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const localStats = useMemo(() => {
    const sumRecords = (obj: Record<string, unknown[]>) =>
      Object.values(obj).reduce((acc, arr) => acc + arr.length, 0);
    return {
      records: sumRecords(records as Record<string, unknown[]>),
      engineRoom: sumRecords(engineRoomRecords as Record<string, unknown[]>),
      anomalies: sumRecords(anomalyRecords as Record<string, unknown[]>),
      bilge: sumRecords(bilgeWaterRecords as Record<string, unknown[]>),
      handover: Object.keys(handoverSummaries).length,
    };
  }, [records, engineRoomRecords, anomalyRecords, bilgeWaterRecords, handoverSummaries]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const result = validateAndParseImportFile(text);
      if (result.valid && result.data) {
        result.conflicts = detectConflicts(
          result.data,
          records,
          engineRoomRecords,
          anomalyRecords,
          bilgeWaterRecords,
          handoverSummaries
        );
      }
      setPreview(result);
      setImportResult(null);
    };
    reader.readAsText(file);
  };

  const resetImportState = () => {
    setPreview(null);
    setStrategy("merge");
    setImportResult(null);
    setImporting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCloseModal = () => {
    setShowImportModal(false);
    resetImportState();
  };

  const handleConfirmImport = () => {
    if (!preview?.valid || !preview.data) return;
    setImporting(true);
    try {
      importData(preview.data, strategy);
      setImportResult(
        strategy === "overwrite"
          ? "导入成功！已使用导入数据覆盖冲突的班次记录。"
          : "导入成功！已将新记录合并到现有数据中。"
      );
    } catch {
      setImportResult("导入失败，请检查文件格式是否正确。");
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <section className="panel data-manager-panel">
        <div className="heading">
          <div>
            <p>数据管理</p>
            <h2>本地数据导入导出</h2>
          </div>
          <div className="data-manager-actions">
            <button className="secondary-btn" onClick={() => setShowImportModal(true)}>
              导入数据
            </button>
            <button className="primary" onClick={exportData}>
              导出全部数据
            </button>
          </div>
        </div>
        <div className="local-stats">
          <div className="local-stat-item">
            <small>值班记录</small>
            <strong>{localStats.records}</strong>
          </div>
          <div className="local-stat-item">
            <small>机舱参数</small>
            <strong>{localStats.engineRoom}</strong>
          </div>
          <div className="local-stat-item">
            <small>异常记录</small>
            <strong>{localStats.anomalies}</strong>
          </div>
          <div className="local-stat-item">
            <small>舱底水记录</small>
            <strong>{localStats.bilge}</strong>
          </div>
          <div className="local-stat-item">
            <small>交接摘要</small>
            <strong>{localStats.handover}</strong>
          </div>
        </div>
        <small className="data-hint">
          导出内容包含：班次信息、设备记录、参数读数、异常巡检记录和交接摘要。数据将保存为 JSON 格式文件存储在本地。
        </small>
      </section>

      {showImportModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content data-import-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>导入值班记录</h3>
              <button className="modal-close" onClick={handleCloseModal}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {!preview && (
                <div className="import-upload-area">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileSelect}
                    id="import-file-input"
                    className="hidden-file-input"
                  />
                  <label htmlFor="import-file-input" className="import-upload-label">
                    <div className="upload-icon">📁</div>
                    <strong>点击选择文件或拖拽到此处</strong>
                    <small>支持 .json 格式的导出数据文件</small>
                  </label>
                </div>
              )}

              {preview && !preview.valid && (
                <div className="import-errors">
                  <div className="error-banner">
                    <strong>❌ 文件验证失败</strong>
                  </div>
                  <ul>
                    {preview.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                  <button className="secondary-btn" onClick={resetImportState}>
                    重新选择文件
                  </button>
                </div>
              )}

              {preview && preview.valid && preview.data && (
                <div className="import-preview">
                  <div className="success-banner">
                    <strong>✅ 文件验证通过</strong>
                    <small>导出时间：{new Date(preview.data.exportedAt).toLocaleString("zh-CN")}</small>
                  </div>

                  <h4>数据预览</h4>
                  <div className="preview-stats">
                    <div className="preview-stat-item">
                      <small>值班记录</small>
                      <strong>{preview.stats.totalRecords}</strong>
                    </div>
                    <div className="preview-stat-item">
                      <small>机舱参数</small>
                      <strong>{preview.stats.totalEngineRoomRecords}</strong>
                    </div>
                    <div className="preview-stat-item">
                      <small>异常记录</small>
                      <strong>{preview.stats.totalAnomalyRecords}</strong>
                    </div>
                    <div className="preview-stat-item">
                      <small>舱底水记录</small>
                      <strong>{preview.stats.totalBilgeWaterRecords}</strong>
                    </div>
                    <div className="preview-stat-item">
                      <small>交接摘要</small>
                      <strong>{preview.stats.totalHandoverSummaries}</strong>
                    </div>
                  </div>

                  <div className="preview-shifts">
                    <small>涉及班次：</small>
                    <div className="chips">
                      {preview.stats.shifts.map((sid) => (
                        <span key={sid} className="shift-badge">
                          {getShiftLabel(sid)}
                        </span>
                      ))}
                    </div>
                  </div>

                  {preview.conflicts.length > 0 && (
                    <div className="conflict-section">
                      <div className="warning-banner">
                        <strong>⚠️ 检测到数据冲突</strong>
                        <small>以下班次在本地已有记录，请选择导入策略</small>
                      </div>
                      <div className="conflict-list">
                        {preview.conflicts.map((c, i) => (
                          <div key={i} className="conflict-item">
                            <span className="conflict-type">{CONFLICT_TYPE_LABELS[c.type]}</span>
                            <span className="conflict-shift">{getShiftLabel(c.shiftId)}</span>
                            <span className="conflict-counts">
                              本地 {c.existingCount} 条 · 导入 {c.importedCount} 条
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="strategy-select">
                    <h4>导入策略</h4>
                    <label className="strategy-option">
                      <input
                        type="radio"
                        name="strategy"
                        checked={strategy === "merge"}
                        onChange={() => setStrategy("merge")}
                      />
                      <div>
                        <strong>合并导入</strong>
                        <small>保留本地所有数据，仅添加导入文件中不存在的新记录（按 ID 去重）</small>
                      </div>
                    </label>
                    <label className="strategy-option">
                      <input
                        type="radio"
                        name="strategy"
                        checked={strategy === "overwrite"}
                        onChange={() => setStrategy("overwrite")}
                      />
                      <div>
                        <strong>覆盖导入</strong>
                        <small>使用导入文件的数据覆盖对应班次的本地记录</small>
                      </div>
                    </label>
                  </div>

                  {importResult && (
                    <div className={`result-banner ${importResult.includes("成功") ? "result-success" : "result-error"}`}>
                      {importResult}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={handleCloseModal}>
                {importResult?.includes("成功") ? "关闭" : "取消"}
              </button>
              {preview?.valid && !importResult?.includes("成功") && (
                <>
                  <button className="secondary-btn" onClick={resetImportState}>
                    重新选择
                  </button>
                  <button
                    className="primary"
                    onClick={handleConfirmImport}
                    disabled={importing}
                  >
                    {importing ? "导入中..." : "确认导入"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
