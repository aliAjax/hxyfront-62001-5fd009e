import type {
  WatchRecord,
  EngineRoomRecord,
  AnomalyRecord,
  BilgeWaterRecord,
  HandoverSummary,
  RiskAssessment,
  AnomalyStatus,
} from "./domain";

type VesselScoped<T> = Record<string, T>;
type ShiftMap<T> = Record<string, T[]>;
type ShiftObject<T> = Record<string, T>;

interface SoftDeletable {
  deletedAt?: string | null;
}

interface WithCreatedAt {
  createdAt: string;
}

export function selectVesselShiftMap<T>(
  vesselScoped: VesselScoped<ShiftMap<T>>,
  vesselId: string
): ShiftMap<T> {
  return vesselScoped[vesselId] ?? {};
}

export function selectVesselShiftObject<T>(
  vesselScoped: VesselScoped<ShiftObject<T>>,
  vesselId: string
): ShiftObject<T> {
  return vesselScoped[vesselId] ?? {};
}

export function selectShiftRecords<T>(
  shiftMap: ShiftMap<T>,
  shiftId: string
): T[] {
  return shiftMap[shiftId] ?? [];
}

export function selectActiveRecords<T extends SoftDeletable>(
  records: T[]
): T[] {
  return records.filter((r) => !r.deletedAt);
}

export function selectLatestRecord<T extends WithCreatedAt>(
  records: T[]
): T | null {
  if (records.length === 0) return null;
  return records.reduce((latest, record) =>
    new Date(record.createdAt) > new Date(latest.createdAt) ? record : latest
  );
}

export function selectAllActiveRecords<T extends SoftDeletable>(
  shiftMap: ShiftMap<T>
): T[] {
  return Object.values(shiftMap).flat().filter((r) => !r.deletedAt);
}

export function selectCurrentShiftActiveRecords<T extends SoftDeletable>(
  vesselScoped: VesselScoped<ShiftMap<T>>,
  vesselId: string,
  shiftId: string
): T[] {
  const shiftMap = selectVesselShiftMap(vesselScoped, vesselId);
  const records = selectShiftRecords(shiftMap, shiftId);
  return selectActiveRecords(records);
}

export function selectLatestVesselRecord<T extends SoftDeletable & WithCreatedAt>(
  vesselScoped: VesselScoped<ShiftMap<T>>,
  vesselId: string
): T | null {
  const shiftMap = selectVesselShiftMap(vesselScoped, vesselId);
  const all = selectAllActiveRecords(shiftMap);
  return selectLatestRecord(all);
}

export function selectActiveAnomalyRecords(
  anomalyShiftMap: ShiftMap<AnomalyRecord>,
  shiftId: string,
  includeClosed: boolean = false
): AnomalyRecord[] {
  const records = selectShiftRecords(anomalyShiftMap, shiftId);
  return records.filter(
    (r) => !r.deletedAt && (includeClosed || r.currentStatus !== "已关闭")
  );
}

export function selectCarriedOverAnomalies(
  anomalyShiftMap: ShiftMap<AnomalyRecord>,
  targetShiftId: string
): AnomalyRecord[] {
  const result: AnomalyRecord[] = [];
  for (const shiftId of Object.keys(anomalyShiftMap)) {
    for (const record of anomalyShiftMap[shiftId]) {
      if (
        !record.deletedAt &&
        record.currentStatus !== "已关闭" &&
        record.isCarriedOver &&
        record.carryOverFromShiftId &&
        record.shiftId === targetShiftId
      ) {
        result.push(record);
      }
    }
  }
  return result;
}

export function selectHandoverSummary(
  handoverMap: ShiftObject<HandoverSummary>,
  shiftId: string
): HandoverSummary | null {
  const s = handoverMap[shiftId];
  return s && !s.deletedAt ? s : null;
}

export interface ShiftDataSnapshot {
  records: WatchRecord[];
  engineRoomRecords: EngineRoomRecord[];
  anomalyRecords: AnomalyRecord[];
  bilgeWaterRecords: BilgeWaterRecord[];
}

export function selectShiftDataSnapshot(
  vesselScoped: {
    records: VesselScoped<ShiftMap<WatchRecord>>;
    engineRoomRecords: VesselScoped<ShiftMap<EngineRoomRecord>>;
    anomalyRecords: VesselScoped<ShiftMap<AnomalyRecord>>;
    bilgeWaterRecords: VesselScoped<ShiftMap<BilgeWaterRecord>>;
  },
  vesselId: string,
  shiftId: string
): ShiftDataSnapshot {
  return {
    records: selectCurrentShiftActiveRecords(vesselScoped.records, vesselId, shiftId),
    engineRoomRecords: selectCurrentShiftActiveRecords(vesselScoped.engineRoomRecords, vesselId, shiftId),
    anomalyRecords: selectCurrentShiftActiveRecords(vesselScoped.anomalyRecords, vesselId, shiftId),
    bilgeWaterRecords: selectCurrentShiftActiveRecords(vesselScoped.bilgeWaterRecords, vesselId, shiftId),
  };
}

export function findRecordInVessel<T extends SoftDeletable & { id: string }>(
  vesselScoped: VesselScoped<ShiftMap<T>>,
  id: string
): T | null {
  for (const vId of Object.keys(vesselScoped)) {
    const shiftMap = vesselScoped[vId];
    for (const shiftId of Object.keys(shiftMap)) {
      const found = shiftMap[shiftId].find((r) => r.id === id && !r.deletedAt);
      if (found) return found;
    }
  }
  return null;
}

export function findRecordIndexInVessel<T extends SoftDeletable & { id: string }>(
  vesselScoped: VesselScoped<ShiftMap<T>>,
  id: string
): { vId: string; shiftId: string; idx: number } | null {
  for (const vId of Object.keys(vesselScoped)) {
    const shiftMap = vesselScoped[vId];
    for (const shiftId of Object.keys(shiftMap)) {
      const idx = shiftMap[shiftId].findIndex((r) => r.id === id && !r.deletedAt);
      if (idx !== -1) return { vId, shiftId, idx };
    }
  }
  return null;
}

export function findIdempotencyKeyInVessel<T extends { idempotencyKey: string }>(
  shiftMap: ShiftMap<T>,
  idempotencyKey: string
): T | null {
  for (const shiftId of Object.keys(shiftMap)) {
    const existing = shiftMap[shiftId].find((r) => r.idempotencyKey === idempotencyKey);
    if (existing) return existing;
  }
  return null;
}

export type { VesselScoped, ShiftMap, ShiftObject, SoftDeletable, WithCreatedAt };
