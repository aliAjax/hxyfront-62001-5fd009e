import type {
  WatchRecord,
  EngineRoomRecord,
  BilgeWaterRecord,
  AnomalyRecord,
  HandoverSummary,
  RiskAssessment,
  ExportData,
  ImportStrategy,
  Vessel,
} from "./domain";
import {
  SCHEMA_VERSION,
  EXPORT_VERSION,
  DEFAULT_VESSEL_ID,
  getCurrentShiftId as getDefaultCurrentShiftId,
  migrateAnomalyRecord,
  createDefaultVessel,
} from "./domain";
import type { VesselScoped, ShiftMap, ShiftObject } from "./shiftSelectors";

export function buildExportData(
  vessels: Vessel[],
  currentVesselId: string,
  records: VesselScoped<ShiftMap<WatchRecord>>,
  engineRoomRecords: VesselScoped<ShiftMap<EngineRoomRecord>>,
  anomalyRecords: VesselScoped<ShiftMap<AnomalyRecord>>,
  bilgeWaterRecords: VesselScoped<ShiftMap<BilgeWaterRecord>>,
  handoverSummaries: VesselScoped<ShiftObject<HandoverSummary>>,
  riskAssessments: VesselScoped<ShiftMap<RiskAssessment>>
): ExportData {
  const vesselScopedData: ExportData["vesselScopedData"] = {};
  vessels.forEach((v) => {
    vesselScopedData[v.id] = {
      records: JSON.parse(JSON.stringify(records[v.id] ?? {})),
      engineRoomRecords: JSON.parse(JSON.stringify(engineRoomRecords[v.id] ?? {})),
      anomalyRecords: JSON.parse(JSON.stringify(anomalyRecords[v.id] ?? {})),
      bilgeWaterRecords: JSON.parse(JSON.stringify(bilgeWaterRecords[v.id] ?? {})),
      handoverSummaries: JSON.parse(JSON.stringify(handoverSummaries[v.id] ?? {})),
      riskAssessments: JSON.parse(JSON.stringify(riskAssessments[v.id] ?? {})),
    };
  });

  const currentVesselData = vesselScopedData[currentVesselId] ?? {
    records: {},
    engineRoomRecords: {},
    anomalyRecords: {},
    bilgeWaterRecords: {},
    handoverSummaries: {},
    riskAssessments: {},
  };

  return {
    version: EXPORT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    vessels: JSON.parse(JSON.stringify(vessels)),
    currentVesselId,
    records: currentVesselData.records,
    engineRoomRecords: currentVesselData.engineRoomRecords,
    anomalyRecords: currentVesselData.anomalyRecords,
    bilgeWaterRecords: currentVesselData.bilgeWaterRecords,
    handoverSummaries: currentVesselData.handoverSummaries,
    riskAssessments: currentVesselData.riskAssessments,
    vesselScopedData,
    meta: {
      schemaVersion: SCHEMA_VERSION,
      migratedAt: new Date().toISOString(),
    },
  };
}

export function buildExportDataForVessel(
  vesselId: string,
  vessels: Vessel[],
  records: VesselScoped<ShiftMap<WatchRecord>>,
  engineRoomRecords: VesselScoped<ShiftMap<EngineRoomRecord>>,
  anomalyRecords: VesselScoped<ShiftMap<AnomalyRecord>>,
  bilgeWaterRecords: VesselScoped<ShiftMap<BilgeWaterRecord>>,
  handoverSummaries: VesselScoped<ShiftObject<HandoverSummary>>,
  riskAssessments: VesselScoped<ShiftMap<RiskAssessment>>
): ExportData {
  const vessel = vessels.find((v) => v.id === vesselId);
  const vesselsForExport = vessel ? [vessel] : [];
  return {
    version: EXPORT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    vessels: JSON.parse(JSON.stringify(vesselsForExport)),
    currentVesselId: vesselId,
    records: JSON.parse(JSON.stringify(records[vesselId] ?? {})),
    engineRoomRecords: JSON.parse(JSON.stringify(engineRoomRecords[vesselId] ?? {})),
    anomalyRecords: JSON.parse(JSON.stringify(anomalyRecords[vesselId] ?? {})),
    bilgeWaterRecords: JSON.parse(JSON.stringify(bilgeWaterRecords[vesselId] ?? {})),
    handoverSummaries: JSON.parse(JSON.stringify(handoverSummaries[vesselId] ?? {})),
    riskAssessments: JSON.parse(JSON.stringify(riskAssessments[vesselId] ?? {})),
    meta: {
      schemaVersion: SCHEMA_VERSION,
      migratedAt: new Date().toISOString(),
    },
  };
}

export function mergeVesselShiftMap<T extends { id: string }>(
  importedData: Record<string, T[]>,
  target: VesselScoped<ShiftMap<T>>,
  vesselId: string,
  strategy: ImportStrategy,
  ensureVesselData: (vId: string) => void,
  report: (conflicts: number, imported: number) => void
): number {
  ensureVesselData(vesselId);
  const existing = target[vesselId] ?? {};
  const result: Record<string, T[]> = { ...existing };
  let count = 0;
  let confl = 0;
  Object.keys(importedData).forEach((shiftId) => {
    if (strategy === "overwrite") {
      result[shiftId] = [...importedData[shiftId]];
      count += importedData[shiftId].length;
      if ((existing[shiftId]?.length ?? 0) > 0) {
        confl += existing[shiftId]!.length;
      }
    } else {
      const existingIds = new Set((existing[shiftId] ?? []).map((r) => r.id));
      const newItems = importedData[shiftId].filter((item) => !existingIds.has(item.id));
      result[shiftId] = [...(existing[shiftId] ?? []), ...newItems];
      count += newItems.length;
      confl += importedData[shiftId].length - newItems.length;
    }
  });
  target[vesselId] = result;
  report(confl, 0);
  return count;
}

export function mergeVesselShiftObject<T extends { id: string }>(
  importedData: Record<string, T>,
  target: VesselScoped<ShiftObject<T>>,
  vesselId: string,
  strategy: ImportStrategy,
  ensureVesselData: (vId: string) => void,
  report: (conflicts: number, imported: number) => void
): number {
  ensureVesselData(vesselId);
  const existing = target[vesselId] ?? {};
  const result: Record<string, T> = { ...existing };
  let count = 0;
  let confl = 0;
  Object.keys(importedData).forEach((key) => {
    if (strategy === "overwrite") {
      result[key] = importedData[key];
      count += 1;
      if (existing[key]) confl += 1;
    } else {
      if (!result[key]) {
        result[key] = importedData[key];
        count += 1;
      } else {
        confl += 1;
      }
    }
  });
  target[vesselId] = result;
  report(confl, 0);
  return count;
}

export interface ImportContext {
  vessels: Vessel[];
  records: VesselScoped<ShiftMap<WatchRecord>>;
  engineRoomRecords: VesselScoped<ShiftMap<EngineRoomRecord>>;
  anomalyRecords: VesselScoped<ShiftMap<AnomalyRecord>>;
  bilgeWaterRecords: VesselScoped<ShiftMap<BilgeWaterRecord>>;
  handoverSummaries: VesselScoped<ShiftObject<HandoverSummary>>;
  riskAssessments: VesselScoped<ShiftMap<RiskAssessment>>;
  currentShiftIdPerVessel: Record<string, string>;
  ensureVesselData: (vId: string) => void;
}

export function applyImport(
  exportData: ExportData,
  strategy: ImportStrategy,
  ctx: ImportContext
): { imported: number; conflicts: number } {
  let imported = 0;
  let conflicts = 0;

  if (exportData.vessels && exportData.vessels.length > 0) {
    const existingVesselIds = new Set(ctx.vessels.map((v) => v.id));
    exportData.vessels.forEach((v) => {
      if (!existingVesselIds.has(v.id)) {
        ctx.vessels.push(JSON.parse(JSON.stringify(v)));
        ctx.ensureVesselData(v.id);
        ctx.currentShiftIdPerVessel[v.id] = getDefaultCurrentShiftId();
      } else {
        const idx = ctx.vessels.findIndex((ev) => ev.id === v.id);
        if (idx !== -1 && strategy === "overwrite") {
          ctx.vessels[idx] = { ...ctx.vessels[idx], ...v, id: ctx.vessels[idx].id };
        }
      }
    });
  }

  const useVesselScoped = exportData.vesselScopedData && Object.keys(exportData.vesselScopedData).length > 0;

  const doMerge = (vId: string, vData: NonNullable<ExportData["vesselScopedData"]>[string] | undefined, data: ExportData) => {
    if (vData) {
      imported += mergeVesselShiftMap(vData.records, ctx.records, vId, strategy, ctx.ensureVesselData, (a, b) => { conflicts += a; imported += b; });
      imported += mergeVesselShiftMap(vData.engineRoomRecords, ctx.engineRoomRecords, vId, strategy, ctx.ensureVesselData, (a, b) => { conflicts += a; imported += b; });
      imported += mergeVesselShiftMap(vData.anomalyRecords, ctx.anomalyRecords, vId, strategy, ctx.ensureVesselData, (a, b) => { conflicts += a; imported += b; });
      imported += mergeVesselShiftMap(vData.bilgeWaterRecords, ctx.bilgeWaterRecords, vId, strategy, ctx.ensureVesselData, (a, b) => { conflicts += a; imported += b; });
      imported += mergeVesselShiftObject(vData.handoverSummaries, ctx.handoverSummaries, vId, strategy, ctx.ensureVesselData, (a, b) => { conflicts += a; imported += b; });
      imported += mergeVesselShiftMap(vData.riskAssessments, ctx.riskAssessments, vId, strategy, ctx.ensureVesselData, (a, b) => { conflicts += a; imported += b; });
    } else {
      imported += mergeVesselShiftMap(data.records, ctx.records, vId, strategy, ctx.ensureVesselData, (a, b) => { conflicts += a; imported += b; });
      imported += mergeVesselShiftMap(data.engineRoomRecords, ctx.engineRoomRecords, vId, strategy, ctx.ensureVesselData, (a, b) => { conflicts += a; imported += b; });
      imported += mergeVesselShiftMap(data.anomalyRecords, ctx.anomalyRecords, vId, strategy, ctx.ensureVesselData, (a, b) => { conflicts += a; imported += b; });
      imported += mergeVesselShiftMap(data.bilgeWaterRecords, ctx.bilgeWaterRecords, vId, strategy, ctx.ensureVesselData, (a, b) => { conflicts += a; imported += b; });
      imported += mergeVesselShiftObject(data.handoverSummaries, ctx.handoverSummaries, vId, strategy, ctx.ensureVesselData, (a, b) => { conflicts += a; imported += b; });
      if (data.riskAssessments) {
        imported += mergeVesselShiftMap(data.riskAssessments, ctx.riskAssessments, vId, strategy, ctx.ensureVesselData, (a, b) => { conflicts += a; imported += b; });
      }
    }
  };

  if (useVesselScoped) {
    Object.entries(exportData.vesselScopedData!).forEach(([vId, vData]) => {
      const existingVessel = ctx.vessels.find((v) => v.id === vId);
      if (!existingVessel) {
        const newVessel: Vessel = {
          id: vId,
          name: `导入船舶 (${vId.slice(0, 8)})`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          fleetId: null,
        };
        ctx.vessels.push(newVessel);
        ctx.ensureVesselData(vId);
        ctx.currentShiftIdPerVessel[vId] = getDefaultCurrentShiftId();
      }
      doMerge(vId, vData, exportData);
    });
  }

  const targetVesselId = exportData.currentVesselId ?? DEFAULT_VESSEL_ID;
  const vesselExists = ctx.vessels.some((v) => v.id === targetVesselId);
  if (!vesselExists) {
    const importVessels = exportData.vessels ?? [];
    const matching = importVessels.find((v) => v.id === targetVesselId);
    const newVessel: Vessel = matching ?? {
      id: targetVesselId,
      name: targetVesselId === DEFAULT_VESSEL_ID ? "默认船舶" : `导入船舶 (${targetVesselId.slice(0, 8)})`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fleetId: null,
    };
    ctx.vessels.push(newVessel);
    ctx.ensureVesselData(targetVesselId);
    ctx.currentShiftIdPerVessel[targetVesselId] = getDefaultCurrentShiftId();
  }

  if (!useVesselScoped) {
    doMerge(targetVesselId, undefined, exportData);
  }

  return { imported, conflicts };
}

export function isShiftScopedArrayData(data: Record<string, unknown>): boolean {
  const keys = Object.keys(data);
  if (keys.length === 0) return false;
  return keys.every((k) => {
    const val = data[k];
    return Array.isArray(val);
  });
}

export function isShiftScopedObjectData(data: Record<string, unknown>): boolean {
  const keys = Object.keys(data);
  if (keys.length === 0) return false;
  return keys.every((k) => {
    const val = data[k];
    return typeof val === "object" && val !== null && !Array.isArray(val) && "id" in (val as Record<string, unknown>);
  });
}

export function isVesselScopedData(data: Record<string, unknown>): boolean {
  const keys = Object.keys(data);
  if (keys.length === 0) return false;
  return keys.every((k) => {
    const val = data[k];
    return typeof val === "object" && val !== null && !Array.isArray(val);
  });
}

export function extractShiftScopedKeys(data: Record<string, unknown>): string[] {
  const result: string[] = [];
  for (const key of Object.keys(data)) {
    const val = data[key];
    if (Array.isArray(val)) {
      result.push(key);
    } else if (typeof val === "object" && val !== null && "id" in (val as Record<string, unknown>)) {
      result.push(key);
    }
  }
  return result;
}

function migrateArrayData(
  target: Record<string, Record<string, any[]>>,
  shiftScopedData: Record<string, any[]>,
  defaultVesselId: string
): void {
  Object.entries(shiftScopedData).forEach(([shiftId, arr]) => {
    const migratedArr = arr.map((r) => ({
      ...r,
      vesselId: r.vesselId || defaultVesselId,
      fleetId: r.fleetId ?? null,
    }));
    if (target[defaultVesselId][shiftId]) {
      const existing = target[defaultVesselId][shiftId];
      const newItems = migratedArr.filter(
        (nr) => !existing.some((er) => er.id === nr.id)
      );
      target[defaultVesselId][shiftId] = [...existing, ...newItems];
    } else {
      target[defaultVesselId][shiftId] = migratedArr;
    }
  });
}

function migrateObjectData(
  target: Record<string, Record<string, any>>,
  shiftScopedData: Record<string, any>,
  defaultVesselId: string
): void {
  Object.entries(shiftScopedData).forEach(([shiftId, item]) => {
    if (!target[defaultVesselId][shiftId]) {
      target[defaultVesselId][shiftId] = {
        ...item,
        vesselId: item.vesselId || defaultVesselId,
        fleetId: item.fleetId ?? null,
      };
    }
  });
}

export interface MigrationTargets {
  records: Record<string, Record<string, any[]>>;
  engineRoomRecords: Record<string, Record<string, any[]>>;
  anomalyRecords: Record<string, Record<string, any[]>>;
  bilgeWaterRecords: Record<string, Record<string, any[]>>;
  handoverSummaries: Record<string, Record<string, any>>;
  riskAssessments: Record<string, Record<string, any[]>>;
}

export function migrateLoadedData(
  targets: MigrationTargets,
  safeLoad: <T>(key: string, defaultValue: T) => T,
  storageKeys: { RECORDS: string; ENGINE_ROOM: string; ANOMALIES: string; BILGE: string; HANDOVER: string; RISK: string }
): boolean {
  const defaultVesselId = DEFAULT_VESSEL_ID;
  let migrated = false;

  const tryMigrateArray = <T extends { id?: string; vesselId?: string; fleetId?: string | null }>(
    target: Record<string, Record<string, T[]>>,
    rawData: Record<string, unknown>
  ): boolean => {
    let did = false;
    if (isShiftScopedArrayData(rawData)) {
      const shiftScopedData = rawData as unknown as Record<string, T[]>;
      const shiftKeys = Object.keys(shiftScopedData);
      Object.keys(target).forEach((k) => delete target[k]);
      target[defaultVesselId] = target[defaultVesselId] ?? {};
      migrateArrayData(target, shiftScopedData, defaultVesselId);
      did = true;
      console.log(`[Migration] Migrated ${shiftKeys.length} shifts to default vessel`);
    } else {
      const shiftKeys = extractShiftScopedKeys(rawData);
      if (shiftKeys.length > 0 && target[defaultVesselId]) {
        const shiftScopedData: Record<string, T[]> = {};
        for (const k of shiftKeys) {
          shiftScopedData[k] = (rawData as Record<string, T[]>)[k];
          delete target[k as keyof typeof target];
        }
        migrateArrayData(target, shiftScopedData, defaultVesselId);
        did = true;
      }
    }
    return did;
  };

  const tryMigrateObject = <T extends { id?: string; vesselId?: string; fleetId?: string | null }>(
    target: Record<string, Record<string, T>>,
    rawData: Record<string, unknown>
  ): boolean => {
    let did = false;
    if (isShiftScopedObjectData(rawData)) {
      const shiftScopedData = rawData as unknown as Record<string, T>;
      const shiftKeys = Object.keys(shiftScopedData);
      Object.keys(target).forEach((k) => delete target[k]);
      target[defaultVesselId] = target[defaultVesselId] ?? {};
      migrateObjectData(target, shiftScopedData, defaultVesselId);
      did = true;
      console.log(`[Migration] Migrated ${shiftKeys.length} shifts to default vessel`);
    } else {
      const shiftKeys = extractShiftScopedKeys(rawData);
      if (shiftKeys.length > 0 && target[defaultVesselId]) {
        const shiftScopedData: Record<string, T> = {};
        for (const k of shiftKeys) {
          shiftScopedData[k] = (rawData as Record<string, T>)[k];
          delete target[k as keyof typeof target];
        }
        migrateObjectData(target, shiftScopedData, defaultVesselId);
        did = true;
      }
    }
    return did;
  };

  const rawRecords = targets.records as unknown as Record<string, unknown>;
  migrated = tryMigrateArray(targets.records, rawRecords) || migrated;

  const rawEngine = targets.engineRoomRecords as unknown as Record<string, unknown>;
  migrated = tryMigrateArray(targets.engineRoomRecords, rawEngine) || migrated;

  const rawAnomalies = targets.anomalyRecords as unknown as Record<string, unknown>;
  if (isShiftScopedArrayData(rawAnomalies)) {
    const shiftScopedData = rawAnomalies as unknown as Record<string, AnomalyRecord[]>;
    const shiftKeys = Object.keys(shiftScopedData);
    Object.keys(targets.anomalyRecords).forEach((k) => delete targets.anomalyRecords[k]);
    targets.anomalyRecords[defaultVesselId] = targets.anomalyRecords[defaultVesselId] ?? {};
    const migratedMap: Record<string, AnomalyRecord[]> = {};
    for (const [shiftId, arr] of Object.entries(shiftScopedData)) {
      migratedMap[shiftId] = arr.map((r) => ({
        ...migrateAnomalyRecord(r, shiftId),
        vesselId: defaultVesselId,
        fleetId: r.fleetId ?? null,
      }));
    }
    for (const [shiftId, arr] of Object.entries(migratedMap)) {
      if (targets.anomalyRecords[defaultVesselId][shiftId]) {
        targets.anomalyRecords[defaultVesselId][shiftId] = [
          ...targets.anomalyRecords[defaultVesselId][shiftId],
          ...arr,
        ];
      } else {
        targets.anomalyRecords[defaultVesselId][shiftId] = arr;
      }
    }
    migrated = true;
    console.log(`[Migration] Migrated ${shiftKeys.length} shifts of anomaly records to default vessel`);
  } else {
    const shiftKeys = extractShiftScopedKeys(rawAnomalies);
    if (shiftKeys.length > 0 && targets.anomalyRecords[defaultVesselId]) {
      for (const k of shiftKeys) {
        const arr = (rawAnomalies as Record<string, AnomalyRecord[]>)[k];
        const migratedArr = arr.map((r) => ({
          ...migrateAnomalyRecord(r, k),
          vesselId: defaultVesselId,
          fleetId: r.fleetId ?? null,
        }));
        if (targets.anomalyRecords[defaultVesselId][k]) {
          targets.anomalyRecords[defaultVesselId][k] = [
            ...targets.anomalyRecords[defaultVesselId][k],
            ...migratedArr.filter((nr) => !targets.anomalyRecords[defaultVesselId][k].some((er) => er.id === nr.id)),
          ];
        } else {
          targets.anomalyRecords[defaultVesselId][k] = migratedArr;
        }
        delete targets.anomalyRecords[k as keyof typeof targets.anomalyRecords];
      }
      migrated = true;
    }
  }

  const rawBilge = targets.bilgeWaterRecords as unknown as Record<string, unknown>;
  migrated = tryMigrateArray(targets.bilgeWaterRecords, rawBilge) || migrated;

  const rawHandover = targets.handoverSummaries as unknown as Record<string, unknown>;
  migrated = tryMigrateObject(targets.handoverSummaries, rawHandover) || migrated;

  const rawRisk = targets.riskAssessments as unknown as Record<string, unknown>;
  migrated = tryMigrateArray(targets.riskAssessments, rawRisk) || migrated;

  if (!migrated) {
    try {
      const tryLoadShiftScoped = <T>(key: string): T | null => {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object") return null;
          const isArrayType = isShiftScopedArrayData(parsed);
          const isObjectType = isShiftScopedObjectData(parsed);
          const isVesselType = isVesselScopedData(parsed);
          if ((isArrayType || isObjectType) && !isVesselType) {
            return parsed as T;
          }
        } catch {}
        return null;
      };

      const legacyRecords = tryLoadShiftScoped<Record<string, WatchRecord[]>>(storageKeys.RECORDS);
      const legacyEngine = tryLoadShiftScoped<Record<string, EngineRoomRecord[]>>(storageKeys.ENGINE_ROOM);
      const legacyAnomalies = tryLoadShiftScoped<Record<string, AnomalyRecord[]>>(storageKeys.ANOMALIES);
      const legacyBilge = tryLoadShiftScoped<Record<string, BilgeWaterRecord[]>>(storageKeys.BILGE);
      const legacyHandover = tryLoadShiftScoped<Record<string, HandoverSummary>>(storageKeys.HANDOVER);
      const legacyRisk = tryLoadShiftScoped<Record<string, RiskAssessment[]>>(storageKeys.RISK);

      if (legacyRecords) {
        migrateArrayData(targets.records, legacyRecords, defaultVesselId);
        console.log(`[Migration] Loaded legacy records from localStorage`);
      }
      if (legacyEngine) {
        migrateArrayData(targets.engineRoomRecords, legacyEngine, defaultVesselId);
      }
      if (legacyAnomalies) {
        const migratedMap: Record<string, AnomalyRecord[]> = {};
        for (const [shiftId, arr] of Object.entries(legacyAnomalies)) {
          migratedMap[shiftId] = arr.map((r) => ({
            ...migrateAnomalyRecord(r, shiftId),
            vesselId: defaultVesselId,
            fleetId: r.fleetId ?? null,
          }));
        }
        for (const [shiftId, arr] of Object.entries(migratedMap)) {
          if (targets.anomalyRecords[defaultVesselId][shiftId]) {
            targets.anomalyRecords[defaultVesselId][shiftId] = [
              ...targets.anomalyRecords[defaultVesselId][shiftId],
              ...arr.filter((nr) => !targets.anomalyRecords[defaultVesselId][shiftId].some((er) => er.id === nr.id)),
            ];
          } else {
            targets.anomalyRecords[defaultVesselId][shiftId] = arr;
          }
        }
      }
      if (legacyBilge) {
        migrateArrayData(targets.bilgeWaterRecords, legacyBilge, defaultVesselId);
      }
      if (legacyHandover) {
        migrateObjectData(targets.handoverSummaries, legacyHandover, defaultVesselId);
      }
      if (legacyRisk) {
        migrateArrayData(targets.riskAssessments, legacyRisk, defaultVesselId);
      }
    } catch (e) {
      console.warn("[Migration] Legacy key loading skipped:", e);
    }
  }

  return migrated;
}
