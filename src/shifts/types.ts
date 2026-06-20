export interface Shift {
  id: string;
  label: string;
  startHour: number;
  endHour: number;
}

export interface WatchRecord {
  id: string;
  shiftId: string;
  device: string;
  params: string;
  anomaly: string;
  status: string;
  handoverNote: string;
  createdAt: string;
}

export const SHIFTS: Shift[] = [
  { id: "08-12", label: "08-12班", startHour: 8, endHour: 12 },
  { id: "12-16", label: "12-16班", startHour: 12, endHour: 16 },
  { id: "16-20", label: "16-20班", startHour: 16, endHour: 20 },
  { id: "20-24", label: "20-24班", startHour: 20, endHour: 24 },
  { id: "00-04", label: "00-04班", startHour: 0, endHour: 4 },
  { id: "04-08", label: "04-08班", startHour: 4, endHour: 8 },
];

export function getCurrentShiftId(): string {
  const hour = new Date().getHours();
  const match = SHIFTS.find((s) => hour >= s.startHour && hour < s.endHour);
  return match ? match.id : "08-12";
}

const STORAGE_KEY_SHIFT = "watch-current-shift";
const STORAGE_KEY_RECORDS = "watch-records";

export function loadCurrentShiftId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SHIFT);
    if (stored && SHIFTS.some((s) => s.id === stored)) return stored;
  } catch {}
  return getCurrentShiftId();
}

export function saveCurrentShiftId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_SHIFT, id);
  } catch {}
}

export function loadAllRecords(): Record<string, WatchRecord[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RECORDS);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function saveAllRecords(records: Record<string, WatchRecord[]>): void {
  try {
    localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(records));
  } catch {}
}
