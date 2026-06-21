export const SCHEMA_VERSION = "2.0.0";

export interface DataMeta {
  schemaVersion: string;
  migratedAt?: string;
}

export interface WithAudit {
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface WithVessel {
  vesselId?: string | null;
  fleetId?: string | null;
}

export interface WithSoftDelete {
  deletedAt?: string | null;
}

export interface WithIdempotency {
  idempotencyKey: string;
}

export interface Shift {
  id: string;
  label: string;
  startHour: number;
  endHour: number;
}

export const SHIFTS: Shift[] = [
  { id: "08-12", label: "08-12班", startHour: 8, endHour: 12 },
  { id: "12-16", label: "12-16班", startHour: 12, endHour: 16 },
  { id: "16-20", label: "16-20班", startHour: 16, endHour: 20 },
  { id: "20-24", label: "20-24班", startHour: 20, endHour: 24 },
  { id: "00-04", label: "00-04班", startHour: 0, endHour: 4 },
  { id: "04-08", label: "04-08班", startHour: 4, endHour: 8 },
];

export interface WatchRecord extends WithAudit, WithVessel, WithSoftDelete, WithIdempotency {
  id: string;
  shiftId: string;
  device: string;
  params: string;
  anomaly: string;
  status: string;
  handoverNote: string;
  isEdited?: boolean;
  editedAt?: string | null;
  editedBy?: string | null;
  editHistory?: Array<{
    editedAt: string;
    editedBy: string;
    changes: Partial<Pick<WatchRecord, "device" | "params" | "anomaly" | "status" | "handoverNote">>;
  }>;
}

export interface EngineRoomRecord extends WithAudit, WithVessel, WithSoftDelete, WithIdempotency {
  id: string;
  shiftId: string;
  mainEngineSpeed: number;
  lubricatingOilPressure: number;
  coolingWaterTemp: number;
  fuelConsumption: number;
  isEdited?: boolean;
  editedAt?: string | null;
  editedBy?: string | null;
  editHistory?: Array<{
    editedAt: string;
    editedBy: string;
    changes: Partial<Pick<EngineRoomRecord, "mainEngineSpeed" | "lubricatingOilPressure" | "coolingWaterTemp" | "fuelConsumption">>;
  }>;
}

export type BilgePumpStatus = "未运行" | "运行中" | "故障";
export type BilgeTreatmentResult = "未处理" | "处理中" | "达标排放" | "待分离" | "异常";

export const BILGE_WARNING_LEVEL = 80;
export const BILGE_DANGER_LEVEL = 90;

export const BILGE_PUMP_STATUS_OPTIONS: BilgePumpStatus[] = ["未运行", "运行中", "故障"];
export const BILGE_TREATMENT_OPTIONS: BilgeTreatmentResult[] = ["未处理", "处理中", "达标排放", "待分离", "异常"];

export interface BilgeWaterRecord extends WithAudit, WithVessel, WithSoftDelete, WithIdempotency {
  id: string;
  shiftId: string;
  liquidLevel: number;
  pumpStatus: BilgePumpStatus;
  pumpRunDuration: number;
  treatmentResult: BilgeTreatmentResult;
  warningNote: string;
  isEdited?: boolean;
  editedAt?: string | null;
  editedBy?: string | null;
  editHistory?: Array<{
    editedAt: string;
    editedBy: string;
    changes: Partial<Pick<BilgeWaterRecord, "liquidLevel" | "pumpStatus" | "pumpRunDuration" | "treatmentResult" | "warningNote">>;
  }>;
}

export type AnomalyStatus = "待处理" | "处理中" | "已处理" | "需复查" | "已关闭";

export const ANOMALY_STATUS_OPTIONS: AnomalyStatus[] = [
  "待处理",
  "处理中",
  "已处理",
  "需复查",
  "已关闭",
];

export interface StatusUpdate extends WithAudit, WithVessel, WithSoftDelete {
  id: string;
  status: AnomalyStatus;
  note: string;
}

export interface AnomalyRecord extends WithAudit, WithVessel, WithSoftDelete, WithIdempotency {
  id: string;
  shiftId: string;
  device: string;
  anomalyDescription: string;
  initialStatus: AnomalyStatus;
  currentStatus: AnomalyStatus;
  reviewTime: string;
  handoverNote: string;
  statusHistory: StatusUpdate[];
  carryOverFromShiftId?: string | null;
  isCarriedOver?: boolean;
}

export interface HandoverSummary extends WithAudit, WithVessel, WithSoftDelete {
  id: string;
  shiftId: string;
  autoSummary: string;
  manualNote: string;
  isDraft: boolean;
  dataHash?: string;
  lastSyncAt?: string | null;
}

export interface ExportData {
  version: string;
  schemaVersion: string;
  exportedAt: string;
  records: Record<string, WatchRecord[]>;
  engineRoomRecords: Record<string, EngineRoomRecord[]>;
  anomalyRecords: Record<string, AnomalyRecord[]>;
  bilgeWaterRecords: Record<string, BilgeWaterRecord[]>;
  handoverSummaries: Record<string, HandoverSummary>;
  meta?: DataMeta;
}

export const EXPORT_VERSION = "2.0.0";

export type ImportStrategy = "merge" | "overwrite";

export interface ImportConflict {
  type: "records" | "engineRoomRecords" | "anomalyRecords" | "bilgeWaterRecords" | "handoverSummaries";
  shiftId: string;
  existingCount: number;
  importedCount: number;
}

export interface ImportPreview {
  valid: boolean;
  data: ExportData | null;
  errors: string[];
  stats: {
    totalRecords: number;
    totalEngineRoomRecords: number;
    totalAnomalyRecords: number;
    totalBilgeWaterRecords: number;
    totalHandoverSummaries: number;
    shifts: string[];
  };
  conflicts: ImportConflict[];
}

export type DeviceCategory = "主机" | "发电机" | "泵组" | "舱底水";

export const DEVICE_CATEGORIES: DeviceCategory[] = ["主机", "发电机", "泵组", "舱底水"];

export const CATEGORY_KEYWORDS: Record<DeviceCategory, string[]> = {
  主机: ["主机", "主柴油", "主推进", "main engine"],
  发电机: ["发电机", "发电", "柴油发电", "generator"],
  泵组: ["泵", "泵组", "水泵", "油泵", "pump"],
  舱底水: ["舱底", "舱底水", "压载", "bilge"],
};

export function matchCategory(device: string, category: DeviceCategory): boolean {
  const name = device.toLowerCase();
  return CATEGORY_KEYWORDS[category].some((kw) => name.includes(kw.toLowerCase()));
}

export function getCategoryByDevice(device: string): DeviceCategory | null {
  for (const cat of DEVICE_CATEGORIES) {
    if (matchCategory(device, cat)) return cat;
  }
  return null;
}

export function getCurrentShiftId(): string {
  const hour = new Date().getHours();
  const match = SHIFTS.find((s) => hour >= s.startHour && hour < s.endHour);
  return match ? match.id : "08-12";
}

export function getPreviousShiftId(currentShiftId: string): string | null {
  const idx = SHIFTS.findIndex((s) => s.id === currentShiftId);
  if (idx === -1) return null;
  const prevIdx = (idx - 1 + SHIFTS.length) % SHIFTS.length;
  return SHIFTS[prevIdx].id;
}

export function getNextShiftId(currentShiftId: string): string | null {
  const idx = SHIFTS.findIndex((s) => s.id === currentShiftId);
  if (idx === -1) return null;
  const nextIdx = (idx + 1) % SHIFTS.length;
  return SHIFTS[nextIdx].id;
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

export function getBilgeLevelStatus(level: number): "normal" | "warning" | "danger" {
  if (level >= BILGE_DANGER_LEVEL) return "danger";
  if (level >= BILGE_WARNING_LEVEL) return "warning";
  return "normal";
}

export function isBilgeTreatmentUnfinished(result: BilgeTreatmentResult): boolean {
  return result === "未处理" || result === "处理中" || result === "待分离" || result === "异常";
}

export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function computeDataHash(obj: unknown): string {
  const jsonStr = JSON.stringify(obj);
  let hash = 0;
  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `${hash.toString(16)}-${jsonStr.length}`;
}

const STORAGE_KEY_SHIFT = "watch-current-shift";
const STORAGE_KEY_RECORDS = "watch-records";
const STORAGE_KEY_ENGINE_ROOM = "engine-room-records";
const STORAGE_KEY_ANOMALIES = "anomaly-inspection-records";
const STORAGE_KEY_HANDOVER = "handover-summaries";
const STORAGE_KEY_BILGE = "bilge-water-records";

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

export function createExportData(
  records: Record<string, WatchRecord[]>,
  engineRoomRecords: Record<string, EngineRoomRecord[]>,
  anomalyRecords: Record<string, AnomalyRecord[]>,
  bilgeWaterRecords: Record<string, BilgeWaterRecord[]>,
  handoverSummaries: Record<string, HandoverSummary>
): ExportData {
  return {
    version: EXPORT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    records,
    engineRoomRecords,
    anomalyRecords,
    bilgeWaterRecords,
    handoverSummaries,
    meta: {
      schemaVersion: SCHEMA_VERSION,
    },
  };
}

export function downloadExportFile(data: ExportData): void {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `watch-records-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function validateAndParseImportFile(text: string): ImportPreview {
  const errors: string[] = [];
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return {
      valid: false,
      data: null,
      errors: ["文件格式错误，不是有效的 JSON 文件"],
      stats: {
        totalRecords: 0,
        totalEngineRoomRecords: 0,
        totalAnomalyRecords: 0,
        totalBilgeWaterRecords: 0,
        totalHandoverSummaries: 0,
        shifts: [],
      },
      conflicts: [],
    };
  }

  const data = parsed as Partial<ExportData>;

  if (!data || typeof data !== "object") {
    errors.push("文件内容格式不正确");
  } else {
    if (!data.version) {
      errors.push("缺少版本号字段");
    }
    if (!data.exportedAt) {
      errors.push("缺少导出时间字段");
    }
    if (!data.records || typeof data.records !== "object") {
      errors.push("缺少或格式错误的值班记录数据");
    }
    if (!data.engineRoomRecords || typeof data.engineRoomRecords !== "object") {
      errors.push("缺少或格式错误的机舱参数记录数据");
    }
    if (!data.anomalyRecords || typeof data.anomalyRecords !== "object") {
      errors.push("缺少或格式错误的异常记录数据");
    }
    if (!data.bilgeWaterRecords || typeof data.bilgeWaterRecords !== "object") {
      errors.push("缺少或格式错误的舱底水记录数据");
    }
    if (!data.handoverSummaries || typeof data.handoverSummaries !== "object") {
      errors.push("缺少或格式错误的交接摘要数据");
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      data: null,
      errors,
      stats: {
        totalRecords: 0,
        totalEngineRoomRecords: 0,
        totalAnomalyRecords: 0,
        totalBilgeWaterRecords: 0,
        totalHandoverSummaries: 0,
        shifts: [],
      },
      conflicts: [],
    };
  }

  const validData = data as ExportData;

  const allShiftIds = new Set<string>();
  const collectShifts = (obj: Record<string, unknown>) => {
    Object.keys(obj).forEach((k) => allShiftIds.add(k));
  };
  collectShifts(validData.records);
  collectShifts(validData.engineRoomRecords);
  collectShifts(validData.anomalyRecords);
  collectShifts(validData.bilgeWaterRecords);
  collectShifts(validData.handoverSummaries);

  const sumRecords = (obj: Record<string, unknown[]>) =>
    Object.values(obj).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);

  return {
    valid: true,
    data: validData,
    errors: [],
    stats: {
      totalRecords: sumRecords(validData.records as Record<string, unknown[]>),
      totalEngineRoomRecords: sumRecords(validData.engineRoomRecords as Record<string, unknown[]>),
      totalAnomalyRecords: sumRecords(validData.anomalyRecords as Record<string, unknown[]>),
      totalBilgeWaterRecords: sumRecords(validData.bilgeWaterRecords as Record<string, unknown[]>),
      totalHandoverSummaries: Object.keys(validData.handoverSummaries).length,
      shifts: Array.from(allShiftIds),
    },
    conflicts: [],
  };
}

export function detectConflicts(
  importData: ExportData,
  existingRecords: Record<string, WatchRecord[]>,
  existingEngineRoom: Record<string, EngineRoomRecord[]>,
  existingAnomalies: Record<string, AnomalyRecord[]>,
  existingBilge: Record<string, BilgeWaterRecord[]>,
  existingHandover: Record<string, HandoverSummary>
): ImportConflict[] {
  const conflicts: ImportConflict[] = [];

  const checkArrayConflict = (
    type: ImportConflict["type"],
    imported: Record<string, unknown[]>,
    existing: Record<string, unknown[]>
  ) => {
    Object.keys(imported).forEach((shiftId) => {
      const importedCount = imported[shiftId]?.length ?? 0;
      const existingCount = existing[shiftId]?.length ?? 0;
      if (importedCount > 0 && existingCount > 0) {
        conflicts.push({ type, shiftId, existingCount, importedCount });
      }
    });
  };

  checkArrayConflict("records", importData.records as Record<string, unknown[]>, existingRecords as Record<string, unknown[]>);
  checkArrayConflict("engineRoomRecords", importData.engineRoomRecords as Record<string, unknown[]>, existingEngineRoom as Record<string, unknown[]>);
  checkArrayConflict("anomalyRecords", importData.anomalyRecords as Record<string, unknown[]>, existingAnomalies as Record<string, unknown[]>);
  checkArrayConflict("bilgeWaterRecords", importData.bilgeWaterRecords as Record<string, unknown[]>, existingBilge as Record<string, unknown[]>);

  Object.keys(importData.handoverSummaries).forEach((shiftId) => {
    if (existingHandover[shiftId]) {
      conflicts.push({ type: "handoverSummaries", shiftId, existingCount: 1, importedCount: 1 });
    }
  });

  return conflicts;
}

export function applyImport(
  importData: ExportData,
  strategy: ImportStrategy,
  existingRecords: Record<string, WatchRecord[]>,
  existingEngineRoom: Record<string, EngineRoomRecord[]>,
  existingAnomalies: Record<string, AnomalyRecord[]>,
  existingBilge: Record<string, BilgeWaterRecord[]>,
  existingHandover: Record<string, HandoverSummary>
): {
  records: Record<string, WatchRecord[]>;
  engineRoomRecords: Record<string, EngineRoomRecord[]>;
  anomalyRecords: Record<string, AnomalyRecord[]>;
  bilgeWaterRecords: Record<string, BilgeWaterRecord[]>;
  handoverSummaries: Record<string, HandoverSummary>;
} {
  const mergeArrayMap = <T>(
    imported: Record<string, T[]>,
    existing: Record<string, T[]>
  ): Record<string, T[]> => {
    const result: Record<string, T[]> = { ...existing };
    Object.keys(imported).forEach((shiftId) => {
      if (strategy === "overwrite") {
        result[shiftId] = [...imported[shiftId]];
      } else {
        const existingIds = new Set((existing[shiftId] ?? []).map((r) => (r as { id: string }).id));
        const newItems = imported[shiftId].filter((item) => !existingIds.has((item as { id: string }).id));
        result[shiftId] = [...(existing[shiftId] ?? []), ...newItems];
      }
    });
    return result;
  };

  const mergeObjectMap = <T>(
    imported: Record<string, T>,
    existing: Record<string, T>
  ): Record<string, T> => {
    if (strategy === "overwrite") {
      return { ...existing, ...imported };
    }
    const result: Record<string, T> = { ...existing };
    Object.keys(imported).forEach((key) => {
      if (!result[key]) {
        result[key] = imported[key];
      }
    });
    return result;
  };

  return {
    records: mergeArrayMap(importData.records, existingRecords),
    engineRoomRecords: mergeArrayMap(importData.engineRoomRecords, existingEngineRoom),
    anomalyRecords: mergeArrayMap(importData.anomalyRecords, existingAnomalies),
    bilgeWaterRecords: mergeArrayMap(importData.bilgeWaterRecords, existingBilge),
    handoverSummaries: mergeObjectMap(importData.handoverSummaries, existingHandover),
  };
}
