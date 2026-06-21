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
const STORAGE_KEY_ENGINE_ROOM = "engine-room-records";

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

export interface EngineRoomRecord {
  id: string;
  shiftId: string;
  mainEngineSpeed: number;
  lubricatingOilPressure: number;
  coolingWaterTemp: number;
  fuelConsumption: number;
  createdAt: string;
}

export function loadEngineRoomRecords(): Record<string, EngineRoomRecord[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ENGINE_ROOM);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function saveEngineRoomRecords(records: Record<string, EngineRoomRecord[]>): void {
  try {
    localStorage.setItem(STORAGE_KEY_ENGINE_ROOM, JSON.stringify(records));
  } catch {}
}

export type AnomalyStatus = "待处理" | "处理中" | "已处理" | "需复查" | "已关闭";

export interface StatusUpdate {
  id: string;
  status: AnomalyStatus;
  note: string;
  updatedAt: string;
  updatedBy: string;
}

export interface AnomalyRecord {
  id: string;
  shiftId: string;
  device: string;
  anomalyDescription: string;
  initialStatus: AnomalyStatus;
  currentStatus: AnomalyStatus;
  reviewTime: string;
  handoverNote: string;
  createdAt: string;
  createdBy: string;
  statusHistory: StatusUpdate[];
}

const STORAGE_KEY_ANOMALIES = "anomaly-inspection-records";

export function loadAnomalyRecords(): Record<string, AnomalyRecord[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ANOMALIES);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function saveAnomalyRecords(records: Record<string, AnomalyRecord[]>): void {
  try {
    localStorage.setItem(STORAGE_KEY_ANOMALIES, JSON.stringify(records));
  } catch {}
}

export const ANOMALY_STATUS_OPTIONS: AnomalyStatus[] = [
  "待处理",
  "处理中",
  "已处理",
  "需复查",
  "已关闭",
];

export interface HandoverSummary {
  id: string;
  shiftId: string;
  autoSummary: string;
  manualNote: string;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY_HANDOVER = "handover-summaries";

export function loadHandoverSummaries(): Record<string, HandoverSummary> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HANDOVER);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function saveHandoverSummaries(summaries: Record<string, HandoverSummary>): void {
  try {
    localStorage.setItem(STORAGE_KEY_HANDOVER, JSON.stringify(summaries));
  } catch {}
}

export function getPreviousShiftId(currentShiftId: string): string | null {
  const idx = SHIFTS.findIndex((s) => s.id === currentShiftId);
  if (idx === -1) return null;
  const prevIdx = (idx - 1 + SHIFTS.length) % SHIFTS.length;
  return SHIFTS[prevIdx].id;
}

export function getStatusClass(status: AnomalyStatus): string {
  switch (status) {
    case "待处理":
      return "status-pending";
    case "处理中":
      return "status-processing";
    case "已处理":
      return "status-resolved";
    case "需复查":
      return "status-review";
    case "已关闭":
      return "status-closed";
    default:
      return "status-default";
  }
}

export type BilgePumpStatus = "未运行" | "运行中" | "故障";
export type BilgeTreatmentResult = "未处理" | "处理中" | "达标排放" | "待分离" | "异常";

export interface BilgeWaterRecord {
  id: string;
  shiftId: string;
  liquidLevel: number;
  pumpStatus: BilgePumpStatus;
  pumpRunDuration: number;
  treatmentResult: BilgeTreatmentResult;
  warningNote: string;
  createdAt: string;
}

export const BILGE_WARNING_LEVEL = 80;
export const BILGE_DANGER_LEVEL = 90;

export const BILGE_PUMP_STATUS_OPTIONS: BilgePumpStatus[] = ["未运行", "运行中", "故障"];
export const BILGE_TREATMENT_OPTIONS: BilgeTreatmentResult[] = ["未处理", "处理中", "达标排放", "待分离", "异常"];

const STORAGE_KEY_BILGE = "bilge-water-records";

export function loadBilgeWaterRecords(): Record<string, BilgeWaterRecord[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BILGE);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function saveBilgeWaterRecords(records: Record<string, BilgeWaterRecord[]>): void {
  try {
    localStorage.setItem(STORAGE_KEY_BILGE, JSON.stringify(records));
  } catch {}
}

export function getBilgeLevelStatus(level: number): "normal" | "warning" | "danger" {
  if (level >= BILGE_DANGER_LEVEL) return "danger";
  if (level >= BILGE_WARNING_LEVEL) return "warning";
  return "normal";
}

export function isBilgeTreatmentUnfinished(result: BilgeTreatmentResult): boolean {
  return result === "未处理" || result === "处理中" || result === "待分离" || result === "异常";
}
