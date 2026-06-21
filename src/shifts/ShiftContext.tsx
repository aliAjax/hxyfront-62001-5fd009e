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
  SHIFTS,
  getPreviousShiftId,
  generateIdempotencyKey,
  computeDataHash,
  downloadExportFile,
  isBilgeTreatmentUnfinished,
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
  }, [repository]);

  useEffect(() => {
    const handlers = [
      repository.on("records:changed", refreshState),
      repository.on("engineRoom:changed", refreshState),
      repository.on("anomalies:changed", refreshState),
      repository.on("bilge:changed", refreshState),
      repository.on("handover:changed", refreshState),
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

      const shiftEngineRecords = (engineRoomRecords[targetShift] ?? []).filter((r) => !r.deletedAt);
      if (shiftEngineRecords.length > 0) {
        const latest = shiftEngineRecords[shiftEngineRecords.length - 1];
        parts.push(
          `【机舱参数】主机转速 ${latest.mainEngineSpeed} rpm，滑油压力 ${latest.lubricatingOilPressure} MPa，冷却水温 ${latest.coolingWaterTemp} ℃，燃油消耗 ${latest.fuelConsumption} L/h`
        );
      }

      const shiftBilgeRecords = (bilgeWaterRecords[targetShift] ?? []).filter((r) => !r.deletedAt);
      if (shiftBilgeRecords.length > 0) {
        const latest = shiftBilgeRecords[shiftBilgeRecords.length - 1];
        const levelTag = latest.liquidLevel >= 90 ? "⚠危险" : latest.liquidLevel >= 80 ? "⚠警戒" : "正常";
        parts.push(
          `【舱底水状态】液位 ${latest.liquidLevel}%（${levelTag}），泵状态：${latest.pumpStatus}，运行时长：${latest.pumpRunDuration} min，处理结果：${latest.treatmentResult}` +
          (latest.warningNote ? `，备注：${latest.warningNote}` : "")
        );
        const unfinishedBilge = shiftBilgeRecords.filter(
          (r) => isBilgeTreatmentUnfinished(r.treatmentResult) || r.liquidLevel >= 80
        );
        if (unfinishedBilge.length > 0) {
          const bilgeItems = unfinishedBilge.map(
            (r, i) => `${i + 1}. 液位 ${r.liquidLevel}%，泵${r.pumpStatus}，处理${r.treatmentResult}${r.warningNote ? "：" + r.warningNote : ""}`
          );
          parts.push(`【舱底水·需关注】\n${bilgeItems.join("\n")}`);
        }
      }

      const shiftAnomalies = (anomalyRecords[targetShift] ?? []).filter(
        (r) => !r.deletedAt && r.currentStatus !== "已关闭"
      );
      if (shiftAnomalies.length > 0) {
        const items = shiftAnomalies.map(
          (r) => `${r.device}（${r.currentStatus}）：${r.anomalyDescription}`
        );
        parts.push(`【异常巡检项·未关闭】\n${items.join("\n")}`);
      }

      const shiftRecords = (records[targetShift] ?? []).filter(
        (r) => !r.deletedAt && r.status && r.status !== "已解决" && r.status !== "正常巡检"
      );
      if (shiftRecords.length > 0) {
        const items = shiftRecords.map(
          (r) => `${r.device} - ${r.status}${r.anomaly ? "：" + r.anomaly : ""}`
        );
        parts.push(`【未完成处理】\n${items.join("\n")}`);
      }

      if (parts.length === 0) {
        parts.push("本班次运行正常，无异常事项需交接。");
      }

      return parts.join("\n\n");
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
