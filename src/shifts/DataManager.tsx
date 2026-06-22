import { useState, useRef, useMemo, useCallback } from "react";
import { useShift } from "./ShiftContext";
import {
  type ImportPreview,
  type ImportConflict,
  type ImportStrategy,
  type ExportData,
  type WatchRecord,
  type EngineRoomRecord,
  type AnomalyRecord,
  type BilgeWaterRecord,
  type HandoverSummary,
  type RiskAssessment,
  validateAndParseImportFile,
  detectConflicts,
  createExportData,
  downloadExportFile,
  SHIFTS,
} from "./types";

const CONFLICT_TYPE_LABELS: Record<ImportConflict["type"], string> = {
  records: "值班记录",
  engineRoomRecords: "机舱参数记录",
  anomalyRecords: "异常巡检记录",
  bilgeWaterRecords: "舱底水记录",
  handoverSummaries: "交接摘要",
  riskAssessments: "风险评估记录",
};

function getShiftLabel(shiftId: string): string {
  const shift = SHIFTS.find((s) => s.id === shiftId);
  return shift ? shift.label : shiftId;
}

type ExportVesselScope = "allVessels" | "currentVessel";
type ExportShiftScope = "allShifts" | "currentShift";

interface ShiftDataPreview {
  shiftId: string;
  shiftLabel: string;
  recordCount: number;
  engineRoomCount: number;
  anomalyCount: number;
  bilgeCount: number;
  hasHandover: boolean;
  riskCount: number;
  devices: string[];
  sampleRecords: Array<{ device: string; params: string; anomaly: string }>;
  sampleEngine: Array<{ speed: number; oilPressure: number; coolingTemp: number; fuelConsumption: number }>;
  anomalyDevices: string[];
}

function buildShiftPreview(
  shiftId: string,
  records: Record<string, WatchRecord[]>,
  engineRoomRecords: Record<string, EngineRoomRecord[]>,
  anomalyRecords: Record<string, AnomalyRecord[]>,
  bilgeWaterRecords: Record<string, BilgeWaterRecord[]>,
  handoverSummaries: Record<string, HandoverSummary>,
  riskAssessments: Record<string, RiskAssessment[]>,
): ShiftDataPreview {
  const shiftRecords = (records[shiftId] ?? []).filter((r) => !r.deletedAt);
  const shiftEngine = (engineRoomRecords[shiftId] ?? []).filter((r) => !r.deletedAt);
  const shiftAnomalies = (anomalyRecords[shiftId] ?? []).filter((r) => !r.deletedAt);
  const shiftBilge = (bilgeWaterRecords[shiftId] ?? []).filter((r) => !r.deletedAt);
  const shiftRisk = (riskAssessments[shiftId] ?? []).filter((r) => !r.deletedAt);

  return {
    shiftId,
    shiftLabel: getShiftLabel(shiftId),
    recordCount: shiftRecords.length,
    engineRoomCount: shiftEngine.length,
    anomalyCount: shiftAnomalies.length,
    bilgeCount: shiftBilge.length,
    hasHandover: !!handoverSummaries[shiftId] && !handoverSummaries[shiftId].deletedAt,
    riskCount: shiftRisk.length,
    devices: [...new Set(shiftRecords.map((r) => r.device))],
    sampleRecords: shiftRecords.slice(0, 3).map((r) => ({
      device: r.device,
      params: r.params,
      anomaly: r.anomaly,
    })),
    sampleEngine: shiftEngine.slice(0, 2).map((r) => ({
      speed: r.mainEngineSpeed,
      oilPressure: r.lubricatingOilPressure,
      coolingTemp: r.coolingWaterTemp,
      fuelConsumption: r.fuelConsumption,
    })),
    anomalyDevices: shiftAnomalies
      .filter((r) => r.currentStatus !== "已关闭")
      .map((r) => `${r.device}(${r.currentStatus})`),
  };
}

export function DataManager() {
  const {
    exportData,
    exportDataForVessel,
    exportAllData,
    importData,
    records,
    engineRoomRecords,
    anomalyRecords,
    bilgeWaterRecords,
    handoverSummaries,
    riskAssessments,
    currentShift,
    currentVessel,
    vessels,
    getAllData,
  } = useShift();

  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [strategy, setStrategy] = useState<ImportStrategy>("merge");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importStep, setImportStep] = useState<"upload" | "preview" | "confirm">("upload");
  const [exportVesselScope, setExportVesselScope] = useState<ExportVesselScope>("currentVessel");
  const [exportShiftScope, setExportShiftScope] = useState<ExportShiftScope>("allShifts");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
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
      risk: sumRecords(riskAssessments as Record<string, unknown[]>),
    };
  }, [records, engineRoomRecords, anomalyRecords, bilgeWaterRecords, handoverSummaries, riskAssessments]);

  const totalRecords = localStats.records + localStats.engineRoom + localStats.anomalies + localStats.bilge + localStats.risk;

  const allShiftIds = useMemo(() => {
    const ids = new Set<string>();
    [records, engineRoomRecords, anomalyRecords, bilgeWaterRecords].forEach((map) => {
      Object.keys(map).forEach((k) => ids.add(k));
    });
    Object.keys(handoverSummaries).forEach((k) => ids.add(k));
    return Array.from(ids).sort();
  }, [records, engineRoomRecords, anomalyRecords, bilgeWaterRecords, handoverSummaries]);

  const shiftPreviews = useMemo(() => {
    return allShiftIds.map((sid) =>
      buildShiftPreview(sid, records, engineRoomRecords, anomalyRecords, bilgeWaterRecords, handoverSummaries, riskAssessments)
    );
  }, [allShiftIds, records, engineRoomRecords, anomalyRecords, bilgeWaterRecords, handoverSummaries, riskAssessments]);

  const exportPreviewData = useMemo(() => {
    const getFilteredByShift = (
      data: Record<string, any>) => {
        if (exportShiftScope === "currentShift") {
          const sid = currentShift.id;
          return { [sid]: data[sid] ?? [] };
        }
        return data;
      };
    const getFilteredHandoverByShift = () => {
      if (exportShiftScope === "currentShift") {
        const sid = currentShift.id;
        return handoverSummaries[sid] ? { [sid]: handoverSummaries[sid] } : {};
      }
      return handoverSummaries;
    };
    return {
      filteredRecords: getFilteredByShift(records),
      filteredEngine: getFilteredByShift(engineRoomRecords),
      filteredAnomaly: getFilteredByShift(anomalyRecords),
      filteredBilge: getFilteredByShift(bilgeWaterRecords),
      filteredHandover: getFilteredHandoverByShift(),
      filteredRisk: getFilteredByShift(riskAssessments),
    };
  }, [exportShiftScope, currentShift.id, records, engineRoomRecords, anomalyRecords, bilgeWaterRecords, handoverSummaries, riskAssessments]);

  const exportStats = useMemo(() => {
    const sum = (obj: Record<string, unknown[]>) =>
      Object.values(obj).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);
    return {
      records: sum(exportPreviewData.filteredRecords as Record<string, unknown[]>),
      engineRoom: sum(exportPreviewData.filteredEngine as Record<string, unknown[]>),
      anomalies: sum(exportPreviewData.filteredAnomaly as Record<string, unknown[]>),
      bilge: sum(exportPreviewData.filteredBilge as Record<string, unknown[]>),
      handover: Object.keys(exportPreviewData.filteredHandover).length,
      risk: sum(exportPreviewData.filteredRisk as Record<string, unknown[]>),
    };
  }, [exportPreviewData]);

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
          handoverSummaries,
          riskAssessments
        );
      }
      setPreview(result);
      setImportResult(null);
      setImportStep(result.valid ? "preview" : "upload");
    };
    reader.readAsText(file);
  };

  const resetImportState = () => {
    setPreview(null);
    setStrategy("merge");
    setImportResult(null);
    setImporting(false);
    setImportStep("upload");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCloseImportModal = () => {
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
      setImportStep("preview");
    } catch {
      setImportResult("导入失败，请检查文件格式是否正确。");
    } finally {
      setImporting(false);
    }
  };

  const handleExport = useCallback(() => {
    if (exportVesselScope === "allVessels") {
      exportAllData();
    } else {
      if (exportShiftScope === "currentShift") {
        const sid = currentShift.id;
        const vesselForExport = currentVessel
          ? [currentVessel]
          : vessels.slice(0, 1);
        const data = createExportData(
          vesselForExport,
          vesselForExport[0]?.id ?? "",
          { [sid]: records[sid] ?? [] },
          { [sid]: engineRoomRecords[sid] ?? [] },
          { [sid]: anomalyRecords[sid] ?? [] },
          { [sid]: bilgeWaterRecords[sid] ?? [] },
          handoverSummaries[sid] ? { [sid]: handoverSummaries[sid] } : {},
          riskAssessments[sid] ? { [sid]: riskAssessments[sid] } : {},
        );
        downloadExportFile(data, currentVessel?.name);
      } else {
        exportDataForVessel();
      }
    }
    setShowExportModal(false);
  }, [exportVesselScope, exportShiftScope, currentShift.id, currentVessel, vessels, records, engineRoomRecords, anomalyRecords, bilgeWaterRecords, handoverSummaries, riskAssessments, exportAllData, exportDataForVessel]);

  const importShiftPreviews = useMemo(() => {
    if (!preview?.valid || !preview.data) return [];
    const data = preview.data;
    const shiftIds = new Set<string>();
    [data.records, data.engineRoomRecords, data.anomalyRecords, data.bilgeWaterRecords].forEach((map) => {
      Object.keys(map).forEach((k) => shiftIds.add(k));
    });
    Object.keys(data.handoverSummaries).forEach((k) => shiftIds.add(k));
    if (data.riskAssessments) {
      Object.keys(data.riskAssessments).forEach((k) => shiftIds.add(k));
    }
    return Array.from(shiftIds).sort().map((sid) =>
      buildShiftPreview(sid, data.records, data.engineRoomRecords, data.anomalyRecords, data.bilgeWaterRecords, data.handoverSummaries, data.riskAssessments ?? {})
    );
  }, [preview]);

  const conflictByShift = useMemo(() => {
    if (!preview?.conflicts) return {};
    const grouped: Record<string, ImportConflict[]> = {};
    preview.conflicts.forEach((c) => {
      if (!grouped[c.shiftId]) grouped[c.shiftId] = [];
      grouped[c.shiftId].push(c);
    });
    return grouped;
  }, [preview]);

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
            <button className="primary" onClick={() => setShowExportModal(true)}>
              导出数据
            </button>
          </div>
        </div>

        <div className="dm-storage-overview">
          <div className="dm-storage-bar-wrap">
            <div className="dm-storage-bar">
              <div className="dm-storage-segment seg-records" style={{ width: totalRecords > 0 ? `${(localStats.records / Math.max(totalRecords, 1)) * 100}%` : "0%" }} />
              <div className="dm-storage-segment seg-engine" style={{ width: totalRecords > 0 ? `${(localStats.engineRoom / Math.max(totalRecords, 1)) * 100}%` : "0%" }} />
              <div className="dm-storage-segment seg-anomaly" style={{ width: totalRecords > 0 ? `${(localStats.anomalies / Math.max(totalRecords, 1)) * 100}%` : "0%" }} />
              <div className="dm-storage-segment seg-bilge" style={{ width: totalRecords > 0 ? `${(localStats.bilge / Math.max(totalRecords, 1)) * 100}%` : "0%" }} />
              <div className="dm-storage-segment seg-risk" style={{ width: totalRecords > 0 ? `${(localStats.risk / Math.max(totalRecords, 1)) * 100}%` : "0%" }} />
            </div>
            <span className="dm-storage-total">共 {totalRecords} 条记录</span>
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
          <div className="local-stat-item">
            <small>风险评估</small>
            <strong>{localStats.risk}</strong>
          </div>
        </div>

        {shiftPreviews.length > 0 && (
          <div className="dm-shift-overview">
            <h4>班次数据概览</h4>
            <div className="dm-shift-grid">
              {shiftPreviews.map((sp) => (
                <div key={sp.shiftId} className="dm-shift-card">
                  <div className="dm-shift-card-header">
                    <span className="dm-shift-label">{sp.shiftLabel}</span>
                    <span className="dm-shift-record-count">{sp.recordCount + sp.engineRoomCount + sp.anomalyCount + sp.bilgeCount} 条</span>
                  </div>
                  <div className="dm-shift-card-stats">
                    {sp.recordCount > 0 && <span className="dm-mini-stat">值班 {sp.recordCount}</span>}
                    {sp.engineRoomCount > 0 && <span className="dm-mini-stat">机舱 {sp.engineRoomCount}</span>}
                    {sp.anomalyCount > 0 && <span className="dm-mini-stat dm-mini-stat-warn">异常 {sp.anomalyCount}</span>}
                    {sp.bilgeCount > 0 && <span className="dm-mini-stat">舱底水 {sp.bilgeCount}</span>}
                    {sp.hasHandover && <span className="dm-mini-stat dm-mini-stat-ok">已交接</span>}
                    {sp.riskCount > 0 && <span className="dm-mini-stat">风险 {sp.riskCount}</span>}
                  </div>
                  {sp.devices.length > 0 && (
                    <div className="dm-shift-devices">
                      {sp.devices.slice(0, 4).map((d) => (
                        <span key={d} className="dm-device-chip">{d}</span>
                      ))}
                      {sp.devices.length > 4 && <span className="dm-device-chip dm-device-more">+{sp.devices.length - 4}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <small className="data-hint">
          导出内容包含：班次信息、设备记录、参数读数、异常巡检记录、交接摘要和风险评估。数据将保存为 JSON 格式文件存储在本地。
        </small>
      </section>

      {showExportModal && (
        <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
          <div className="modal-content data-export-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>导出值班记录</h3>
              <button className="modal-close" onClick={() => setShowExportModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="dm-export-scope">
                <h4>船舶范围</h4>
                <label className="strategy-option">
                  <input
                    type="radio"
                    name="export-vessel-scope"
                    checked={exportVesselScope === "currentVessel"}
                    onChange={() => setExportVesselScope("currentVessel")}
                  />
                  <div>
                    <strong>仅当前船舶（{currentVessel?.name ?? "加载中..."}）</strong>
                    <small>导出当前选中船舶的所有数据，可在下方进一步选择班次范围</small>
                  </div>
                </label>
                <label className="strategy-option">
                  <input
                    type="radio"
                    name="export-vessel-scope"
                    checked={exportVesselScope === "allVessels"}
                    onChange={() => setExportVesselScope("allVessels")}
                  />
                  <div>
                    <strong>全部船舶（共 {vessels.length} 艘）</strong>
                    <small>导出所有船舶的完整数据（含船舶配置信息），用于完整备份或迁移</small>
                  </div>
                </label>
              </div>

              {exportVesselScope === "currentVessel" && (
                <div className="dm-export-scope">
                  <h4>班次范围</h4>
                  <label className="strategy-option">
                    <input
                      type="radio"
                      name="export-shift-scope"
                      checked={exportShiftScope === "allShifts"}
                      onChange={() => setExportShiftScope("allShifts")}
                    />
                    <div>
                      <strong>全部班次</strong>
                      <small>导出当前船舶所有班次的值班记录、机舱参数、异常记录、舱底水记录、交接摘要和风险评估</small>
                    </div>
                  </label>
                  <label className="strategy-option">
                    <input
                      type="radio"
                      name="export-shift-scope"
                      checked={exportShiftScope === "currentShift"}
                      onChange={() => setExportShiftScope("currentShift")}
                    />
                    <div>
                      <strong>仅当前班次（{currentShift.label}）</strong>
                      <small>仅导出当前船舶当前选中班次的全部数据</small>
                    </div>
                  </label>
                </div>
              )}

              <div className="dm-export-preview">
                <h4>导出内容预览</h4>
                {exportVesselScope === "allVessels" ? (
                  <div className="dm-vessel-overview">
                    <div className="preview-stat-item">
                      <small>船舶总数</small>
                      <strong>{vessels.length}</strong>
                    </div>
                    <div className="dm-vessel-names">
                      {vessels.map((v) => (
                        <span key={v.id} className="dm-vessel-chip">
                          {v.name}
                          {v.isDefault && <em>默认</em>}
                        </span>
                      ))}
                    </div>
                    <small className="dm-hint">包含所有船舶的完整数据及船舶配置信息</small>
                  </div>
                ) : (
                  <>
                    <div className="preview-stats">
                      <div className="preview-stat-item">
                        <small>值班记录</small>
                        <strong>{exportStats.records}</strong>
                      </div>
                      <div className="preview-stat-item">
                        <small>机舱参数</small>
                        <strong>{exportStats.engineRoom}</strong>
                      </div>
                      <div className="preview-stat-item">
                        <small>异常记录</small>
                        <strong>{exportStats.anomalies}</strong>
                      </div>
                      <div className="preview-stat-item">
                        <small>舱底水记录</small>
                        <strong>{exportStats.bilge}</strong>
                      </div>
                      <div className="preview-stat-item">
                        <small>交接摘要</small>
                        <strong>{exportStats.handover}</strong>
                      </div>
                      <div className="preview-stat-item">
                        <small>风险评估</small>
                        <strong>{exportStats.risk}</strong>
                      </div>
                    </div>

                    <div className="dm-export-content-detail">
                      <div className="dm-export-section">
                        <span className="dm-export-section-icon">📋</span>
                        <div>
                          <strong>班次与设备</strong>
                          <small>包含 {exportShiftScope === "allShifts" ? allShiftIds.length : 1} 个班次、{exportShiftScope === "allShifts" ? [...new Set(Object.values(records).flat().filter(r => !r.deletedAt).map(r => r.device))].length : [...new Set((records[currentShift.id] ?? []).filter(r => !r.deletedAt).map(r => r.device))].length} 个设备</small>
                        </div>
                      </div>
                      <div className="dm-export-section">
                        <span className="dm-export-section-icon">⚙️</span>
                        <div>
                          <strong>参数读数</strong>
                          <small>机舱参数记录 {exportStats.engineRoom} 条（主机转速、滑油压力、冷却水温、燃油消耗）</small>
                        </div>
                      </div>
                      <div className="dm-export-section">
                        <span className="dm-export-section-icon">⚠️</span>
                        <div>
                          <strong>异常记录</strong>
                          <small>异常巡检记录 {exportStats.anomalies} 条（含状态历史与跨班次遗留信息）</small>
                        </div>
                      </div>
                      <div className="dm-export-section">
                        <span className="dm-export-section-icon">🔄</span>
                        <div>
                          <strong>交接摘要</strong>
                          <small>交接摘要 {exportStats.handover} 份（含自动摘要与手动备注）</small>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowExportModal(false)}>取消</button>
              <button className="primary" onClick={handleExport}>
                确认导出
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="modal-overlay" onClick={handleCloseImportModal}>
          <div className="modal-content data-import-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>导入值班记录</h3>
              <button className="modal-close" onClick={handleCloseImportModal}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {importStep === "upload" && !preview && (
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

                  <h4>数据概览</h4>
                  {(preview.stats.totalVessels ?? 0) > 0 && (
                    <div className="import-vessel-info">
                      <div className="preview-stat-item">
                        <small>船舶数量</small>
                        <strong>{preview.stats.totalVessels}</strong>
                      </div>
                      {preview.stats.vesselNames && preview.stats.vesselNames.length > 0 && (
                        <div className="dm-vessel-names import-vessel-names">
                          <small>涉及船舶：</small>
                          {preview.stats.vesselNames.map((vn, i) => (
                            <span key={i} className="dm-vessel-chip">{vn}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
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
                    <div className="preview-stat-item">
                      <small>风险评估</small>
                      <strong>{preview.stats.totalRiskAssessments}</strong>
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

                  {importShiftPreviews.length > 0 && (
                    <div className="dm-import-shift-detail">
                      <h4>各班次详情</h4>
                      <div className="dm-import-shift-list">
                        {importShiftPreviews.map((sp) => {
                          const shiftConflicts = conflictByShift[sp.shiftId] ?? [];
                          const hasConflict = shiftConflicts.length > 0;
                          return (
                            <div key={sp.shiftId} className={`dm-import-shift-item ${hasConflict ? "dm-import-shift-conflict" : ""}`}>
                              <div className="dm-import-shift-header">
                                <span className="dm-shift-label">{sp.shiftLabel}</span>
                                {hasConflict && <span className="dm-conflict-badge">冲突</span>}
                              </div>
                              <div className="dm-import-shift-stats">
                                {sp.recordCount > 0 && <span>值班 {sp.recordCount} 条</span>}
                                {sp.engineRoomCount > 0 && <span>机舱 {sp.engineRoomCount} 条</span>}
                                {sp.anomalyCount > 0 && <span className="dm-text-warn">异常 {sp.anomalyCount} 条</span>}
                                {sp.bilgeCount > 0 && <span>舱底水 {sp.bilgeCount} 条</span>}
                                {sp.hasHandover && <span>有交接摘要</span>}
                              </div>
                              {sp.devices.length > 0 && (
                                <div className="dm-import-shift-devices">
                                  <small>设备：</small>
                                  {sp.devices.slice(0, 5).map((d) => (
                                    <span key={d} className="dm-device-chip">{d}</span>
                                  ))}
                                  {sp.devices.length > 5 && <span className="dm-device-chip dm-device-more">+{sp.devices.length - 5}</span>}
                                </div>
                              )}
                              {sp.sampleEngine.length > 0 && (
                                <div className="dm-import-param-preview">
                                  <small>参数读数示例：</small>
                                  <div className="dm-param-row">
                                    {sp.sampleEngine[0] && (
                                      <>
                                        <span>转速 {sp.sampleEngine[0].speed} rpm</span>
                                        <span>滑油 {sp.sampleEngine[0].oilPressure} MPa</span>
                                        <span>水温 {sp.sampleEngine[0].coolingTemp} ℃</span>
                                        <span>油耗 {sp.sampleEngine[0].fuelConsumption} L/h</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              )}
                              {sp.anomalyDevices.length > 0 && (
                                <div className="dm-import-anomaly-preview">
                                  <small>异常项：</small>
                                  <div className="dm-anomaly-tags">
                                    {sp.anomalyDevices.slice(0, 4).map((d) => (
                                      <span key={d} className="dm-anomaly-tag">{d}</span>
                                    ))}
                                    {sp.anomalyDevices.length > 4 && <span className="dm-anomaly-tag">+{sp.anomalyDevices.length - 4}</span>}
                                  </div>
                                </div>
                              )}
                              {hasConflict && (
                                <div className="dm-conflict-detail">
                                  {shiftConflicts.map((c, i) => (
                                    <div key={i} className="dm-conflict-line">
                                      <span className="conflict-type">{CONFLICT_TYPE_LABELS[c.type]}</span>
                                      <span className="dm-conflict-vs">本地 {c.existingCount} 条 · 导入 {c.importedCount} 条</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {preview.conflicts.length > 0 && (
                    <div className="conflict-section">
                      <div className="warning-banner">
                        <strong>⚠️ 检测到数据冲突</strong>
                        <small>以下班次在本地已有记录，请选择导入策略</small>
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
                        <small>使用导入文件的数据覆盖对应班次的本地记录（⚠ 本地对应班次数据将被替换）</small>
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
            {importStep === "confirm" && !importResult && (
              <div className="dm-confirm-warning">
                <strong>⚠️ 二次确认</strong>
                <p>
                  {strategy === "overwrite"
                    ? `覆盖导入将替换本地冲突班次的全部数据，此操作不可撤销。共 ${preview?.conflicts.length ?? 0} 处冲突数据将被覆盖。`
                    : `合并导入将保留本地数据并仅添加新记录，${preview?.conflicts.length ?? 0} 处冲突数据将保留本地版本。`}
                </p>
              </div>
            )}
            <div className="modal-footer">
              <button onClick={handleCloseImportModal}>
                {importResult?.includes("成功") ? "关闭" : "取消"}
              </button>
              {preview?.valid && !importResult?.includes("成功") && importStep === "preview" && (
                <>
                  <button className="secondary-btn" onClick={resetImportState}>
                    重新选择
                  </button>
                  {preview.conflicts.length > 0 ? (
                    <button
                      className="dm-btn-warn"
                      onClick={() => setImportStep("confirm")}
                      disabled={importing}
                    >
                      确认导入（存在冲突）
                    </button>
                  ) : (
                    <button
                      className="primary"
                      onClick={handleConfirmImport}
                      disabled={importing}
                    >
                      {importing ? "导入中..." : "确认导入"}
                    </button>
                  )}
                </>
              )}
              {importStep === "confirm" && !importResult && (
                <>
                  <button className="secondary-btn" onClick={() => setImportStep("preview")}>
                    返回修改
                  </button>
                  <button
                    className="dm-btn-danger"
                    onClick={handleConfirmImport}
                    disabled={importing}
                  >
                    {importing ? "导入中..." : `确认${strategy === "overwrite" ? "覆盖" : "合并"}导入`}
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
