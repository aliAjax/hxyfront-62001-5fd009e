import {
  type WatchRecord,
  type EngineRoomRecord,
  type BilgeWaterRecord,
  type AnomalyRecord,
  type AnomalyStatus,
  type HandoverSummary,
  type ExportData,
  type ImportStrategy,
  type StatusUpdate,
  type Shift,
  type RiskAssessment,
  type Vessel,
  SHIFTS,
  SCHEMA_VERSION,
  DEFAULT_VESSEL_ID,
  generateIdempotencyKey,
  getCurrentShiftId as getDefaultCurrentShiftId,
  calculateRiskAssessment,
  migrateAnomalyRecord,
  buildHandoverStep,
  createDefaultVessel,
} from "./domain";
import {
  selectCurrentShiftActiveRecords,
  selectLatestVesselRecord,
  selectActiveAnomalyRecords,
  selectCarriedOverAnomalies as selectCarriedOver,
  selectHandoverSummary,
  selectAllActiveRecords,
  selectVesselShiftMap,
  selectActiveRecords,
  selectLatestRecord,
  selectLatestRiskAssessment,
  selectCurrentShiftLatestRiskAssessment,
  findIdempotencyKeyInVessel,
  type VesselScoped,
  type ShiftMap,
  type ShiftObject,
} from "./shiftSelectors";
import {
  buildExportData,
  buildExportDataForVessel,
  applyImport,
  migrateLoadedData,
} from "./shiftIO";
import { buildRiskCalcInput } from "./shiftDerived";

const STORAGE_KEYS = {
  SCHEMA_VERSION: "watch-schema-version",
  VESSELS: "watch-vessels",
  CURRENT_VESSEL: "watch-current-vessel",
  CURRENT_SHIFT: "watch-current-shift",
  VESSEL_CURRENT_SHIFT_PREFIX: "watch-current-shift-vessel-",
  RECORDS: "watch-records",
  ENGINE_ROOM: "engine-room-records",
  ANOMALIES: "anomaly-inspection-records",
  BILGE: "bilge-water-records",
  HANDOVER: "handover-summaries",
  RISK: "risk-assessments",
} as const;

type VesselScopedData<T> = Record<string, T>;

type RepositoryEvent =
  | "records:changed"
  | "engineRoom:changed"
  | "anomalies:changed"
  | "bilge:changed"
  | "handover:changed"
  | "risk:changed"
  | "shift:changed"
  | "vessel:changed"
  | "vessels:changed";

type EventHandler = () => void;

interface WatchRepositoryState {
  vessels: Vessel[];
  currentVesselId: string;
  currentShiftId: string;
  records: VesselScopedData<Record<string, WatchRecord[]>>;
  engineRoomRecords: VesselScopedData<Record<string, EngineRoomRecord[]>>;
  anomalyRecords: VesselScopedData<Record<string, AnomalyRecord[]>>;
  bilgeWaterRecords: VesselScopedData<Record<string, BilgeWaterRecord[]>>;
  handoverSummaries: VesselScopedData<Record<string, HandoverSummary>>;
  riskAssessments: VesselScopedData<Record<string, RiskAssessment[]>>;
}

class EventEmitter {
  private handlers: Map<RepositoryEvent, Set<EventHandler>> = new Map();

  on(event: RepositoryEvent, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  off(event: RepositoryEvent, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit(event: RepositoryEvent): void {
    this.handlers.get(event)?.forEach((h) => h());
  }
}

function getVesselShiftStorageKey(vesselId: string): string {
  return STORAGE_KEYS.VESSEL_CURRENT_SHIFT_PREFIX + vesselId;
}

class WatchRepository {
  private emitter: EventEmitter = new EventEmitter();
  private vessels: Vessel[] = [];
  private currentVesselId: string = DEFAULT_VESSEL_ID;
  private currentShiftIdPerVessel: Record<string, string> = {};
  private records: VesselScoped<ShiftMap<WatchRecord>> = {};
  private engineRoomRecords: VesselScoped<ShiftMap<EngineRoomRecord>> = {};
  private anomalyRecords: VesselScoped<ShiftMap<AnomalyRecord>> = {};
  private bilgeWaterRecords: VesselScoped<ShiftMap<BilgeWaterRecord>> = {};
  private handoverSummaries: VesselScoped<ShiftObject<HandoverSummary>> = {};
  private riskAssessments: VesselScoped<ShiftMap<RiskAssessment>> = {};

  constructor() {
    this.loadAll();
    this.checkAndMigrate();
  }

  getState(): WatchRepositoryState {
    return {
      vessels: JSON.parse(JSON.stringify(this.vessels)),
      currentVesselId: this.currentVesselId,
      currentShiftId: this.currentShiftIdPerVessel[this.currentVesselId] ?? getDefaultCurrentShiftId(),
      records: JSON.parse(JSON.stringify(this.records)),
      engineRoomRecords: JSON.parse(JSON.stringify(this.engineRoomRecords)),
      anomalyRecords: JSON.parse(JSON.stringify(this.anomalyRecords)),
      bilgeWaterRecords: JSON.parse(JSON.stringify(this.bilgeWaterRecords)),
      handoverSummaries: JSON.parse(JSON.stringify(this.handoverSummaries)),
      riskAssessments: JSON.parse(JSON.stringify(this.riskAssessments)),
    };
  }

  private getCurrentShiftIdForVessel(vesselId: string): string {
    const stored = this.currentShiftIdPerVessel[vesselId];
    if (stored && SHIFTS.some((s: Shift) => s.id === stored)) return stored;
    return getDefaultCurrentShiftId();
  }

  private ensureVesselData(vesselId: string): void {
    if (!this.records[vesselId]) this.records[vesselId] = {};
    if (!this.engineRoomRecords[vesselId]) this.engineRoomRecords[vesselId] = {};
    if (!this.anomalyRecords[vesselId]) this.anomalyRecords[vesselId] = {};
    if (!this.bilgeWaterRecords[vesselId]) this.bilgeWaterRecords[vesselId] = {};
    if (!this.handoverSummaries[vesselId]) this.handoverSummaries[vesselId] = {};
    if (!this.riskAssessments[vesselId]) this.riskAssessments[vesselId] = {};
  }

  loadAll(): void {
    this.vessels = this.safeLoad<Vessel[]>(STORAGE_KEYS.VESSELS, [createDefaultVessel()]);
    if (!this.vessels.some((v) => v.id === DEFAULT_VESSEL_ID)) {
      this.vessels = [createDefaultVessel(), ...this.vessels];
    }
    this.currentVesselId = this.safeLoad<string>(STORAGE_KEYS.CURRENT_VESSEL, DEFAULT_VESSEL_ID);
    if (!this.vessels.some((v) => v.id === this.currentVesselId)) {
      this.currentVesselId = DEFAULT_VESSEL_ID;
    }

    this.vessels.forEach((v) => {
      const shiftKey = getVesselShiftStorageKey(v.id);
      const shiftId = this.safeLoad<string>(shiftKey, getDefaultCurrentShiftId());
      this.currentShiftIdPerVessel[v.id] = shiftId;
    });

    this.records = this.safeLoad<VesselScoped<ShiftMap<WatchRecord>>>(STORAGE_KEYS.RECORDS, {});
    this.engineRoomRecords = this.safeLoad<VesselScoped<ShiftMap<EngineRoomRecord>>>(STORAGE_KEYS.ENGINE_ROOM, {});
    this.anomalyRecords = this.safeLoad<VesselScoped<ShiftMap<AnomalyRecord>>>(STORAGE_KEYS.ANOMALIES, {});
    this.bilgeWaterRecords = this.safeLoad<VesselScoped<ShiftMap<BilgeWaterRecord>>>(STORAGE_KEYS.BILGE, {});
    this.handoverSummaries = this.safeLoad<VesselScoped<ShiftObject<HandoverSummary>>>(STORAGE_KEYS.HANDOVER, {});
    this.riskAssessments = this.safeLoadWithMigration<VesselScoped<ShiftMap<RiskAssessment>>>(STORAGE_KEYS.RISK, {});

    this.vessels.forEach((v) => this.ensureVesselData(v.id));
  }

  saveAll(): void {
    this.safeSave(STORAGE_KEYS.VESSELS, this.vessels);
    this.safeSave(STORAGE_KEYS.CURRENT_VESSEL, this.currentVesselId);
    this.vessels.forEach((v) => {
      const shiftKey = getVesselShiftStorageKey(v.id);
      const shiftId = this.currentShiftIdPerVessel[v.id] ?? getDefaultCurrentShiftId();
      this.safeSave(shiftKey, shiftId);
    });
    this.safeSave(STORAGE_KEYS.RECORDS, this.records);
    this.safeSave(STORAGE_KEYS.ENGINE_ROOM, this.engineRoomRecords);
    this.safeSave(STORAGE_KEYS.ANOMALIES, this.anomalyRecords);
    this.safeSave(STORAGE_KEYS.BILGE, this.bilgeWaterRecords);
    this.safeSave(STORAGE_KEYS.HANDOVER, this.handoverSummaries);
    this.safeSave(STORAGE_KEYS.RISK, this.riskAssessments);
    this.safeSave(STORAGE_KEYS.SCHEMA_VERSION, SCHEMA_VERSION);
  }

  on(event: RepositoryEvent, handler: EventHandler): () => void {
    return this.emitter.on(event, handler);
  }

  listVessels(): Vessel[] {
    return JSON.parse(JSON.stringify(this.vessels));
  }

  getCurrentVessel(): Vessel {
    return this.vessels.find((v) => v.id === this.currentVesselId) ?? this.vessels[0];
  }

  getCurrentVesselId(): string {
    return this.currentVesselId;
  }

  setCurrentVesselId(vesselId: string): void {
    if (!this.vessels.some((v) => v.id === vesselId)) return;
    this.currentVesselId = vesselId;
    this.ensureVesselData(vesselId);
    this.safeSave(STORAGE_KEYS.CURRENT_VESSEL, vesselId);
    this.emitter.emit("vessel:changed");
    this.emitter.emit("shift:changed");
  }

  addVessel(input: { name: string; imoNumber?: string; mmsi?: string; fleetId?: string | null }): Vessel {
    const now = new Date().toISOString();
    const vessel: Vessel = {
      id: crypto.randomUUID(),
      name: input.name,
      imoNumber: input.imoNumber,
      mmsi: input.mmsi,
      fleetId: input.fleetId ?? null,
      createdAt: now,
      updatedAt: now,
      isDefault: false,
    };
    this.vessels.push(vessel);
    this.ensureVesselData(vessel.id);
    this.currentShiftIdPerVessel[vessel.id] = getDefaultCurrentShiftId();
    this.saveAll();
    this.emitter.emit("vessels:changed");
    return JSON.parse(JSON.stringify(vessel));
  }

  updateVessel(vesselId: string, patch: Partial<Omit<Vessel, "id" | "createdAt">>): Vessel | null {
    const idx = this.vessels.findIndex((v) => v.id === vesselId);
    if (idx === -1) return null;
    const now = new Date().toISOString();
    const updated: Vessel = {
      ...this.vessels[idx],
      ...patch,
      id: vesselId,
      updatedAt: now,
    };
    this.vessels[idx] = updated;
    this.saveAll();
    this.emitter.emit("vessels:changed");
    if (vesselId === this.currentVesselId) {
      this.emitter.emit("vessel:changed");
    }
    return JSON.parse(JSON.stringify(updated));
  }

  deleteVessel(vesselId: string): boolean {
    if (vesselId === DEFAULT_VESSEL_ID) return false;
    const idx = this.vessels.findIndex((v) => v.id === vesselId);
    if (idx === -1) return false;
    this.vessels.splice(idx, 1);
    delete this.records[vesselId];
    delete this.engineRoomRecords[vesselId];
    delete this.anomalyRecords[vesselId];
    delete this.bilgeWaterRecords[vesselId];
    delete this.handoverSummaries[vesselId];
    delete this.riskAssessments[vesselId];
    delete this.currentShiftIdPerVessel[vesselId];
    try {
      localStorage.removeItem(getVesselShiftStorageKey(vesselId));
    } catch {}
    if (this.currentVesselId === vesselId) {
      this.currentVesselId = DEFAULT_VESSEL_ID;
    }
    this.saveAll();
    this.emitter.emit("vessels:changed");
    this.emitter.emit("vessel:changed");
    return true;
  }

  getCurrentShiftId(): string {
    return this.getCurrentShiftIdForVessel(this.currentVesselId);
  }

  setCurrentShiftId(id: string): void {
    if (SHIFTS.some((s: Shift) => s.id === id)) {
      this.currentShiftIdPerVessel[this.currentVesselId] = id;
      const shiftKey = getVesselShiftStorageKey(this.currentVesselId);
      this.safeSave(shiftKey, id);
      this.emitter.emit("shift:changed");
    }
  }

  listRecords(shiftId?: string, vesselId?: string): WatchRecord[] {
    const vId = vesselId ?? this.currentVesselId;
    const targetShift = shiftId ?? this.getCurrentShiftIdForVessel(vId);
    return selectCurrentShiftActiveRecords(this.records, vId, targetShift);
  }

  getRecord(id: string, vesselId?: string): WatchRecord | null {
    const vId = vesselId ?? this.currentVesselId;
    const shiftMap = this.records[vId];
    if (!shiftMap) return null;
    for (const shiftId of Object.keys(shiftMap)) {
      const found = shiftMap[shiftId].find((r) => r.id === id && !r.deletedAt);
      if (found) return found;
    }
    return null;
  }

  addRecord(
    input: Omit<WatchRecord, "id" | "vesselId" | "fleetId" | "deletedAt" | "shiftId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "idempotencyKey" | "isEdited" | "editedAt" | "editedBy" | "editHistory"> & {
      shiftId: string;
      vesselId?: string;
      idempotencyKey?: string;
    }
  ): { record: WatchRecord; created: boolean } {
    const vesselId = input.vesselId ?? this.currentVesselId;
    this.ensureVesselData(vesselId);
    const now = new Date().toISOString();
    const idempotencyKey = input.idempotencyKey ?? generateIdempotencyKey();
    const shiftMap = this.records[vesselId];
    const existing = findIdempotencyKeyInVessel(shiftMap, idempotencyKey);
    if (existing) {
      return { record: existing, created: false };
    }
    const currentVessel = this.vessels.find((v) => v.id === vesselId);
    const record: WatchRecord = {
      ...input,
      id: crypto.randomUUID(),
      vesselId,
      fleetId: currentVessel?.fleetId ?? null,
      shiftId: input.shiftId,
      createdAt: now,
      createdBy: "system",
      updatedAt: now,
      updatedBy: "system",
      deletedAt: null,
      idempotencyKey,
    };
    if (!shiftMap[input.shiftId]) {
      shiftMap[input.shiftId] = [];
    }
    shiftMap[input.shiftId].push(record);
    this.safeSave(STORAGE_KEYS.RECORDS, this.records);
    this.emitter.emit("records:changed");
    return { record, created: true };
  }

  updateRecord(id: string, patch: Partial<WatchRecord>, updatedBy: string): WatchRecord | null {
    const now = new Date().toISOString();
    for (const vId of Object.keys(this.records)) {
      const shiftMap = this.records[vId];
      for (const shiftId of Object.keys(shiftMap)) {
        const idx = shiftMap[shiftId].findIndex((r) => r.id === id && !r.deletedAt);
        if (idx !== -1) {
          const original = shiftMap[shiftId][idx];
          const editHistory = original.editHistory ?? [];
          const changes: Partial<Pick<WatchRecord, "device" | "params" | "anomaly" | "status" | "handoverNote">> = {};
          (["device", "params", "anomaly", "status", "handoverNote"] as const).forEach((key) => {
            if (patch[key] !== undefined && patch[key] !== original[key]) {
              (changes as Record<string, unknown>)[key] = patch[key];
            }
          });
          const updated: WatchRecord = {
            ...original,
            ...patch,
            id: original.id,
            vesselId: original.vesselId,
            fleetId: original.fleetId,
            updatedAt: now,
            updatedBy,
            isEdited: true,
            editedAt: now,
            editedBy: updatedBy,
            editHistory: Object.keys(changes).length > 0
              ? [...editHistory, { editedAt: now, editedBy: updatedBy, changes }]
              : editHistory,
          };
          shiftMap[shiftId][idx] = updated;
          this.safeSave(STORAGE_KEYS.RECORDS, this.records);
          this.emitter.emit("records:changed");
          return updated;
        }
      }
    }
    return null;
  }

  deleteRecord(id: string, deletedBy: string): void {
    const now = new Date().toISOString();
    for (const vId of Object.keys(this.records)) {
      const shiftMap = this.records[vId];
      for (const shiftId of Object.keys(shiftMap)) {
        const idx = shiftMap[shiftId].findIndex((r) => r.id === id && !r.deletedAt);
        if (idx !== -1) {
          shiftMap[shiftId][idx] = {
            ...shiftMap[shiftId][idx],
            deletedAt: now,
          };
          this.safeSave(STORAGE_KEYS.RECORDS, this.records);
          this.emitter.emit("records:changed");
          return;
        }
      }
    }
  }

  listEngineRoomRecords(shiftId?: string, vesselId?: string): EngineRoomRecord[] {
    const vId = vesselId ?? this.currentVesselId;
    const targetShift = shiftId ?? this.getCurrentShiftIdForVessel(vId);
    return selectCurrentShiftActiveRecords(this.engineRoomRecords, vId, targetShift);
  }

  getLatestEngineRoomRecord(vesselId?: string): EngineRoomRecord | null {
    const vId = vesselId ?? this.currentVesselId;
    return selectLatestVesselRecord(this.engineRoomRecords, vId);
  }

  addEngineRoomRecord(
    input: Omit<EngineRoomRecord, "id" | "vesselId" | "fleetId" | "deletedAt" | "shiftId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "idempotencyKey" | "isEdited" | "editedAt" | "editedBy" | "editHistory"> & {
      shiftId: string;
      vesselId?: string;
      idempotencyKey?: string;
    }
  ): { record: EngineRoomRecord; created: boolean } {
    const vesselId = input.vesselId ?? this.currentVesselId;
    this.ensureVesselData(vesselId);
    const now = new Date().toISOString();
    const idempotencyKey = input.idempotencyKey ?? generateIdempotencyKey();
    const shiftMap = this.engineRoomRecords[vesselId];
    const existing = findIdempotencyKeyInVessel(shiftMap, idempotencyKey);
    if (existing) {
      return { record: existing, created: false };
    }
    const currentVessel = this.vessels.find((v) => v.id === vesselId);
    const record: EngineRoomRecord = {
      ...input,
      id: crypto.randomUUID(),
      vesselId,
      fleetId: currentVessel?.fleetId ?? null,
      shiftId: input.shiftId,
      createdAt: now,
      createdBy: "system",
      updatedAt: now,
      updatedBy: "system",
      deletedAt: null,
      idempotencyKey,
    };
    if (!shiftMap[input.shiftId]) {
      shiftMap[input.shiftId] = [];
    }
    shiftMap[input.shiftId].push(record);
    this.safeSave(STORAGE_KEYS.ENGINE_ROOM, this.engineRoomRecords);
    this.emitter.emit("engineRoom:changed");
    return { record, created: true };
  }

  updateEngineRoomRecord(id: string, patch: Partial<EngineRoomRecord>, updatedBy: string): EngineRoomRecord | null {
    const now = new Date().toISOString();
    for (const vId of Object.keys(this.engineRoomRecords)) {
      const shiftMap = this.engineRoomRecords[vId];
      for (const shiftId of Object.keys(shiftMap)) {
        const idx = shiftMap[shiftId].findIndex((r) => r.id === id && !r.deletedAt);
        if (idx !== -1) {
          const original = shiftMap[shiftId][idx];
          const editHistory = original.editHistory ?? [];
          const changes: Partial<Pick<EngineRoomRecord, "mainEngineSpeed" | "lubricatingOilPressure" | "coolingWaterTemp" | "fuelConsumption">> = {};
          (["mainEngineSpeed", "lubricatingOilPressure", "coolingWaterTemp", "fuelConsumption"] as const).forEach((key) => {
            if (patch[key] !== undefined && patch[key] !== original[key]) {
              (changes as Record<string, unknown>)[key] = patch[key];
            }
          });
          const updated: EngineRoomRecord = {
            ...original,
            ...patch,
            id: original.id,
            vesselId: original.vesselId,
            fleetId: original.fleetId,
            updatedAt: now,
            updatedBy,
            isEdited: true,
            editedAt: now,
            editedBy: updatedBy,
            editHistory: Object.keys(changes).length > 0
              ? [...editHistory, { editedAt: now, editedBy: updatedBy, changes }]
              : editHistory,
          };
          shiftMap[shiftId][idx] = updated;
          this.safeSave(STORAGE_KEYS.ENGINE_ROOM, this.engineRoomRecords);
          this.emitter.emit("engineRoom:changed");
          return updated;
        }
      }
    }
    return null;
  }

  deleteEngineRoomRecord(id: string, deletedBy: string): void {
    const now = new Date().toISOString();
    for (const vId of Object.keys(this.engineRoomRecords)) {
      const shiftMap = this.engineRoomRecords[vId];
      for (const shiftId of Object.keys(shiftMap)) {
        const idx = shiftMap[shiftId].findIndex((r) => r.id === id && !r.deletedAt);
        if (idx !== -1) {
          shiftMap[shiftId][idx] = {
            ...shiftMap[shiftId][idx],
            deletedAt: now,
          };
          this.safeSave(STORAGE_KEYS.ENGINE_ROOM, this.engineRoomRecords);
          this.emitter.emit("engineRoom:changed");
          return;
        }
      }
    }
  }

  listBilgeWaterRecords(shiftId?: string, vesselId?: string): BilgeWaterRecord[] {
    const vId = vesselId ?? this.currentVesselId;
    const targetShift = shiftId ?? this.getCurrentShiftIdForVessel(vId);
    return selectCurrentShiftActiveRecords(this.bilgeWaterRecords, vId, targetShift);
  }

  getLatestBilgeWaterRecord(vesselId?: string): BilgeWaterRecord | null {
    const vId = vesselId ?? this.currentVesselId;
    return selectLatestVesselRecord(this.bilgeWaterRecords, vId);
  }

  addBilgeWaterRecord(
    input: Omit<BilgeWaterRecord, "id" | "vesselId" | "fleetId" | "deletedAt" | "shiftId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "idempotencyKey" | "isEdited" | "editedAt" | "editedBy" | "editHistory"> & {
      shiftId: string;
      vesselId?: string;
      idempotencyKey?: string;
    }
  ): { record: BilgeWaterRecord; created: boolean } {
    const vesselId = input.vesselId ?? this.currentVesselId;
    this.ensureVesselData(vesselId);
    const now = new Date().toISOString();
    const idempotencyKey = input.idempotencyKey ?? generateIdempotencyKey();
    const shiftMap = this.bilgeWaterRecords[vesselId];
    const existing = findIdempotencyKeyInVessel(shiftMap, idempotencyKey);
    if (existing) {
      return { record: existing, created: false };
    }
    const currentVessel = this.vessels.find((v) => v.id === vesselId);
    const record: BilgeWaterRecord = {
      ...input,
      id: crypto.randomUUID(),
      vesselId,
      fleetId: currentVessel?.fleetId ?? null,
      shiftId: input.shiftId,
      createdAt: now,
      createdBy: "system",
      updatedAt: now,
      updatedBy: "system",
      deletedAt: null,
      idempotencyKey,
    };
    if (!shiftMap[input.shiftId]) {
      shiftMap[input.shiftId] = [];
    }
    shiftMap[input.shiftId].push(record);
    this.safeSave(STORAGE_KEYS.BILGE, this.bilgeWaterRecords);
    this.emitter.emit("bilge:changed");
    return { record, created: true };
  }

  updateBilgeWaterRecord(id: string, patch: Partial<BilgeWaterRecord>, updatedBy: string): BilgeWaterRecord | null {
    const now = new Date().toISOString();
    for (const vId of Object.keys(this.bilgeWaterRecords)) {
      const shiftMap = this.bilgeWaterRecords[vId];
      for (const shiftId of Object.keys(shiftMap)) {
        const idx = shiftMap[shiftId].findIndex((r) => r.id === id && !r.deletedAt);
        if (idx !== -1) {
          const original = shiftMap[shiftId][idx];
          const editHistory = original.editHistory ?? [];
          const changes: Partial<Pick<BilgeWaterRecord, "liquidLevel" | "pumpStatus" | "pumpRunDuration" | "treatmentResult" | "warningNote">> = {};
          (["liquidLevel", "pumpStatus", "pumpRunDuration", "treatmentResult", "warningNote"] as const).forEach((key) => {
            if (patch[key] !== undefined && patch[key] !== original[key]) {
              (changes as Record<string, unknown>)[key] = patch[key];
            }
          });
          const updated: BilgeWaterRecord = {
            ...original,
            ...patch,
            id: original.id,
            vesselId: original.vesselId,
            fleetId: original.fleetId,
            updatedAt: now,
            updatedBy,
            isEdited: true,
            editedAt: now,
            editedBy: updatedBy,
            editHistory: Object.keys(changes).length > 0
              ? [...editHistory, { editedAt: now, editedBy: updatedBy, changes }]
              : editHistory,
          };
          shiftMap[shiftId][idx] = updated;
          this.safeSave(STORAGE_KEYS.BILGE, this.bilgeWaterRecords);
          this.emitter.emit("bilge:changed");
          return updated;
        }
      }
    }
    return null;
  }

  deleteBilgeWaterRecord(id: string, deletedBy: string): void {
    const now = new Date().toISOString();
    for (const vId of Object.keys(this.bilgeWaterRecords)) {
      const shiftMap = this.bilgeWaterRecords[vId];
      for (const shiftId of Object.keys(shiftMap)) {
        const idx = shiftMap[shiftId].findIndex((r) => r.id === id && !r.deletedAt);
        if (idx !== -1) {
          shiftMap[shiftId][idx] = {
            ...shiftMap[shiftId][idx],
            deletedAt: now,
          };
          this.safeSave(STORAGE_KEYS.BILGE, this.bilgeWaterRecords);
          this.emitter.emit("bilge:changed");
          return;
        }
      }
    }
  }

  listAnomalyRecords(shiftId?: string, includeClosed: boolean = false, vesselId?: string): AnomalyRecord[] {
    const vId = vesselId ?? this.currentVesselId;
    const targetShift = shiftId ?? this.getCurrentShiftIdForVessel(vId);
    return selectActiveAnomalyRecords(selectVesselShiftMap(this.anomalyRecords, vId), targetShift, includeClosed);
  }

  listCarriedOverAnomalies(targetShiftId: string, vesselId?: string): AnomalyRecord[] {
    const vId = vesselId ?? this.currentVesselId;
    const shiftMap = selectVesselShiftMap(this.anomalyRecords, vId);
    return selectCarriedOver(shiftMap, targetShiftId);
  }

  addAnomalyRecord(
    input: Omit<AnomalyRecord, "id" | "vesselId" | "fleetId" | "deletedAt" | "shiftId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "idempotencyKey" | "initialStatus" | "currentStatus" | "statusHistory" | "carryOverFromShiftId" | "isCarriedOver" | "originShiftId" | "handoverPath" | "closedAtShiftId" | "closedAt" | "closedBy"> & {
      shiftId: string;
      vesselId?: string;
      status: AnomalyStatus;
      idempotencyKey?: string;
    }
  ): { record: AnomalyRecord; created: boolean } {
    const vesselId = input.vesselId ?? this.currentVesselId;
    this.ensureVesselData(vesselId);
    const now = new Date().toISOString();
    const idempotencyKey = input.idempotencyKey ?? generateIdempotencyKey();
    const shiftMap = this.anomalyRecords[vesselId];
    const existing = findIdempotencyKeyInVessel(shiftMap, idempotencyKey);
    if (existing) {
      return { record: existing, created: false };
    }
    const isClosed = input.status === "已关闭";
    const currentVessel = this.vessels.find((v) => v.id === vesselId);
    const record: AnomalyRecord = {
      ...input,
      id: crypto.randomUUID(),
      vesselId,
      fleetId: currentVessel?.fleetId ?? null,
      shiftId: input.shiftId,
      originShiftId: input.shiftId,
      initialStatus: input.status,
      currentStatus: input.status,
      statusHistory: [],
      handoverPath: [],
      carryOverFromShiftId: null,
      isCarriedOver: false,
      closedAtShiftId: isClosed ? input.shiftId : null,
      closedAt: isClosed ? now : null,
      closedBy: isClosed ? "system" : null,
      createdAt: now,
      createdBy: "system",
      updatedAt: now,
      updatedBy: "system",
      deletedAt: null,
      idempotencyKey,
    };
    if (!shiftMap[input.shiftId]) {
      shiftMap[input.shiftId] = [];
    }
    shiftMap[input.shiftId].push(record);
    this.safeSave(STORAGE_KEYS.ANOMALIES, this.anomalyRecords);
    this.emitter.emit("anomalies:changed");
    return { record, created: true };
  }

  updateAnomalyRecord(id: string, patch: Partial<AnomalyRecord>, updatedBy: string): AnomalyRecord | null {
    const now = new Date().toISOString();
    for (const vId of Object.keys(this.anomalyRecords)) {
      const shiftMap = this.anomalyRecords[vId];
      for (const shiftId of Object.keys(shiftMap)) {
        const idx = shiftMap[shiftId].findIndex((r) => r.id === id && !r.deletedAt);
        if (idx !== -1) {
          const updated: AnomalyRecord = {
            ...shiftMap[shiftId][idx],
            ...patch,
            id: shiftMap[shiftId][idx].id,
            vesselId: shiftMap[shiftId][idx].vesselId,
            fleetId: shiftMap[shiftId][idx].fleetId,
            updatedAt: now,
            updatedBy,
          };
          shiftMap[shiftId][idx] = updated;
          this.safeSave(STORAGE_KEYS.ANOMALIES, this.anomalyRecords);
          this.emitter.emit("anomalies:changed");
          return updated;
        }
      }
    }
    return null;
  }

  updateAnomalyStatus(id: string, newStatus: AnomalyStatus, note: string, updatedBy: string, vesselId?: string): AnomalyRecord | null {
    const vId = vesselId ?? this.currentVesselId;
    const targetVesselShift = this.getCurrentShiftIdForVessel(vId);
    const now = new Date().toISOString();
    const shiftMap = this.anomalyRecords[vId];
    if (!shiftMap) return null;
    for (const shiftId of Object.keys(shiftMap)) {
      const idx = shiftMap[shiftId].findIndex((r) => r.id === id && !r.deletedAt);
      if (idx !== -1) {
        const original = shiftMap[shiftId][idx];
        const isClosing = newStatus === "已关闭";
        const isReopening = original.currentStatus === "已关闭" && newStatus !== "已关闭";
        const statusUpdate: StatusUpdate = {
          id: crypto.randomUUID(),
          status: newStatus,
          note,
          shiftId: targetVesselShift,
          vesselId: vId,
          fleetId: this.vessels.find((v) => v.id === vId)?.fleetId ?? null,
          createdAt: now,
          createdBy: updatedBy,
          updatedAt: now,
          updatedBy,
          deletedAt: null,
        };
        const updated: AnomalyRecord = {
          ...original,
          currentStatus: newStatus,
          statusHistory: [...original.statusHistory, statusUpdate],
          updatedAt: now,
          updatedBy,
          closedAtShiftId: isClosing ? targetVesselShift : isReopening ? null : original.closedAtShiftId,
          closedAt: isClosing ? now : isReopening ? null : original.closedAt,
          closedBy: isClosing ? updatedBy : isReopening ? null : original.closedBy,
        };
        shiftMap[shiftId][idx] = updated;
        this.safeSave(STORAGE_KEYS.ANOMALIES, this.anomalyRecords);
        this.emitter.emit("anomalies:changed");
        return updated;
      }
    }
    return null;
  }

  carryOverAnomaliesToShift(anomalyIds: string[], targetShiftId: string, operator: string, vesselId?: string): AnomalyRecord[] {
    const vId = vesselId ?? this.currentVesselId;
    const now = new Date().toISOString();
    const carried: AnomalyRecord[] = [];
    const shiftMap = this.anomalyRecords[vId];
    if (!shiftMap) return carried;
    for (const shiftId of Object.keys(shiftMap)) {
      for (let i = 0; i < shiftMap[shiftId].length; i++) {
        const record = shiftMap[shiftId][i];
        if (anomalyIds.includes(record.id) && !record.deletedAt && record.currentStatus !== "已关闭") {
          const handoverStep = buildHandoverStep(shiftId, targetShiftId, operator);
          const updated: AnomalyRecord = {
            ...record,
            updatedAt: now,
            updatedBy: operator,
            handoverPath: [...(record.handoverPath ?? []), handoverStep],
          };
          shiftMap[shiftId][i] = updated;
          if (!shiftMap[targetShiftId]) {
            shiftMap[targetShiftId] = [];
          }
          const idempotencyKey = `carryover-${record.id}-${targetShiftId}-${now}`;
          const existsInTarget = shiftMap[targetShiftId].some(
            (r) => !r.deletedAt && r.idempotencyKey === idempotencyKey
          );
          if (!existsInTarget) {
            const currentVessel = this.vessels.find((v) => v.id === vId);
            const cloned: AnomalyRecord = {
              ...updated,
              id: crypto.randomUUID(),
              vesselId: vId,
              fleetId: currentVessel?.fleetId ?? null,
              shiftId: targetShiftId,
              carryOverFromShiftId: shiftId,
              isCarriedOver: true,
              handoverPath: [...(record.handoverPath ?? []), handoverStep],
              originShiftId: record.originShiftId ?? record.shiftId,
              createdAt: now,
              createdBy: operator,
              updatedAt: now,
              updatedBy: operator,
              idempotencyKey,
            };
            shiftMap[targetShiftId].push(cloned);
            carried.push(cloned);
          }
        }
      }
    }
    this.safeSave(STORAGE_KEYS.ANOMALIES, this.anomalyRecords);
    this.emitter.emit("anomalies:changed");
    return carried;
  }

  deleteAnomalyRecord(id: string, deletedBy: string): void {
    const now = new Date().toISOString();
    for (const vId of Object.keys(this.anomalyRecords)) {
      const shiftMap = this.anomalyRecords[vId];
      for (const shiftId of Object.keys(shiftMap)) {
        const idx = shiftMap[shiftId].findIndex((r) => r.id === id && !r.deletedAt);
        if (idx !== -1) {
          shiftMap[shiftId][idx] = {
            ...shiftMap[shiftId][idx],
            deletedAt: now,
          };
          this.safeSave(STORAGE_KEYS.ANOMALIES, this.anomalyRecords);
          this.emitter.emit("anomalies:changed");
          return;
        }
      }
    }
  }

  getHandoverSummary(shiftId: string, vesselId?: string): HandoverSummary | null {
    const vId = vesselId ?? this.currentVesselId;
    const handoverMap = this.handoverSummaries[vId] ?? {};
    return selectHandoverSummary(handoverMap, shiftId);
  }

  saveHandoverSummary(
    shiftId: string,
    input: { autoSummary: string; manualNote: string; isDraft: boolean; dataHash?: string },
    updatedBy: string,
    vesselId?: string
  ): HandoverSummary {
    const vId = vesselId ?? this.currentVesselId;
    this.ensureVesselData(vId);
    const now = new Date().toISOString();
    const existing = this.handoverSummaries[vId]?.[shiftId];
    const currentVessel = this.vessels.find((v) => v.id === vId);
    const summary: HandoverSummary = {
      id: existing?.id ?? crypto.randomUUID(),
      vesselId: vId,
      fleetId: currentVessel?.fleetId ?? null,
      shiftId,
      autoSummary: input.autoSummary,
      manualNote: input.manualNote,
      isDraft: input.isDraft,
      dataHash: input.dataHash,
      createdAt: existing?.createdAt ?? now,
      createdBy: existing?.createdBy ?? updatedBy,
      updatedAt: now,
      updatedBy,
      deletedAt: null,
    };
    if (!this.handoverSummaries[vId]) this.handoverSummaries[vId] = {};
    this.handoverSummaries[vId][shiftId] = summary;
    this.safeSave(STORAGE_KEYS.HANDOVER, this.handoverSummaries);
    this.emitter.emit("handover:changed");
    return summary;
  }

  getExportData(): ExportData {
    return buildExportData(
      this.vessels,
      this.currentVesselId,
      this.records,
      this.engineRoomRecords,
      this.anomalyRecords,
      this.bilgeWaterRecords,
      this.handoverSummaries,
      this.riskAssessments
    );
  }

  getExportDataForVessel(vesselId: string): ExportData {
    return buildExportDataForVessel(
      vesselId,
      this.vessels,
      this.records,
      this.engineRoomRecords,
      this.anomalyRecords,
      this.bilgeWaterRecords,
      this.handoverSummaries,
      this.riskAssessments
    );
  }

  applyImport(exportData: ExportData, strategy: ImportStrategy): { imported: number; conflicts: number } {
    const result = applyImport(exportData, strategy, {
      vessels: this.vessels,
      records: this.records,
      engineRoomRecords: this.engineRoomRecords,
      anomalyRecords: this.anomalyRecords,
      bilgeWaterRecords: this.bilgeWaterRecords,
      handoverSummaries: this.handoverSummaries,
      riskAssessments: this.riskAssessments,
      currentShiftIdPerVessel: this.currentShiftIdPerVessel,
      ensureVesselData: (vId: string) => this.ensureVesselData(vId),
    });

    this.saveAll();
    this.emitter.emit("vessels:changed");
    this.emitter.emit("records:changed");
    this.emitter.emit("engineRoom:changed");
    this.emitter.emit("anomalies:changed");
    this.emitter.emit("bilge:changed");
    this.emitter.emit("handover:changed");
    this.emitter.emit("risk:changed");

    return result;
  }

  listRiskAssessments(shiftId?: string, vesselId?: string): RiskAssessment[] {
    const vId = vesselId ?? this.currentVesselId;
    const targetShift = shiftId ?? this.getCurrentShiftIdForVessel(vId);
    return selectCurrentShiftActiveRecords(this.riskAssessments, vId, targetShift);
  }

  getLatestRiskAssessment(shiftId?: string, vesselId?: string): RiskAssessment | null {
    const vId = vesselId ?? this.currentVesselId;
    if (shiftId) {
      return selectCurrentShiftLatestRiskAssessment(this.riskAssessments, vId, shiftId);
    }
    const list = this.listRiskAssessments(undefined, vId);
    return selectLatestRiskAssessment(list);
  }

  getAllRiskAssessments(vesselId?: string): RiskAssessment[] {
    const vId = vesselId ?? this.currentVesselId;
    return selectAllActiveRecords(selectVesselShiftMap(this.riskAssessments, vId));
  }

  addRiskAssessment(
    input: Omit<RiskAssessment, "id" | "vesselId" | "fleetId" | "deletedAt" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"> & {
      shiftId: string;
      vesselId?: string;
    }
  ): RiskAssessment {
    const vId = input.vesselId ?? this.currentVesselId;
    this.ensureVesselData(vId);
    const now = new Date().toISOString();
    const currentVessel = this.vessels.find((v) => v.id === vId);
    const assessment: RiskAssessment = {
      ...input,
      id: crypto.randomUUID(),
      vesselId: vId,
      fleetId: currentVessel?.fleetId ?? null,
      createdAt: now,
      createdBy: "system",
      updatedAt: now,
      updatedBy: "system",
      deletedAt: null,
    };
    const shiftMap = this.riskAssessments[vId];
    if (!shiftMap[input.shiftId]) {
      shiftMap[input.shiftId] = [];
    }
    shiftMap[input.shiftId].push(assessment);
    this.safeSave(STORAGE_KEYS.RISK, this.riskAssessments);
    this.emitter.emit("risk:changed");
    return assessment;
  }

  deleteRiskAssessment(id: string, deletedBy: string): void {
    const now = new Date().toISOString();
    for (const vId of Object.keys(this.riskAssessments)) {
      const shiftMap = this.riskAssessments[vId];
      for (const shiftId of Object.keys(shiftMap)) {
        const idx = shiftMap[shiftId].findIndex((r) => r.id === id && !r.deletedAt);
        if (idx !== -1) {
          shiftMap[shiftId][idx] = {
            ...shiftMap[shiftId][idx],
            deletedAt: now,
          };
          this.safeSave(STORAGE_KEYS.RISK, this.riskAssessments);
          this.emitter.emit("risk:changed");
          return;
        }
      }
    }
  }

  calculateAndSaveRiskAssessment(shiftId?: string, vesselId?: string): RiskAssessment {
    const vId = vesselId ?? this.currentVesselId;
    const targetShift = shiftId ?? this.getCurrentShiftIdForVessel(vId);
    const shiftEngineRecords = selectCurrentShiftActiveRecords(this.engineRoomRecords, vId, targetShift);
    const shiftBilgeRecords = selectCurrentShiftActiveRecords(this.bilgeWaterRecords, vId, targetShift);
    const shiftAnomalyRecords = selectCurrentShiftActiveRecords(this.anomalyRecords, vId, targetShift);

    const calcInput = buildRiskCalcInput(targetShift, shiftEngineRecords, shiftBilgeRecords, shiftAnomalyRecords);

    const calculated = calculateRiskAssessment(calcInput);
    return this.addRiskAssessment({ ...calculated, shiftId: targetShift, vesselId: vId });
  }

  checkAndMigrate(): void {
    const storedVersion = this.safeLoad<string>(STORAGE_KEYS.SCHEMA_VERSION, "");

    const dataLooksLegacy = (): boolean => {
      const topKeys = [
        ...Object.keys(this.records),
        ...Object.keys(this.engineRoomRecords),
        ...Object.keys(this.anomalyRecords),
        ...Object.keys(this.bilgeWaterRecords),
        ...Object.keys(this.handoverSummaries),
        ...Object.keys(this.riskAssessments),
      ];
      if (topKeys.length === 0) return false;
      const hasShiftKey = topKeys.some((k) => /^\d{2}-\d{2}$/.test(k));
      return hasShiftKey;
    };

    const needsMigration = !storedVersion || storedVersion !== SCHEMA_VERSION || dataLooksLegacy();

    if (needsMigration) {
      try {
        migrateLoadedData(
          {
            records: this.records,
            engineRoomRecords: this.engineRoomRecords,
            anomalyRecords: this.anomalyRecords,
            bilgeWaterRecords: this.bilgeWaterRecords,
            handoverSummaries: this.handoverSummaries,
            riskAssessments: this.riskAssessments,
          },
          this.safeLoad.bind(this),
          STORAGE_KEYS
        );

        for (const vId of Object.keys(this.riskAssessments)) {
          const rawRisk = this.riskAssessments[vId];
          if (rawRisk && typeof rawRisk === "object" && !Array.isArray(rawRisk)) {
            for (const shiftId of Object.keys(rawRisk)) {
              const list = rawRisk[shiftId];
              if (Array.isArray(list)) {
                rawRisk[shiftId] = list.map((r) => ({
                  ...r,
                  schemaVersion: r.schemaVersion || SCHEMA_VERSION,
                  deletedAt: r.deletedAt || null,
                  vesselId: r.vesselId || vId,
                  fleetId: r.fleetId || null,
                  triggers: Array.isArray(r.triggers) ? r.triggers : [],
                  timeline: Array.isArray(r.timeline) ? r.timeline : [],
                  dataSnapshot: r.dataSnapshot || { anomalyIds: [] },
                }));
              }
            }
          }
        }

        for (const vId of Object.keys(this.anomalyRecords)) {
          const rawAnomalies = this.anomalyRecords[vId];
          if (rawAnomalies && typeof rawAnomalies === "object" && !Array.isArray(rawAnomalies)) {
            for (const shiftId of Object.keys(rawAnomalies)) {
              const list = rawAnomalies[shiftId];
              if (Array.isArray(list)) {
                rawAnomalies[shiftId] = list.map((r) => {
                  const migrated = migrateAnomalyRecord(r, shiftId);
                  return {
                    ...migrated,
                    vesselId: migrated.vesselId || vId,
                    fleetId: migrated.fleetId || null,
                  };
                });
              }
            }
          }
        }
      } catch (e) {
        console.error("Migration error:", e);
      }
      this.saveAll();
      this.safeSave(STORAGE_KEYS.SCHEMA_VERSION, SCHEMA_VERSION);
    }
  }

  private safeLoad<T>(key: string, defaultValue: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as T;
    } catch {}
    return defaultValue;
  }

  private safeLoadWithMigration<T>(key: string, defaultValue: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as T;
        return parsed;
      }
    } catch {}
    return defaultValue;
  }

  private safeSave<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }
}

let repositoryInstance: WatchRepository | null = null;

export function getRepository(): WatchRepository {
  if (!repositoryInstance) {
    repositoryInstance = new WatchRepository();
  }
  return repositoryInstance;
}

export function resetRepositoryInstance(): void {
  repositoryInstance = null;
}

export { WatchRepository };
export type { WatchRepositoryState, RepositoryEvent };
