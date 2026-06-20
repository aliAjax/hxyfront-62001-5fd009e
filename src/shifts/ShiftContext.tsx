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
  SHIFTS,
  loadCurrentShiftId,
  saveCurrentShiftId,
  loadAllRecords,
  saveAllRecords,
} from "./types";

interface ShiftContextValue {
  shifts: Shift[];
  currentShift: Shift;
  setCurrentShiftId: (id: string) => void;
  records: Record<string, WatchRecord[]>;
  currentRecords: WatchRecord[];
  addRecord: (record: Omit<WatchRecord, "id" | "shiftId" | "createdAt">) => void;
  removeRecord: (id: string) => void;
}

const ShiftContext = createContext<ShiftContextValue | null>(null);

export function ShiftProvider({ children }: { children: ReactNode }) {
  const [currentShiftId, setCurrentShiftIdState] = useState(loadCurrentShiftId);
  const [records, setRecords] = useState<Record<string, WatchRecord[]>>(loadAllRecords);

  const currentShift = SHIFTS.find((s) => s.id === currentShiftId) ?? SHIFTS[0];

  const setCurrentShiftId = useCallback((id: string) => {
    if (SHIFTS.some((s) => s.id === id)) {
      setCurrentShiftIdState(id);
      saveCurrentShiftId(id);
    }
  }, []);

  const currentRecords = records[currentShiftId] ?? [];

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
