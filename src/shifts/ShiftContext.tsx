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
  SHIFTS,
  loadCurrentShiftId,
  saveCurrentShiftId,
  loadAllRecords,
  saveAllRecords,
  loadEngineRoomRecords,
  saveEngineRoomRecords,
  loadAnomalyRecords,
  saveAnomalyRecords,
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
}

const ShiftContext = createContext<ShiftContextValue | null>(null);

export function ShiftProvider({ children }: { children: ReactNode }) {
  const [currentShiftId, setCurrentShiftIdState] = useState(loadCurrentShiftId);
  const [records, setRecords] = useState<Record<string, WatchRecord[]>>(loadAllRecords);
  const [engineRoomRecords, setEngineRoomRecords] = useState<Record<string, EngineRoomRecord[]>>(loadEngineRoomRecords);
  const [anomalyRecords, setAnomalyRecords] = useState<Record<string, AnomalyRecord[]>>(loadAnomalyRecords);

  const currentShift = SHIFTS.find((s) => s.id === currentShiftId) ?? SHIFTS[0];

  const setCurrentShiftId = useCallback((id: string) => {
    if (SHIFTS.some((s) => s.id === id)) {
      setCurrentShiftIdState(id);
      saveCurrentShiftId(id);
    }
  }, []);

  const currentRecords = records[currentShiftId] ?? [];
  const currentEngineRoomRecords = engineRoomRecords[currentShiftId] ?? [];

  const allEngineRoomRecords = Object.values(engineRoomRecords).flat();
  const latestEngineRoomRecord = allEngineRoomRecords.length > 0
    ? allEngineRoomRecords.reduce((latest, record) =>
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
