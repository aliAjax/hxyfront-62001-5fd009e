import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import {
  type Shift,
  type WatchRecord,
  type EngineRoomRecord,
  type AnomalyRecord,
  type AnomalyStatus,
  type StatusUpdate,
  type HandoverSummary,
  type BilgeWaterRecord,
  type ExportData,
  type ImportStrategy,
  SHIFTS,
  loadCurrentShiftId,
  saveCurrentShiftId,
  loadAllRecords,
  saveAllRecords,
  loadEngineRoomRecords,
  saveEngineRoomRecords,
  loadAnomalyRecords,
  saveAnomalyRecords,
  loadHandoverSummaries,
  saveHandoverSummaries,
  getPreviousShiftId,
  loadBilgeWaterRecords,
  saveBilgeWaterRecords,
  createExportData,
  downloadExportFile,
  applyImport,
} from "./types";

interface ShiftContextValue {
  shifts: Shift[];
  currentShift: Shift;
  setCurrentShiftId: (id: string) => void;
  records: Record<string, WatchRecord[]>;
  currentRecords: WatchRecord[];
  addRecord: (record: Omit<WatchRecord, "id" | "shiftId" | "createdAt">) => void;
  removeRecord: (id: string) => void;
  engineRoomRecords: Record<string, EngineRoomRecord[]>;
  currentEngineRoomRecords: EngineRoomRecord[];
  latestEngineRoomRecord: EngineRoomRecord | null;
  addEngineRoomRecord: (record: Omit<EngineRoomRecord, "id" | "shiftId" | "createdAt">) => void;
  anomalyRecords: Record<string, AnomalyRecord[]>;
  allAnomalyRecords: AnomalyRecord[];
  addAnomalyRecord: (record: Omit<AnomalyRecord, "id" | "shiftId" | "createdAt" | "initialStatus" | "currentStatus" | "statusHistory" | "createdBy"> & { status: AnomalyStatus }) => void;
  updateAnomalyStatus: (recordId: string, newStatus: AnomalyStatus, note: string, operator: string) => void;
  bilgeWaterRecords: Record<string, BilgeWaterRecord[]>;
  currentBilgeWaterRecords: BilgeWaterRecord[];
  latestBilgeWaterRecord: BilgeWaterRecord | null;
  allBilgeWaterRecords: BilgeWaterRecord[];
  addBilgeWaterRecord: (record: Omit<BilgeWaterRecord, "id" | "shiftId" | "createdAt">) => void;
  handoverSummaries: Record<string, HandoverSummary>;
  currentHandoverSummary: HandoverSummary | null;
  previousShiftSummary: HandoverSummary | null;
  saveHandover: (manualNote: string, isDraft: boolean) => void;
  exportData: () => void;
  importData: (data: ExportData, strategy: ImportStrategy) => void;
  getAllData: () => ExportData;
}

const ShiftContext = createContext<ShiftContextValue | null>(null);

export function ShiftProvider({ children }: { children: ReactNode }) {
  const [currentShiftId, setCurrentShiftIdState] = useState(loadCurrentShiftId);
  const [records, setRecords] = useState<Record<string, WatchRecord[]>>(loadAllRecords);
  const [engineRoomRecords, setEngineRoomRecords] = useState<Record<string, EngineRoomRecord[]>>(loadEngineRoomRecords);
  const [anomalyRecords, setAnomalyRecords] = useState<Record<string, AnomalyRecord[]>>(loadAnomalyRecords);
  const [bilgeWaterRecords, setBilgeWaterRecords] = useState<Record<string, BilgeWaterRecord[]>>(loadBilgeWaterRecords);
  const [handoverSummaries, setHandoverSummaries] = useState<Record<string, HandoverSummary>>(loadHandoverSummaries);

  const currentShift = SHIFTS.find((s) => s.id === currentShiftId) ?? SHIFTS[0];

  const setCurrentShiftId = useCallback((id: string) => {
    if (SHIFTS.some((s) => s.id === id)) {
      setCurrentShiftIdState(id);
      saveCurrentShiftId(id);
    }
  }, []);

  const currentRecords = records[currentShiftId] ?? [];
  const currentEngineRoomRecords = engineRoomRecords[currentShiftId] ?? [];
  const currentBilgeWaterRecords = bilgeWaterRecords[currentShiftId] ?? [];

  const allEngineRoomRecords = Object.values(engineRoomRecords).flat();
  const latestEngineRoomRecord = allEngineRoomRecords.length > 0
    ? allEngineRoomRecords.reduce((latest, record) =>
        new Date(record.createdAt) > new Date(latest.createdAt) ? record : latest
      )
    : null;

  const allBilgeWaterRecords = Object.values(bilgeWaterRecords).flat();
  const latestBilgeWaterRecord = allBilgeWaterRecords.length > 0
    ? allBilgeWaterRecords.reduce((latest, record) =>
        new Date(record.createdAt) > new Date(latest.createdAt) ? record : latest
      )
    : null;

  const addRecord = useCallback(
    (input: Omit<WatchRecord, "id" | "shiftId" | "createdAt">) => {
      const newRecord: WatchRecord = {
        ...input,
        id: crypto.randomUUID(),
        shiftId: currentShiftId,
        createdAt: new Date().toISOString(),
      };
      setRecords((prev) => {
        const updated = {
          ...prev,
          [currentShiftId]: [...(prev[currentShiftId] ?? []), newRecord],
        };
        saveAllRecords(updated);
        return updated;
      });
    },
    [currentShiftId]
  );

  const removeRecord = useCallback(
    (id: string) => {
      setRecords((prev) => {
        const shiftRecords = (prev[currentShiftId] ?? []).filter((r) => r.id !== id);
        const updated = { ...prev, [currentShiftId]: shiftRecords };
        saveAllRecords(updated);
        return updated;
      });
    },
    [currentShiftId]
  );

  const addEngineRoomRecord = useCallback(
    (input: Omit<EngineRoomRecord, "id" | "shiftId" | "createdAt">) => {
      const newRecord: EngineRoomRecord = {
        ...input,
        id: crypto.randomUUID(),
        shiftId: currentShiftId,
        createdAt: new Date().toISOString(),
      };
      setEngineRoomRecords((prev) => {
        const updated = {
          ...prev,
          [currentShiftId]: [...(prev[currentShiftId] ?? []), newRecord],
        };
        saveEngineRoomRecords(updated);
        return updated;
      });
    },
    [currentShiftId]
  );

  const addBilgeWaterRecord = useCallback(
    (input: Omit<BilgeWaterRecord, "id" | "shiftId" | "createdAt">) => {
      const newRecord: BilgeWaterRecord = {
        ...input,
        id: crypto.randomUUID(),
        shiftId: currentShiftId,
        createdAt: new Date().toISOString(),
      };
      setBilgeWaterRecords((prev) => {
        const updated = {
          ...prev,
          [currentShiftId]: [...(prev[currentShiftId] ?? []), newRecord],
        };
        saveBilgeWaterRecords(updated);
        return updated;
      });
    },
    [currentShiftId]
  );

  const allAnomalyRecords = Object.values(anomalyRecords).flat();

  const addAnomalyRecord = useCallback(
    (input: Omit<AnomalyRecord, "id" | "shiftId" | "createdAt" | "initialStatus" | "currentStatus" | "statusHistory" | "createdBy"> & { status: AnomalyStatus }) => {
      const { status, ...rest } = input;
      const now = new Date().toISOString();
      const newRecord: AnomalyRecord = {
        ...rest,
        id: crypto.randomUUID(),
        shiftId: currentShiftId,
        createdAt: now,
        initialStatus: status,
        currentStatus: status,
        createdBy: currentShift.label,
        statusHistory: [],
      };
      setAnomalyRecords((prev) => {
        const updated = {
          ...prev,
          [currentShiftId]: [...(prev[currentShiftId] ?? []), newRecord],
        };
        saveAnomalyRecords(updated);
        return updated;
      });
    },
    [currentShiftId, currentShift.label]
  );

  const updateAnomalyStatus = useCallback(
    (recordId: string, newStatus: AnomalyStatus, note: string, operator: string) => {
      setAnomalyRecords((prev) => {
      const newRecords = { ...prev };
      for (const shiftId of Object.keys(newRecords)) {
        const idx = newRecords[shiftId].findIndex((r) => r.id === recordId);
        if (idx !== -1) {
          const statusUpdate: StatusUpdate = {
            id: crypto.randomUUID(),
            status: newStatus,
            note,
            updatedAt: new Date().toISOString(),
            updatedBy: operator,
          };
          const record = newRecords[shiftId][idx];
          newRecords[shiftId] = [
            ...newRecords[shiftId].slice(0, idx),
            {
              ...record,
              currentStatus: newStatus,
              statusHistory: [...record.statusHistory, statusUpdate],
            },
            ...newRecords[shiftId].slice(idx + 1),
          ];
          break;
        }
      }
      saveAnomalyRecords(newRecords);
      return newRecords;
    });
  }, []);

  const currentHandoverSummary = handoverSummaries[currentShiftId] ?? null;

  const previousShiftSummary = (() => {
    const prevId = getPreviousShiftId(currentShiftId);
    if (!prevId) return null;
    return handoverSummaries[prevId] ?? null;
  })();

  const generateAutoSummary = useCallback((): string => {
    const parts: string[] = [];

    const shiftRecords = engineRoomRecords[currentShiftId] ?? [];
    if (shiftRecords.length > 0) {
      const latest = shiftRecords[shiftRecords.length - 1];
      parts.push(
        `【机舱参数】主机转速 ${latest.mainEngineSpeed} rpm，滑油压力 ${latest.lubricatingOilPressure} MPa，冷却水温 ${latest.coolingWaterTemp} ℃，燃油消耗 ${latest.fuelConsumption} L/h`
      );
    }

    const shiftBilgeRecords = bilgeWaterRecords[currentShiftId] ?? [];
    if (shiftBilgeRecords.length > 0) {
      const latest = shiftBilgeRecords[shiftBilgeRecords.length - 1];
      const levelTag = latest.liquidLevel >= 90 ? "⚠危险" : latest.liquidLevel >= 80 ? "⚠警戒" : "正常";
      parts.push(
        `【舱底水状态】液位 ${latest.liquidLevel}%（${levelTag}），泵状态：${latest.pumpStatus}，运行时长：${latest.pumpRunDuration} min，处理结果：${latest.treatmentResult}` +
        (latest.warningNote ? `，备注：${latest.warningNote}` : "")
      );
      const unfinishedBilge = shiftBilgeRecords.filter(
        (r) => r.treatmentResult === "未处理" || r.treatmentResult === "处理中" || r.treatmentResult === "待分离" || r.treatmentResult === "异常" || r.liquidLevel >= 80
      );
      if (unfinishedBilge.length > 0) {
        const bilgeItems = unfinishedBilge.map(
          (r, i) => `${i + 1}. 液位 ${r.liquidLevel}%，泵${r.pumpStatus}，处理${r.treatmentResult}${r.warningNote ? "：" + r.warningNote : ""}`
        );
        parts.push(`【舱底水·需关注】\n${bilgeItems.join("\n")}`);
      }
    }

    const shiftAnomalies = (anomalyRecords[currentShiftId] ?? []).filter(
      (r) => r.currentStatus !== "已关闭"
    );
    if (shiftAnomalies.length > 0) {
      const items = shiftAnomalies.map(
        (r) => `${r.device}（${r.currentStatus}）：${r.anomalyDescription}`
      );
      parts.push(`【异常巡检项·未关闭】\n${items.join("\n")}`);
    }

    const unfinishedRecords = (records[currentShiftId] ?? []).filter(
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
  }, [currentShiftId, engineRoomRecords, bilgeWaterRecords, anomalyRecords, records]);

  const saveHandover = useCallback(
    (manualNote: string, isDraft: boolean) => {
      const autoSummary = generateAutoSummary();
      const now = new Date().toISOString();
      const existing = handoverSummaries[currentShiftId];
      const summary: HandoverSummary = {
        id: existing?.id ?? crypto.randomUUID(),
        shiftId: currentShiftId,
        autoSummary,
        manualNote,
        isDraft,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      setHandoverSummaries((prev) => {
        const updated = { ...prev, [currentShiftId]: summary };
        saveHandoverSummaries(updated);
        return updated;
      });
    },
    [currentShiftId, generateAutoSummary, handoverSummaries]
  );

  const getAllData = useCallback((): ExportData => {
    return createExportData(
      records,
      engineRoomRecords,
      anomalyRecords,
      bilgeWaterRecords,
      handoverSummaries
    );
  }, [records, engineRoomRecords, anomalyRecords, bilgeWaterRecords, handoverSummaries]);

  const exportData = useCallback(() => {
    const data = getAllData();
    downloadExportFile(data);
  }, [getAllData]);

  const importData = useCallback(
    (data: ExportData, strategy: ImportStrategy) => {
      const result = applyImport(
        data,
        strategy,
        records,
        engineRoomRecords,
        anomalyRecords,
        bilgeWaterRecords,
        handoverSummaries
      );
      setRecords(result.records);
      saveAllRecords(result.records);
      setEngineRoomRecords(result.engineRoomRecords);
      saveEngineRoomRecords(result.engineRoomRecords);
      setAnomalyRecords(result.anomalyRecords);
      saveAnomalyRecords(result.anomalyRecords);
      setBilgeWaterRecords(result.bilgeWaterRecords);
      saveBilgeWaterRecords(result.bilgeWaterRecords);
      setHandoverSummaries(result.handoverSummaries);
      saveHandoverSummaries(result.handoverSummaries);
    },
    [records, engineRoomRecords, anomalyRecords, bilgeWaterRecords, handoverSummaries]
  );

  useEffect(() => {
    saveCurrentShiftId(currentShiftId);
  }, [currentShiftId]);

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
        engineRoomRecords,
        currentEngineRoomRecords,
        latestEngineRoomRecord,
        addEngineRoomRecord,
        anomalyRecords,
        allAnomalyRecords,
        addAnomalyRecord,
        updateAnomalyStatus,
        bilgeWaterRecords,
        currentBilgeWaterRecords,
        latestBilgeWaterRecord,
        allBilgeWaterRecords,
        addBilgeWaterRecord,
        handoverSummaries,
        currentHandoverSummary,
        previousShiftSummary,
        saveHandover,
        exportData,
        importData,
        getAllData,
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
