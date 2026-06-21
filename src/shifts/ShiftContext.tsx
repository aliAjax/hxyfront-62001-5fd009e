import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  type Shift,
  type WatchRecord,
  type EngineRoomRecord,
  type AnomalyRecord,
  type AnomalyStatus,
  type BilgeWaterRecord,
  type HandoverSummary,
  type ExportData,
  type ImportStrategy,
  type RiskAssessment,
  type RiskLevel,
  type RiskTrigger,
  type RiskTimelineEvent,
  SHIFTS,
  getPreviousShiftId,
  generateIdempotencyKey,
  computeDataHash,
  downloadExportFile,
  isBilgeTreatmentUnfinished,
  calculateRiskAssessment,
  type RiskCalculationInput,
  RISK_LEVEL_LABELS,
  RISK_LEVEL_SCORES,
  RISK_LEVEL_ORDER,
} from "./domain";
import { getRepository } from "./repository";

interface ShiftContextValue {
  shifts: Shift[];
  currentShift: Shift;
  setCurrentShiftId: (id: string) => void;
  records: Record<string, WatchRecord[]>;
  currentRecords: WatchRecord[];
  addRecord: (record: Omit<WatchRecord, "id" | "shiftId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "vesselId" | "fleetId" | "deletedAt" | "idempotencyKey" | "isEdited" | "editedAt" | "editedBy" | "editHistory"> & { idempotencyKey?: string }) => { record: WatchRecord; created: boolean };
  removeRecord: (id: string) => void;
  updateRecord: (id: string, patch: Partial<WatchRecord>) => WatchRecord | null;
  deleteRecord: (id: string) => void;
  engineRoomRecords: Record<string, EngineRoomRecord[]>;
  currentEngineRoomRecords: EngineRoomRecord[];
  latestEngineRoomRecord: EngineRoomRecord | null;
  addEngineRoomRecord: (record: Omit<EngineRoomRecord, "id" | "shiftId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "vesselId" | "fleetId" | "deletedAt" | "idempotencyKey" | "isEdited" | "editedAt" | "editedBy" | "editHistory"> & { idempotencyKey?: string }) => { record: EngineRoomRecord; created: boolean };
  updateEngineRoomRecord: (id: string, patch: Partial<EngineRoomRecord>) => EngineRoomRecord | null;
  deleteEngineRoomRecord: (id: string) => void;
  anomalyRecords: Record<string, AnomalyRecord[]>;
  allAnomalyRecords: AnomalyRecord[];
  addAnomalyRecord: (record: Omit<AnomalyRecord, "id" | "shiftId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "vesselId" | "fleetId" | "deletedAt" | "idempotencyKey" | "initialStatus" | "currentStatus" | "statusHistory" | "carryOverFromShiftId" | "isCarriedOver"> & { status: AnomalyStatus; idempotencyKey?: string }) => { record: AnomalyRecord; created: boolean };
  updateAnomalyStatus: (recordId: string, newStatus: AnomalyStatus, note: string, operator: string) => void;
  updateAnomalyRecord: (id: string, patch: Partial<AnomalyRecord>) => AnomalyRecord | null;
  deleteAnomalyRecord: (id: string) => void;
  bilgeWaterRecords: Record<string, BilgeWaterRecord[]>;
  currentBilgeWaterRecords: BilgeWaterRecord[];
  latestBilgeWaterRecord: BilgeWaterRecord | null;
  allBilgeWaterRecords: BilgeWaterRecord[];
  addBilgeWaterRecord: (record: Omit<BilgeWaterRecord, "id" | "shiftId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "vesselId" | "fleetId" | "deletedAt" | "idempotencyKey" | "isEdited" | "editedAt" | "editedBy" | "editHistory"> & { idempotencyKey?: string }) => { record: BilgeWaterRecord; created: boolean };
  updateBilgeWaterRecord: (id: string, patch: Partial<BilgeWaterRecord>) => BilgeWaterRecord | null;
  deleteBilgeWaterRecord: (id: string) => void;
  handoverSummaries: Record<string, HandoverSummary>;
  currentHandoverSummary: HandoverSummary | null;
  previousShiftSummary: HandoverSummary | null;
  saveHandover: (manualNote: string, isDraft: boolean) => void;
  exportData: () => void;
  importData: (data: ExportData, strategy: ImportStrategy) => void;
  getAllData: () => ExportData;
  carryOverAnomaliesToShift: (anomalyIds: string[], targetShiftId: string) => AnomalyRecord[];
  carriedOverAnomalies: AnomalyRecord[];
  generateAutoSummary: (shiftId?: string) => string;
  isDataDirty: (shiftId?: string) => boolean;
  lastSubmissionKey: string | null;
  riskAssessments: Record<string, RiskAssessment[]>;
  currentRiskAssessments: RiskAssessment[];
  latestRiskAssessment: RiskAssessment | null;
  allRiskAssessments: RiskAssessment[];
  calculateRisk: (shiftId?: string) => RiskAssessment;
  computeRiskOnTheFly: (shiftId?: string) => RiskAssessment | null;
  riskLevelLabels: Record<RiskLevel, string>;
  riskLevelScores: Record<RiskLevel, number>;
  riskLevelOrder: RiskLevel[];
}

const ShiftContext = createContext<ShiftContextValue | null>(null);

export function ShiftProvider({ children }: { children: ReactNode }) {
  const repository = useMemo(() => getRepository(), []);
  const initialState = useMemo(() => repository.getState(), [repository]);

  const [currentShiftId, setCurrentShiftIdState] = useState(initialState.currentShiftId);
  const [records, setRecords] = useState(initialState.records);
  const [engineRoomRecords, setEngineRoomRecords] = useState(initialState.engineRoomRecords);
  const [anomalyRecords, setAnomalyRecords] = useState(initialState.anomalyRecords);
  const [bilgeWaterRecords, setBilgeWaterRecords] = useState(initialState.bilgeWaterRecords);
  const [handoverSummaries, setHandoverSummaries] = useState(initialState.handoverSummaries);
  const [riskAssessments, setRiskAssessments] = useState(initialState.riskAssessments);
  const [lastSubmissionKey, setLastSubmissionKey] = useState<string | null>(null);

  const prevShiftIdRef = useRef(currentShiftId);

  const refreshState = useCallback(() => {
    const state = repository.getState();
    setCurrentShiftIdState(state.currentShiftId);
    setRecords(state.records);
    setEngineRoomRecords(state.engineRoomRecords);
    setAnomalyRecords(state.anomalyRecords);
    setBilgeWaterRecords(state.bilgeWaterRecords);
    setHandoverSummaries(state.handoverSummaries);
    setRiskAssessments(state.riskAssessments);
  }, [repository]);

  useEffect(() => {
    const handlers = [
      repository.on("records:changed", refreshState),
      repository.on("engineRoom:changed", refreshState),
      repository.on("anomalies:changed", refreshState),
      repository.on("bilge:changed", refreshState),
      repository.on("handover:changed", refreshState),
      repository.on("risk:changed", refreshState),
      repository.on("shift:changed", refreshState),
    ];
    return () => {
      handlers.forEach((off) => off());
    };
  }, [repository, refreshState]);

  const currentShift = useMemo(
    () => SHIFTS.find((s) => s.id === currentShiftId) ?? SHIFTS[0],
    [currentShiftId]
  );

  const setCurrentShiftId = useCallback(
    (id: string) => {
      repository.setCurrentShiftId(id);
    },
    [repository]
  );

  const currentRecords = useMemo(
    () => (records[currentShiftId] ?? []).filter((r) => !r.deletedAt),
    [records, currentShiftId]
  );

  const currentEngineRoomRecords = useMemo(
    () => (engineRoomRecords[currentShiftId] ?? []).filter((r) => !r.deletedAt),
    [engineRoomRecords, currentShiftId]
  );

  const currentBilgeWaterRecords = useMemo(
    () => (bilgeWaterRecords[currentShiftId] ?? []).filter((r) => !r.deletedAt),
    [bilgeWaterRecords, currentShiftId]
  );

  const allEngineRoomRecords = useMemo(
    () => Object.values(engineRoomRecords).flat().filter((r) => !r.deletedAt),
    [engineRoomRecords]
  );

  const latestEngineRoomRecord = useMemo(() => {
    if (allEngineRoomRecords.length === 0) return null;
    return allEngineRoomRecords.reduce((latest, record) =>
      new Date(record.createdAt) > new Date(latest.createdAt) ? record : latest
    );
  }, [allEngineRoomRecords]);

  const allBilgeWaterRecords = useMemo(
    () => Object.values(bilgeWaterRecords).flat().filter((r) => !r.deletedAt),
    [bilgeWaterRecords]
  );

  const latestBilgeWaterRecord = useMemo(() => {
    if (allBilgeWaterRecords.length === 0) return null;
    return allBilgeWaterRecords.reduce((latest, record) =>
      new Date(record.createdAt) > new Date(latest.createdAt) ? record : latest
    );
  }, [allBilgeWaterRecords]);

  const allAnomalyRecords = useMemo(
    () => Object.values(anomalyRecords).flat().filter((r) => !r.deletedAt),
    [anomalyRecords]
  );

  const currentHandoverSummary = useMemo(
    () => {
      const s = handoverSummaries[currentShiftId];
      return s && !s.deletedAt ? s : null;
    },
    [handoverSummaries, currentShiftId]
  );

  const previousShiftSummary = useMemo(() => {
    const prevId = getPreviousShiftId(currentShiftId);
    if (!prevId) return null;
    const s = handoverSummaries[prevId];
    return s && !s.deletedAt ? s : null;
  }, [handoverSummaries, currentShiftId]);

  const carriedOverAnomalies = useMemo(() => {
    return repository.listCarriedOverAnomalies(currentShiftId);
  }, [repository, currentShiftId, anomalyRecords]);

  const addRecord = useCallback(
    (input: Omit<WatchRecord, "id" | "shiftId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "vesselId" | "fleetId" | "deletedAt" | "idempotencyKey" | "isEdited" | "editedAt" | "editedBy" | "editHistory"> & { idempotencyKey?: string }) => {
      const key = input.idempotencyKey ?? generateIdempotencyKey();
      setLastSubmissionKey(key);
      const result = repository.addRecord({ ...input, shiftId: currentShiftId, idempotencyKey: key });
      if (!result.created) {
        console.warn("重复提交检测：该记录已存在");
      }
      return result;
    },
    [repository, currentShiftId]
  );

  const removeRecord = useCallback(
    (id: string) => {
      repository.deleteRecord(id, currentShift.label);
    },
    [repository, currentShift.label]
  );

  const updateRecord = useCallback(
    (id: string, patch: Partial<WatchRecord>) => {
      return repository.updateRecord(id, patch, currentShift.label);
    },
    [repository, currentShift.label]
  );

  const deleteRecord = useCallback(
    (id: string) => {
      repository.deleteRecord(id, currentShift.label);
    },
    [repository, currentShift.label]
  );

  const addEngineRoomRecord = useCallback(
    (input: Omit<EngineRoomRecord, "id" | "shiftId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "vesselId" | "fleetId" | "deletedAt" | "idempotencyKey" | "isEdited" | "editedAt" | "editedBy" | "editHistory"> & { idempotencyKey?: string }) => {
      const key = input.idempotencyKey ?? generateIdempotencyKey();
      setLastSubmissionKey(key);
      const result = repository.addEngineRoomRecord({ ...input, shiftId: currentShiftId, idempotencyKey: key });
      if (!result.created) {
        console.warn("重复提交检测：该记录已存在");
      }
      return result;
    },
    [repository, currentShiftId]
  );

  const updateEngineRoomRecord = useCallback(
    (id: string, patch: Partial<EngineRoomRecord>) => {
      return repository.updateEngineRoomRecord(id, patch, currentShift.label);
    },
    [repository, currentShift.label]
  );

  const deleteEngineRoomRecord = useCallback(
    (id: string) => {
      repository.deleteEngineRoomRecord(id, currentShift.label);
    },
    [repository, currentShift.label]
  );

  const addBilgeWaterRecord = useCallback(
    (input: Omit<BilgeWaterRecord, "id" | "shiftId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "vesselId" | "fleetId" | "deletedAt" | "idempotencyKey" | "isEdited" | "editedAt" | "editedBy" | "editHistory"> & { idempotencyKey?: string }) => {
      const key = input.idempotencyKey ?? generateIdempotencyKey();
      setLastSubmissionKey(key);
      const result = repository.addBilgeWaterRecord({ ...input, shiftId: currentShiftId, idempotencyKey: key });
      if (!result.created) {
        console.warn("重复提交检测：该记录已存在");
      }
      return result;
    },
    [repository, currentShiftId]
  );

  const updateBilgeWaterRecord = useCallback(
    (id: string, patch: Partial<BilgeWaterRecord>) => {
      return repository.updateBilgeWaterRecord(id, patch, currentShift.label);
    },
    [repository, currentShift.label]
  );

  const deleteBilgeWaterRecord = useCallback(
    (id: string) => {
      repository.deleteBilgeWaterRecord(id, currentShift.label);
    },
    [repository, currentShift.label]
  );

  const addAnomalyRecord = useCallback(
    (input: Omit<AnomalyRecord, "id" | "shiftId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "vesselId" | "fleetId" | "deletedAt" | "idempotencyKey" | "initialStatus" | "currentStatus" | "statusHistory" | "carryOverFromShiftId" | "isCarriedOver"> & { status: AnomalyStatus; idempotencyKey?: string }) => {
      const key = input.idempotencyKey ?? generateIdempotencyKey();
      setLastSubmissionKey(key);
      const result = repository.addAnomalyRecord({ ...input, shiftId: currentShiftId, idempotencyKey: key });
      if (!result.created) {
        console.warn("重复提交检测：该记录已存在");
      }
      return result;
    },
    [repository, currentShiftId]
  );

  const updateAnomalyStatus = useCallback(
    (recordId: string, newStatus: AnomalyStatus, note: string, operator: string) => {
      repository.updateAnomalyStatus(recordId, newStatus, note, operator);
    },
    [repository]
  );

  const updateAnomalyRecord = useCallback(
    (id: string, patch: Partial<AnomalyRecord>) => {
      return repository.updateAnomalyRecord(id, patch, currentShift.label);
    },
    [repository, currentShift.label]
  );

  const deleteAnomalyRecord = useCallback(
    (id: string) => {
      repository.deleteAnomalyRecord(id, currentShift.label);
    },
    [repository, currentShift.label]
  );

  const carryOverAnomaliesToShift = useCallback(
    (anomalyIds: string[], targetShiftId: string) => {
      return repository.carryOverAnomaliesToShift(anomalyIds, targetShiftId, currentShift.label);
    },
    [repository, currentShift.label]
  );

  const generateAutoSummary = useCallback(
    (shiftId?: string): string => {
      const targetShift = shiftId ?? currentShiftId;
      const parts: string[] = [];
      const now = new Date();
      const timestampStr = now.toLocaleString("zh-CN");
      const shiftLabel = SHIFTS.find((s) => s.id === targetShift)?.label ?? targetShift;

      parts.push(`═══════════════════════════════`);
      parts.push(`交接班摘要 - ${shiftLabel}`);
      parts.push(`生成时间：${timestampStr}`);
      parts.push(`═══════════════════════════════`);

      const stats: string[] = [];
      const shiftEngineRecords = (engineRoomRecords[targetShift] ?? []).filter((r) => !r.deletedAt);
      const shiftBilgeRecords = (bilgeWaterRecords[targetShift] ?? []).filter((r) => !r.deletedAt);
      const shiftAllAnomalies = (anomalyRecords[targetShift] ?? []).filter((r) => !r.deletedAt);
      const shiftAnomalies = shiftAllAnomalies.filter((r) => r.currentStatus !== "已关闭");
      const shiftAllRecords = (records[targetShift] ?? []).filter((r) => !r.deletedAt);
      const shiftUnfinishedRecords = shiftAllRecords.filter(
        (r) => r.status && r.status !== "已解决" && r.status !== "正常巡检"
      );
      const carriedOverList = shiftAllAnomalies.filter((r) => r.isCarriedOver);

      stats.push(`机舱参数记录：${shiftEngineRecords.length} 条`);
      stats.push(`舱底水记录：${shiftBilgeRecords.length} 条`);
      stats.push(`巡检记录：${shiftAllRecords.length} 条`);
      stats.push(`异常项：${shiftAllAnomalies.length} 条（未关闭 ${shiftAnomalies.length} 条）`);
      stats.push(`跨班次遗留：${carriedOverList.length} 条`);
      parts.push(`\n【班次统计】\n${stats.join("  |  ")}`);

      if (shiftEngineRecords.length > 0) {
        const latest = shiftEngineRecords[shiftEngineRecords.length - 1];
        const engineEvaluations: string[] = [];

        const { mainEngineSpeed, lubricatingOilPressure, coolingWaterTemp, fuelConsumption } = latest;
        const checkRange = (val: number, range: [number, number]) => val < range[0] || val > range[1];

        if (checkRange(mainEngineSpeed, [600, 950])) {
          engineEvaluations.push(
            `⚠ 主机转速 ${mainEngineSpeed} rpm${checkRange(mainEngineSpeed, [500, 1050]) ? "（严重异常）" : "（偏离正常）"}`
          );
        }
        if (checkRange(lubricatingOilPressure, [0.35, 0.6])) {
          engineEvaluations.push(
            `⚠ 滑油压力 ${lubricatingOilPressure} MPa${checkRange(lubricatingOilPressure, [0.25, 0.7]) ? "（严重异常）" : "（偏离正常）"}`
          );
        }
        if (checkRange(coolingWaterTemp, [70, 85])) {
          engineEvaluations.push(
            `⚠ 冷却水温 ${coolingWaterTemp} ℃${checkRange(coolingWaterTemp, [60, 92]) ? "（严重异常）" : "（偏离正常）"}`
          );
        }
        if (checkRange(fuelConsumption, [15, 35])) {
          engineEvaluations.push(
            `⚠ 燃油消耗 ${fuelConsumption} L/h${checkRange(fuelConsumption, [10, 45]) ? "（严重异常）" : "（偏离正常）"}`
          );
        }

        parts.push(
          `\n【机舱参数读数】\n` +
          `  主机转速：${mainEngineSpeed} rpm\n` +
          `  滑油压力：${lubricatingOilPressure} MPa\n` +
          `  冷却水温：${coolingWaterTemp} ℃\n` +
          `  燃油消耗：${fuelConsumption} L/h\n` +
          (engineEvaluations.length > 0
            ? `  ⚠ 参数异常：\n    ${engineEvaluations.join("\n    ")}`
            : `  ✓ 所有参数在正常范围内`)
        );
      } else {
        parts.push(`\n【机舱参数读数】\n  本班次暂无机舱参数记录`);
      }

      if (shiftBilgeRecords.length > 0) {
        const latest = shiftBilgeRecords[shiftBilgeRecords.length - 1];
        const levelTag = latest.liquidLevel >= 90 ? "⚠危险" : latest.liquidLevel >= 80 ? "⚠警戒" : "✓正常";
        parts.push(
          `\n【舱底水状态】\n` +
          `  液位：${latest.liquidLevel}%（${levelTag}）\n` +
          `  泵状态：${latest.pumpStatus}\n` +
          `  运行时长：${latest.pumpRunDuration} min\n` +
          `  处理结果：${latest.treatmentResult}` +
          (latest.warningNote ? `\n  备注：${latest.warningNote}` : "")
        );

        const unfinishedBilge = shiftBilgeRecords.filter(
          (r) => isBilgeTreatmentUnfinished(r.treatmentResult) || r.liquidLevel >= 80 || r.pumpStatus === "故障"
        );
        if (unfinishedBilge.length > 0) {
          const bilgeItems = unfinishedBilge.map(
            (r, i) => {
              const issues: string[] = [];
              if (r.liquidLevel >= 90) issues.push("液位危险");
              else if (r.liquidLevel >= 80) issues.push("液位警戒");
              if (r.pumpStatus === "故障") issues.push("泵故障");
              if (isBilgeTreatmentUnfinished(r.treatmentResult)) issues.push(`处理${r.treatmentResult}`);
              return `${i + 1}. 液位 ${r.liquidLevel}% [${issues.join("，")}]${r.warningNote ? " - " + r.warningNote : ""}`;
            }
          );
          parts.push(`\n【舱底水·需关注事项】\n${bilgeItems.join("\n")}`);
        }
      } else {
        parts.push(`\n【舱底水状态】\n  本班次暂无舱底水记录`);
      }

      if (carriedOverList.length > 0) {
        const items = carriedOverList.map(
          (r, i) => `${i + 1}. ${r.device}（${r.currentStatus}）：${r.anomalyDescription}${r.handoverNote ? " - 备注：" + r.handoverNote : ""}`
        );
        parts.push(`\n【跨班次遗留异常·来自上一班】\n${items.join("\n")}`);
      }

      if (shiftAnomalies.length > 0) {
        const grouped: Record<string, AnomalyRecord[]> = {
          "待处理": [],
          "处理中": [],
          "需复查": [],
        };
        shiftAnomalies.forEach((r) => {
          if (!r.isCarriedOver) {
            if (grouped[r.currentStatus]) {
              grouped[r.currentStatus].push(r);
            } else {
              if (!grouped["其他"]) grouped["其他"] = [];
              grouped["其他"].push(r);
            }
          }
        });

        const newAnomalyItems: string[] = [];
        (["待处理", "处理中", "需复查", "其他"] as const).forEach((status) => {
          if (grouped[status] && grouped[status].length > 0) {
            grouped[status].forEach((r, i) => {
              newAnomalyItems.push(`  [${status}] ${r.device}：${r.anomalyDescription}${r.handoverNote ? "（备注：" + r.handoverNote + "）" : ""}`);
            });
          }
        });

        if (newAnomalyItems.length > 0) {
          parts.push(`\n【异常巡检项·本班次未关闭】\n${newAnomalyItems.join("\n")}`);
        }
      } else {
        parts.push(`\n【异常巡检项】\n  ✓ 本班次无未关闭异常项`);
      }

      if (shiftUnfinishedRecords.length > 0) {
        const items = shiftUnfinishedRecords.map(
          (r, i) => `${i + 1}. ${r.device} [${r.status}]${r.anomaly ? "：" + r.anomaly : ""}${r.handoverNote ? "（交接备注：" + r.handoverNote + "）" : ""}`
        );
        parts.push(`\n【未完成处理事项】\n${items.join("\n")}`);
      }

      const totalUnfinished = shiftAnomalies.length + shiftUnfinishedRecords.length +
        shiftBilgeRecords.filter((r) => isBilgeTreatmentUnfinished(r.treatmentResult) || r.liquidLevel >= 80 || r.pumpStatus === "故障").length;

      if (totalUnfinished > 0) {
        parts.push(`\n═══════════════════════════════`);
        parts.push(`⚠ 交接提醒：本班次共有 ${totalUnfinished} 项需关注的事项`);
        parts.push(`  请下一班次轮机员重点处理上述标记项目。`);
        parts.push(`═══════════════════════════════`);
      } else {
        parts.push(`\n═══════════════════════════════`);
        parts.push(`✓ 本班次运行正常，所有项目已妥善处理。`);
        parts.push(`═══════════════════════════════`);
      }

      return parts.join("\n");
    },
    [currentShiftId, engineRoomRecords, bilgeWaterRecords, anomalyRecords, records]
  );

  const isDataDirty = useCallback(
    (shiftId?: string): boolean => {
      const targetShift = shiftId ?? currentShiftId;
      const summary = handoverSummaries[targetShift];
      if (!summary || !summary.dataHash) return true;

      const shiftData = {
        records: (records[targetShift] ?? []).filter((r) => !r.deletedAt),
        engineRoomRecords: (engineRoomRecords[targetShift] ?? []).filter((r) => !r.deletedAt),
        anomalyRecords: (anomalyRecords[targetShift] ?? []).filter((r) => !r.deletedAt),
        bilgeWaterRecords: (bilgeWaterRecords[targetShift] ?? []).filter((r) => !r.deletedAt),
      };
      const currentHash = computeDataHash(shiftData);
      return currentHash !== summary.dataHash;
    },
    [currentShiftId, handoverSummaries, records, engineRoomRecords, anomalyRecords, bilgeWaterRecords]
  );

  const saveHandover = useCallback(
    (manualNote: string, isDraft: boolean) => {
      const targetShift = currentShiftId;
      const autoSummary = generateAutoSummary(targetShift);
      const shiftData = {
        records: (records[targetShift] ?? []).filter((r) => !r.deletedAt),
        engineRoomRecords: (engineRoomRecords[targetShift] ?? []).filter((r) => !r.deletedAt),
        anomalyRecords: (anomalyRecords[targetShift] ?? []).filter((r) => !r.deletedAt),
        bilgeWaterRecords: (bilgeWaterRecords[targetShift] ?? []).filter((r) => !r.deletedAt),
      };
      const dataHash = computeDataHash(shiftData);
      repository.saveHandoverSummary(
        targetShift,
        { autoSummary, manualNote, isDraft, dataHash },
        currentShift.label
      );
    },
    [repository, currentShiftId, currentShift.label, generateAutoSummary, records, engineRoomRecords, anomalyRecords, bilgeWaterRecords]
  );

  const getAllData = useCallback((): ExportData => {
    return repository.getExportData();
  }, [repository]);

  const exportData = useCallback(() => {
    const data = getAllData();
    downloadExportFile(data);
  }, [getAllData]);

  const importData = useCallback(
    (data: ExportData, strategy: ImportStrategy) => {
      repository.applyImport(data, strategy);
    },
    [repository]
  );

  useEffect(() => {
    const prevId = prevShiftIdRef.current;
    if (prevId !== currentShiftId) {
      const prevAnomalies = (anomalyRecords[prevId] ?? []).filter(
        (r) => !r.deletedAt && r.currentStatus !== "已关闭"
      );
      if (prevAnomalies.length > 0) {
        console.warn(`检测到上一班次(${prevId})有 ${prevAnomalies.length} 个未关闭异常，可调用 carryOverAnomaliesToShift 进行迁移`);
      }
      prevShiftIdRef.current = currentShiftId;
    }
  }, [currentShiftId, anomalyRecords]);

  const currentRiskAssessments = useMemo(
    () => (riskAssessments[currentShiftId] ?? []).filter((r) => !r.deletedAt),
    [riskAssessments, currentShiftId]
  );

  const allRiskAssessments = useMemo(
    () => Object.values(riskAssessments).flat().filter((r) => !r.deletedAt),
    [riskAssessments]
  );

  const latestRiskAssessment = useMemo(() => {
    if (currentRiskAssessments.length === 0) return null;
    return currentRiskAssessments.reduce((latest, r) =>
      new Date(r.calculatedAt) > new Date(latest.calculatedAt) ? r : latest
    );
  }, [currentRiskAssessments]);

  const calculateRisk = useCallback(
    (shiftId?: string): RiskAssessment => {
      return repository.calculateAndSaveRiskAssessment(shiftId ?? currentShiftId);
    },
    [repository, currentShiftId]
  );

  const computeRiskOnTheFly = useCallback(
    (shiftId?: string): RiskAssessment | null => {
      const targetShift = shiftId ?? currentShiftId;
      const shiftEngineRecords = (engineRoomRecords[targetShift] ?? []).filter((r) => !r.deletedAt);
      const shiftBilgeRecords = (bilgeWaterRecords[targetShift] ?? []).filter((r) => !r.deletedAt);
      const shiftAnomalyRecords = (anomalyRecords[targetShift] ?? []).filter((r) => !r.deletedAt);

      if (
        shiftEngineRecords.length === 0 &&
        shiftBilgeRecords.length === 0 &&
        shiftAnomalyRecords.length === 0
      ) {
        return null;
      }

      const latestEngine = shiftEngineRecords.length > 0
        ? shiftEngineRecords.reduce((a, b) => (new Date(a.createdAt) > new Date(b.createdAt) ? a : b))
        : null;
      const latestBilge = shiftBilgeRecords.length > 0
        ? shiftBilgeRecords.reduce((a, b) => (new Date(a.createdAt) > new Date(b.createdAt) ? a : b))
        : null;

      const calcInput: RiskCalculationInput = {
        shiftId: targetShift,
        engineRoomRecord: latestEngine,
        bilgeWaterRecord: latestBilge,
        anomalyRecords: shiftAnomalyRecords,
        engineRoomRecords: shiftEngineRecords,
        bilgeWaterRecords: shiftBilgeRecords,
      };

      const calculated = calculateRiskAssessment(calcInput);
      return {
        ...calculated,
        id: "on-the-fly",
        vesselId: null,
        fleetId: null,
        createdAt: new Date().toISOString(),
        createdBy: "on-the-fly",
        updatedAt: new Date().toISOString(),
        updatedBy: "on-the-fly",
        deletedAt: null,
      } as RiskAssessment;
    },
    [currentShiftId, engineRoomRecords, bilgeWaterRecords, anomalyRecords]
  );

  return (
    <ShiftContext.Provider
      value={{
        shifts: SHIFTS,
        currentShift,
        setCurrentShiftId,
        records,
        currentRecords,
        addRecord,
        removeRecord,
        updateRecord,
        deleteRecord,
        engineRoomRecords,
        currentEngineRoomRecords,
        latestEngineRoomRecord,
        addEngineRoomRecord,
        updateEngineRoomRecord,
        deleteEngineRoomRecord,
        anomalyRecords,
        allAnomalyRecords,
        addAnomalyRecord,
        updateAnomalyStatus,
        updateAnomalyRecord,
        deleteAnomalyRecord,
        bilgeWaterRecords,
        currentBilgeWaterRecords,
        latestBilgeWaterRecord,
        allBilgeWaterRecords,
        addBilgeWaterRecord,
        updateBilgeWaterRecord,
        deleteBilgeWaterRecord,
        handoverSummaries,
        currentHandoverSummary,
        previousShiftSummary,
        saveHandover,
        exportData,
        importData,
        getAllData,
        carryOverAnomaliesToShift,
        carriedOverAnomalies,
        generateAutoSummary,
        isDataDirty,
        lastSubmissionKey,
        riskAssessments,
        currentRiskAssessments,
        latestRiskAssessment,
        allRiskAssessments,
        calculateRisk,
        computeRiskOnTheFly,
        riskLevelLabels: RISK_LEVEL_LABELS,
        riskLevelScores: RISK_LEVEL_SCORES,
        riskLevelOrder: RISK_LEVEL_ORDER,
      }}
    >
      {children}
    </ShiftContext.Provider>
  );
}

export function useShift(): ShiftContextValue {
  const ctx = useContext(ShiftContext);
  if (!ctx) throw new Error("useShift must be used within ShiftProvider");
  return ctx;
}
