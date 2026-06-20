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
  SHIFTS,
  loadCurrentShiftId,
  saveCurrentShiftId,
  loadAllRecords,
  saveAllRecords,
  loadEngineRoomRecords,
  saveEngineRoomRecords,
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
}

const ShiftContext = createContext<ShiftContextValue | null>(null);

export function ShiftProvider({ children }: { children: ReactNode }) {
  const [currentShiftId, setCurrentShiftIdState] = useState(loadCurrentShiftId);
  const [records, setRecords] = useState<Record<string, WatchRecord[]>>(loadAllRecords);
  const [engineRoomRecords, setEngineRoomRecords] = useState<Record<string, EngineRoomRecord[]>>(loadEngineRoomRecords);

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
