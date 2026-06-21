export const SCHEMA_VERSION = "3.0.0";

export type RiskLevel = "safe" | "low" | "medium" | "high" | "critical";

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  safe: "安全",
  low: "低风险",
  medium: "中风险",
  high: "高风险",
  critical: "严重",
};

export const RISK_LEVEL_SCORES: Record<RiskLevel, number> = {
  safe: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const RISK_LEVEL_ORDER: RiskLevel[] = ["safe", "low", "medium", "high", "critical"];

export type RiskTriggerType =
  | "engine_speed"
  | "lubricating_oil"
  | "cooling_water"
  | "fuel_consumption"
  | "bilge_water"
  | "anomaly_pending"
  | "anomaly_count";

export interface RiskTrigger {
  type: RiskTriggerType;
  level: RiskLevel;
  title: string;
  description: string;
  value?: string;
  threshold?: string;
  linkedAnomalyIds?: string[];
  linkedRecordIds?: string[];
  timestamp?: string;
}

export interface RiskTimelineEvent {
  id: string;
  timestamp: string;
  type: "anomaly" | "engine" | "bilge" | "assessment";
  level: RiskLevel;
  title: string;
  description: string;
  linkedRecordId?: string;
}

export interface RiskAssessment extends WithAudit, WithVessel, WithSoftDelete {
  id: string;
  shiftId: string;
  overallLevel: RiskLevel;
  score: number;
  triggers: RiskTrigger[];
  timeline: RiskTimelineEvent[];
  handoverRecommendation: string;
  dataSnapshot?: {
    engineRoomRecordId?: string;
    bilgeWaterRecordId?: string;
    anomalyIds: string[];
  };
  calculatedAt: string;
  schemaVersion: string;
}

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
  shiftId: string;
}

export interface HandoverStep {
  id: string;
  fromShiftId: string;
  toShiftId: string;
  handedAt: string;
  handedBy: string;
  note?: string;
}

export interface AnomalyRecord extends WithAudit, WithVessel, WithSoftDelete, WithIdempotency {
  id: string;
  shiftId: string;
  originShiftId: string;
  device: string;
  anomalyDescription: string;
  initialStatus: AnomalyStatus;
  currentStatus: AnomalyStatus;
  reviewTime: string;
  handoverNote: string;
  statusHistory: StatusUpdate[];
  handoverPath: HandoverStep[];
  closedAtShiftId?: string | null;
  closedAt?: string | null;
  closedBy?: string | null;
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
  riskAssessments?: Record<string, RiskAssessment[]>;
  meta?: DataMeta;
}

export const EXPORT_VERSION = "2.0.0";

export type ImportStrategy = "merge" | "overwrite";

export interface ImportConflict {
  type: "records" | "engineRoomRecords" | "anomalyRecords" | "bilgeWaterRecords" | "handoverSummaries" | "riskAssessments";
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
    totalRiskAssessments: number;
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
const STORAGE_KEY_RISK = "risk-assessments";

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

export function loadRiskAssessments(): Record<string, RiskAssessment[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RISK);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function saveRiskAssessments(assessments: Record<string, RiskAssessment[]>): void {
  try {
    localStorage.setItem(STORAGE_KEY_RISK, JSON.stringify(assessments));
  } catch {}
}

export interface EngineThresholds {
  speed: { warning: [number, number]; danger: [number, number] };
  oilPressure: { warning: [number, number]; danger: [number, number] };
  coolingTemp: { warning: [number, number]; danger: [number, number] };
  fuelConsumption: { warning: [number, number]; danger: [number, number] };
}

export const ENGINE_THRESHOLDS: EngineThresholds = {
  speed: { warning: [600, 950], danger: [500, 1050] },
  oilPressure: { warning: [0.35, 0.6], danger: [0.25, 0.7] },
  coolingTemp: { warning: [70, 85], danger: [60, 92] },
  fuelConsumption: { warning: [15, 35], danger: [10, 45] },
};

export const ANOMALY_COUNT_THRESHOLDS = {
  medium: 2,
  high: 4,
  critical: 6,
};

function checkRange(value: number, range: [number, number]): boolean {
  return value < range[0] || value > range[1];
}

export function evaluateEngineRoomRecord(
  record: EngineRoomRecord | null
): RiskTrigger[] {
  if (!record) return [];
  const triggers: RiskTrigger[] = [];
  const { mainEngineSpeed, lubricatingOilPressure, coolingWaterTemp, fuelConsumption } = record;

  if (checkRange(mainEngineSpeed, ENGINE_THRESHOLDS.speed.danger)) {
    triggers.push({
      type: "engine_speed",
      level: "critical",
      title: "主机转速严重异常",
      description: `转速 ${mainEngineSpeed} rpm 超出正常运行范围，可能存在机械故障或调速系统异常`,
      value: `${mainEngineSpeed} rpm`,
      threshold: `${ENGINE_THRESHOLDS.speed.danger[0]}-${ENGINE_THRESHOLDS.speed.danger[1]} rpm`,
      timestamp: record.createdAt,
      linkedRecordIds: [record.id],
    });
  } else if (checkRange(mainEngineSpeed, ENGINE_THRESHOLDS.speed.warning)) {
    triggers.push({
      type: "engine_speed",
      level: "medium",
      title: "主机转速偏离预警",
      description: `转速 ${mainEngineSpeed} rpm 偏离正常范围，建议密切关注趋势变化`,
      value: `${mainEngineSpeed} rpm`,
      threshold: `${ENGINE_THRESHOLDS.speed.warning[0]}-${ENGINE_THRESHOLDS.speed.warning[1]} rpm`,
      timestamp: record.createdAt,
      linkedRecordIds: [record.id],
    });
  }

  if (checkRange(lubricatingOilPressure, ENGINE_THRESHOLDS.oilPressure.danger)) {
    triggers.push({
      type: "lubricating_oil",
      level: "critical",
      title: "滑油压力严重异常",
      description: `滑油压力 ${lubricatingOilPressure} MPa 超出安全范围，润滑失效风险高，应立即停机检查`,
      value: `${lubricatingOilPressure} MPa`,
      threshold: `${ENGINE_THRESHOLDS.oilPressure.danger[0]}-${ENGINE_THRESHOLDS.oilPressure.danger[1]} MPa`,
      timestamp: record.createdAt,
      linkedRecordIds: [record.id],
    });
  } else if (checkRange(lubricatingOilPressure, ENGINE_THRESHOLDS.oilPressure.warning)) {
    triggers.push({
      type: "lubricating_oil",
      level: "high",
      title: "滑油压力异常",
      description: `滑油压力 ${lubricatingOilPressure} MPa 偏离标准值，可能存在泄漏或泵组异常`,
      value: `${lubricatingOilPressure} MPa`,
      threshold: `${ENGINE_THRESHOLDS.oilPressure.warning[0]}-${ENGINE_THRESHOLDS.oilPressure.warning[1]} MPa`,
      timestamp: record.createdAt,
      linkedRecordIds: [record.id],
    });
  }

  if (checkRange(coolingWaterTemp, ENGINE_THRESHOLDS.coolingTemp.danger)) {
    triggers.push({
      type: "cooling_water",
      level: "critical",
      title: "冷却水温严重异常",
      description: `冷却水温 ${coolingWaterTemp} ℃ 超出安全范围，存在过热拉缸风险，需立即降速或停机`,
      value: `${coolingWaterTemp} ℃`,
      threshold: `${ENGINE_THRESHOLDS.coolingTemp.danger[0]}-${ENGINE_THRESHOLDS.coolingTemp.danger[1]} ℃`,
      timestamp: record.createdAt,
      linkedRecordIds: [record.id],
    });
  } else if (checkRange(coolingWaterTemp, ENGINE_THRESHOLDS.coolingTemp.warning)) {
    triggers.push({
      type: "cooling_water",
      level: "high",
      title: "冷却水温异常",
      description: `冷却水温 ${coolingWaterTemp} ℃ 偏高，冷却系统效率下降，需检查水泵和散热器`,
      value: `${coolingWaterTemp} ℃`,
      threshold: `${ENGINE_THRESHOLDS.coolingTemp.warning[0]}-${ENGINE_THRESHOLDS.coolingTemp.warning[1]} ℃`,
      timestamp: record.createdAt,
      linkedRecordIds: [record.id],
    });
  }

  if (checkRange(fuelConsumption, ENGINE_THRESHOLDS.fuelConsumption.danger)) {
    triggers.push({
      type: "fuel_consumption",
      level: "high",
      title: "燃油消耗严重异常",
      description: `燃油消耗 ${fuelConsumption} L/h 大幅偏离标准，可能存在泄漏或燃烧不充分`,
      value: `${fuelConsumption} L/h`,
      threshold: `${ENGINE_THRESHOLDS.fuelConsumption.danger[0]}-${ENGINE_THRESHOLDS.fuelConsumption.danger[1]} L/h`,
      timestamp: record.createdAt,
      linkedRecordIds: [record.id],
    });
  } else if (checkRange(fuelConsumption, ENGINE_THRESHOLDS.fuelConsumption.warning)) {
    triggers.push({
      type: "fuel_consumption",
      level: "low",
      title: "燃油消耗偏离",
      description: `燃油消耗 ${fuelConsumption} L/h 偏离标准范围，建议检查喷油系统和负载状态`,
      value: `${fuelConsumption} L/h`,
      threshold: `${ENGINE_THRESHOLDS.fuelConsumption.warning[0]}-${ENGINE_THRESHOLDS.fuelConsumption.warning[1]} L/h`,
      timestamp: record.createdAt,
      linkedRecordIds: [record.id],
    });
  }

  return triggers;
}

export function evaluateBilgeWaterRecord(
  record: BilgeWaterRecord | null
): RiskTrigger[] {
  if (!record) return [];
  const triggers: RiskTrigger[] = [];
  const bilgeStatus = getBilgeLevelStatus(record.liquidLevel);
  const treatmentUnfinished = isBilgeTreatmentUnfinished(record.treatmentResult);
  const pumpFault = record.pumpStatus === "故障";

  if (bilgeStatus === "danger") {
    triggers.push({
      type: "bilge_water",
      level: "critical",
      title: "舱底水液位危险",
      description: `舱底水液位 ${record.liquidLevel}% 达到危险值，存在淹水风险，需立即启动所有排水泵并查找进水来源`,
      value: `${record.liquidLevel}%`,
      threshold: `≥ ${BILGE_DANGER_LEVEL}%`,
      timestamp: record.createdAt,
      linkedRecordIds: [record.id],
    });
  } else if (bilgeStatus === "warning") {
    triggers.push({
      type: "bilge_water",
      level: "high",
      title: "舱底水液位警戒",
      description: `舱底水液位 ${record.liquidLevel}% 达到警戒值，应加强监测并启动泵组排水`,
      value: `${record.liquidLevel}%`,
      threshold: `≥ ${BILGE_WARNING_LEVEL}%`,
      timestamp: record.createdAt,
      linkedRecordIds: [record.id],
    });
  }

  if (pumpFault) {
    triggers.push({
      type: "bilge_water",
      level: "high",
      title: "舱底水泵故障",
      description: `舱底水泵处于故障状态，无法正常排水，需立即维修或切换备用泵`,
      value: record.pumpStatus,
      timestamp: record.createdAt,
      linkedRecordIds: [record.id],
    });
  }

  if (treatmentUnfinished && bilgeStatus !== "normal") {
    triggers.push({
      type: "bilge_water",
      level: "medium",
      title: "舱底水处理未完成",
      description: `舱底水处理状态为「${record.treatmentResult}」，${record.warningNote ? "备注：" + record.warningNote : "需关注处理进度"}`,
      value: record.treatmentResult,
      timestamp: record.createdAt,
      linkedRecordIds: [record.id],
    });
  }

  return triggers;
}

export function evaluateAnomalyRecords(
  records: AnomalyRecord[]
): RiskTrigger[] {
  const triggers: RiskTrigger[] = [];
  const pendingAnomalies = records.filter((r) => !r.deletedAt && r.currentStatus !== "已关闭");
  const criticalStatusAnomalies = pendingAnomalies.filter(
    (r) => r.currentStatus === "待处理" || r.currentStatus === "处理中"
  );

  if (pendingAnomalies.length >= ANOMALY_COUNT_THRESHOLDS.critical) {
    triggers.push({
      type: "anomaly_count",
      level: "critical",
      title: "异常项数量严重",
      description: `存在 ${pendingAnomalies.length} 个未关闭异常，超过严重阈值，需立即协调资源处理`,
      value: `${pendingAnomalies.length} 项`,
      threshold: `≥ ${ANOMALY_COUNT_THRESHOLDS.critical} 项`,
      linkedAnomalyIds: pendingAnomalies.map((r) => r.id),
    });
  } else if (pendingAnomalies.length >= ANOMALY_COUNT_THRESHOLDS.high) {
    triggers.push({
      type: "anomaly_count",
      level: "high",
      title: "异常项数量较多",
      description: `存在 ${pendingAnomalies.length} 个未关闭异常，建议优先处理关键设备问题`,
      value: `${pendingAnomalies.length} 项`,
      threshold: `≥ ${ANOMALY_COUNT_THRESHOLDS.high} 项`,
      linkedAnomalyIds: pendingAnomalies.map((r) => r.id),
    });
  } else if (pendingAnomalies.length >= ANOMALY_COUNT_THRESHOLDS.medium) {
    triggers.push({
      type: "anomaly_count",
      level: "medium",
      title: "异常项数量预警",
      description: `存在 ${pendingAnomalies.length} 个未关闭异常，请合理安排处理进度`,
      value: `${pendingAnomalies.length} 项`,
      threshold: `≥ ${ANOMALY_COUNT_THRESHOLDS.medium} 项`,
      linkedAnomalyIds: pendingAnomalies.map((r) => r.id),
    });
  }

  if (criticalStatusAnomalies.length > 0) {
    const deviceNames = criticalStatusAnomalies.map((r) => r.device).join("、");
    triggers.push({
      type: "anomaly_pending",
      level: "high",
      title: "待处理异常未关闭",
      description: `以下设备异常处于待处理或处理中状态：${deviceNames}，需关注处理进展`,
      value: `${criticalStatusAnomalies.length} 项`,
      linkedAnomalyIds: criticalStatusAnomalies.map((r) => r.id),
      timestamp: criticalStatusAnomalies[0].createdAt,
    });
  }

  return triggers;
}

export function aggregateRiskLevel(triggers: RiskTrigger[]): RiskLevel {
  if (triggers.length === 0) return "safe";
  const maxLevel = triggers.reduce<RiskLevel>((max, t) => {
    return RISK_LEVEL_SCORES[t.level] > RISK_LEVEL_SCORES[max] ? t.level : max;
  }, "safe");

  const criticalCount = triggers.filter((t) => t.level === "critical").length;
  const highCount = triggers.filter((t) => t.level === "high").length;

  if (maxLevel === "critical" && criticalCount >= 2) return "critical";
  if (maxLevel === "high" && highCount >= 3) return "critical";
  if (maxLevel === "medium" && triggers.length >= 4) return "high";

  return maxLevel;
}

export function calculateRiskScore(triggers: RiskTrigger[]): number {
  return triggers.reduce((sum, t) => sum + RISK_LEVEL_SCORES[t.level] * (t.level === "critical" ? 3 : t.level === "high" ? 2 : 1), 0);
}

export function buildRiskTimeline(
  engineRecords: EngineRoomRecord[],
  bilgeRecords: BilgeWaterRecord[],
  anomalyRecords: AnomalyRecord[]
): RiskTimelineEvent[] {
  const events: RiskTimelineEvent[] = [];

  engineRecords.forEach((r) => {
    const triggers = evaluateEngineRoomRecord(r);
    if (triggers.length > 0) {
      const maxTrigger = triggers.reduce((a, b) =>
        RISK_LEVEL_SCORES[a.level] > RISK_LEVEL_SCORES[b.level] ? a : b
      );
      events.push({
        id: `engine-${r.id}`,
        timestamp: r.createdAt,
        type: "engine",
        level: maxTrigger.level,
        title: "机舱参数异常",
        description: maxTrigger.title,
        linkedRecordId: r.id,
      });
    }
  });

  bilgeRecords.forEach((r) => {
    const triggers = evaluateBilgeWaterRecord(r);
    if (triggers.length > 0) {
      const maxTrigger = triggers.reduce((a, b) =>
        RISK_LEVEL_SCORES[a.level] > RISK_LEVEL_SCORES[b.level] ? a : b
      );
      events.push({
        id: `bilge-${r.id}`,
        timestamp: r.createdAt,
        type: "bilge",
        level: maxTrigger.level,
        title: "舱底水异常",
        description: maxTrigger.title,
        linkedRecordId: r.id,
      });
    }
  });

  anomalyRecords.forEach((r) => {
    if (r.deletedAt) return;
    const isUnclosed = r.currentStatus !== "已关闭";
    const level: RiskLevel = isUnclosed
      ? r.currentStatus === "待处理"
        ? "high"
        : r.currentStatus === "处理中"
        ? "medium"
        : "low"
      : "safe";
    if (level !== "safe") {
      const originShiftId = r.originShiftId ?? r.shiftId;
      const originShift = SHIFTS.find((s) => s.id === originShiftId);
      const originLabel = originShift ? originShift.label : originShiftId;
      const titleSuffix = originShiftId !== r.shiftId ? `（源自${originLabel}）` : "";
      events.push({
        id: `anomaly-${r.id}`,
        timestamp: r.createdAt,
        type: "anomaly",
        level,
        title: `${r.device}异常${titleSuffix}`,
        description: r.anomalyDescription,
        linkedRecordId: r.id,
      });
    }
  });

  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function generateHandoverRecommendation(
  level: RiskLevel,
  triggers: RiskTrigger[]
): string {
  const lines: string[] = [];

  switch (level) {
    case "safe":
      lines.push("【总体风险评估】安全");
      lines.push("本班次各项参数运行正常，无重大风险事项。");
      break;
    case "low":
      lines.push("【总体风险评估】低风险");
      lines.push("存在少量预警信号，建议下一班继续常规监测。");
      break;
    case "medium":
      lines.push("【总体风险评估】中风险");
      lines.push("存在多项异常指标，需下一班重点关注以下事项：");
      break;
    case "high":
      lines.push("【总体风险评估】高风险");
      lines.push("⚠ 高风险警告：本班次检测到严重异常，下一班必须立即处理：");
      break;
    case "critical":
      lines.push("【总体风险评估】严重");
      lines.push("⚠⚠ 严重警告：存在危及航行安全的风险，需立即报告船长并采取应急措施：");
      break;
  }

  if (triggers.length > 0) {
    lines.push("");
    lines.push("【风险触发项】");
    RISK_LEVEL_ORDER.slice().reverse().forEach((lv) => {
      const levelTriggers = triggers.filter((t) => t.level === lv);
      if (levelTriggers.length > 0) {
        lines.push(`  ${RISK_LEVEL_LABELS[lv]}（${levelTriggers.length}项）：`);
        levelTriggers.forEach((t, i) => {
          lines.push(`    ${i + 1}. ${t.title}`);
          if (t.description) {
            lines.push(`       ${t.description}`);
          }
        });
      }
    });
  }

  const criticalTriggers = triggers.filter((t) => t.level === "critical");
  if (criticalTriggers.length > 0) {
    lines.push("");
    lines.push("【紧急处理建议】");
    criticalTriggers.forEach((t, i) => {
      lines.push(`  ${i + 1}. 针对「${t.title}」：立即执行对应应急预案`);
    });
  }

  return lines.join("\n");
}

export interface RiskCalculationInput {
  shiftId: string;
  engineRoomRecord: EngineRoomRecord | null;
  bilgeWaterRecord: BilgeWaterRecord | null;
  anomalyRecords: AnomalyRecord[];
  engineRoomRecords: EngineRoomRecord[];
  bilgeWaterRecords: BilgeWaterRecord[];
}

export function calculateRiskAssessment(input: RiskCalculationInput): Omit<RiskAssessment, "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "vesselId" | "fleetId" | "deletedAt"> {
  const { shiftId, engineRoomRecord, bilgeWaterRecord, anomalyRecords, engineRoomRecords, bilgeWaterRecords } = input;

  const engineTriggers = evaluateEngineRoomRecord(engineRoomRecord);
  const bilgeTriggers = evaluateBilgeWaterRecord(bilgeWaterRecord);
  const anomalyTriggers = evaluateAnomalyRecords(anomalyRecords);

  const allTriggers = [...engineTriggers, ...bilgeTriggers, ...anomalyTriggers];
  const overallLevel = aggregateRiskLevel(allTriggers);
  const score = calculateRiskScore(allTriggers);
  const timeline = buildRiskTimeline(engineRoomRecords, bilgeWaterRecords, anomalyRecords);

  return {
    shiftId,
    overallLevel,
    score,
    triggers: allTriggers,
    timeline,
    handoverRecommendation: generateHandoverRecommendation(overallLevel, allTriggers),
    dataSnapshot: {
      engineRoomRecordId: engineRoomRecord?.id,
      bilgeWaterRecordId: bilgeWaterRecord?.id,
      anomalyIds: anomalyRecords.map((r) => r.id),
    },
    calculatedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
  };
}

export function createExportData(
  records: Record<string, WatchRecord[]>,
  engineRoomRecords: Record<string, EngineRoomRecord[]>,
  anomalyRecords: Record<string, AnomalyRecord[]>,
  bilgeWaterRecords: Record<string, BilgeWaterRecord[]>,
  handoverSummaries: Record<string, HandoverSummary>,
  riskAssessments?: Record<string, RiskAssessment[]>
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
    riskAssessments,
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
        totalRiskAssessments: 0,
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
        totalRiskAssessments: 0,
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
  if (validData.riskAssessments) {
    collectShifts(validData.riskAssessments);
  }

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
      totalRiskAssessments: validData.riskAssessments ? sumRecords(validData.riskAssessments as Record<string, unknown[]>) : 0,
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
  existingHandover: Record<string, HandoverSummary>,
  existingRisk: Record<string, RiskAssessment[]> = {}
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
  if (importData.riskAssessments) {
    checkArrayConflict("riskAssessments", importData.riskAssessments as Record<string, unknown[]>, existingRisk as Record<string, unknown[]>);
  }

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
  existingHandover: Record<string, HandoverSummary>,
  existingRisk: Record<string, RiskAssessment[]> = {}
): {
  records: Record<string, WatchRecord[]>;
  engineRoomRecords: Record<string, EngineRoomRecord[]>;
  anomalyRecords: Record<string, AnomalyRecord[]>;
  bilgeWaterRecords: Record<string, BilgeWaterRecord[]>;
  handoverSummaries: Record<string, HandoverSummary>;
  riskAssessments: Record<string, RiskAssessment[]>;
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
    riskAssessments: importData.riskAssessments ? mergeArrayMap(importData.riskAssessments, existingRisk) : { ...existingRisk },
  };
}

export function migrateAnomalyRecord(record: AnomalyRecord, targetShiftId?: string): AnomalyRecord {
  const now = new Date().toISOString();
  const shifted = targetShiftId ?? record.shiftId;
  return {
    ...record,
    originShiftId: record.originShiftId ?? record.shiftId,
    handoverPath: record.handoverPath ?? [],
    closedAtShiftId: record.closedAtShiftId ?? (record.currentStatus === "已关闭" ? shifted : null),
    closedAt: record.closedAt ?? (record.currentStatus === "已关闭" ? now : null),
    closedBy: record.closedBy ?? (record.currentStatus === "已关闭" ? record.updatedBy : null),
    statusHistory: (record.statusHistory ?? []).map((s) => ({
      ...s,
      shiftId: s.shiftId ?? shifted,
    })),
  };
}

export function getAnomalyOriginShiftLabel(record: AnomalyRecord): string {
  const shift = SHIFTS.find((s) => s.id === record.originShiftId);
  return shift ? shift.label : record.originShiftId;
}

export function getAnomalyCurrentShiftLabel(record: AnomalyRecord): string {
  const shift = SHIFTS.find((s) => s.id === record.shiftId);
  return shift ? shift.label : record.shiftId;
}

export function getAnomalyCloseShiftLabel(record: AnomalyRecord): string | null {
  if (!record.closedAtShiftId) return null;
  const shift = SHIFTS.find((s) => s.id === record.closedAtShiftId);
  return shift ? shift.label : record.closedAtShiftId;
}

export function getHandoverPathLabels(record: AnomalyRecord): string[] {
  const labels: string[] = [];
  if (record.handoverPath && record.handoverPath.length > 0) {
    const first = record.handoverPath[0];
    const fromShift = SHIFTS.find((s) => s.id === first.fromShiftId);
    labels.push(fromShift ? fromShift.label : first.fromShiftId);
    record.handoverPath.forEach((step) => {
      const toShift = SHIFTS.find((s) => s.id === step.toShiftId);
      labels.push(toShift ? toShift.label : step.toShiftId);
    });
  } else if (record.isCarriedOver && record.carryOverFromShiftId) {
    const fromShift = SHIFTS.find((s) => s.id === record.carryOverFromShiftId);
    labels.push(fromShift ? fromShift.label : record.carryOverFromShiftId);
    const currentShift = SHIFTS.find((s) => s.id === record.shiftId);
    labels.push(currentShift ? currentShift.label : record.shiftId);
  } else {
    const originShift = SHIFTS.find((s) => s.id === record.originShiftId);
    labels.push(originShift ? originShift.label : record.originShiftId);
  }
  return labels;
}

export function formatHandoverPath(record: AnomalyRecord): string {
  const labels = getHandoverPathLabels(record);
  if (labels.length <= 1) return "";
  return labels.join(" → ");
}

export function getAnomalyLifecycleStatus(record: AnomalyRecord): "open" | "carried" | "closed" | "reopened" {
  if (record.currentStatus === "已关闭") return "closed";
  if (record.handoverPath && record.handoverPath.length > 0) return "carried";
  if (record.isCarriedOver) return "carried";
  return "open";
}

export function buildHandoverStep(
  fromShiftId: string,
  toShiftId: string,
  handedBy: string,
  note?: string
): HandoverStep {
  return {
    id: crypto.randomUUID(),
    fromShiftId,
    toShiftId,
    handedAt: new Date().toISOString(),
    handedBy,
    note,
  };
}
