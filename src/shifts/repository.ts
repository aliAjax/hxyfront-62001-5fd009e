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
  EXPORT_VERSION,
  DEFAULT_VESSEL_ID,
  generateIdempotencyKey,
  getCurrentShiftId as getDefaultCurrentShiftId,
  loadRiskAssessments,
  saveRiskAssessments,
  calculateRiskAssessment,
  type RiskCalculationInput,
  migrateAnomalyRecord,
  buildHandoverStep,
  loadVessels,
  saveVessels,
  loadCurrentVesselId,
  saveCurrentVesselId,
  createDefaultVessel,
} from "./domain";

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
  private records: VesselScopedData<Record<string, WatchRecord[]>> = {};
  private engineRoomRecords: VesselScopedData<Record<string, EngineRoomRecord[]>> = {};
  private anomalyRecords: VesselScopedData<Record<string, AnomalyRecord[]>> = {};
  private bilgeWaterRecords: VesselScopedData<Record<string, BilgeWaterRecord[]>> = {};
  private handoverSummaries: VesselScopedData<Record<string, HandoverSummary>> = {};
  private riskAssessments: VesselScopedData<Record<string, RiskAssessment[]>> = {};

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

    this.records = this.safeLoad<VesselScopedData<Record<string, WatchRecord[]>>>(STORAGE_KEYS.RECORDS, {});
    this.engineRoomRecords = this.safeLoad<VesselScopedData<Record<string, EngineRoomRecord[]>>>(STORAGE_KEYS.ENGINE_ROOM, {});
    this.anomalyRecords = this.safeLoad<VesselScopedData<Record<string, AnomalyRecord[]>>>(STORAGE_KEYS.ANOMALIES, {});
    this.bilgeWaterRecords = this.safeLoad<VesselScopedData<Record<string, BilgeWaterRecord[]>>>(STORAGE_KEYS.BILGE, {});
    this.handoverSummaries = this.safeLoad<VesselScopedData<Record<string, HandoverSummary>>>(STORAGE_KEYS.HANDOVER, {});
    this.riskAssessments = this.safeLoadWithMigration<VesselScopedData<Record<string, RiskAssessment[]>>>(STORAGE_KEYS.RISK, {});

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

  private getVesselRecords(vesselId: string): Record<string, WatchRecord[]> {
    return this.records[vesselId] ?? {};
  }

  listRecords(shiftId?: string, vesselId?: string): WatchRecord[] {
    const vId = vesselId ?? this.currentVesselId;
    const targetShift = shiftId ?? this.getCurrentShiftIdForVessel(vId);
    return (this.records[vId]?.[targetShift] ?? []).filter((r) => !r.deletedAt);
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
    for (const shiftId of Object.keys(shiftMap)) {
      const existing = shiftMap[shiftId].find((r) => r.idempotencyKey === idempotencyKey);
      if (existing) {
        return { record: existing, created: false };
      }
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
    return (this.engineRoomRecords[vId]?.[targetShift] ?? []).filter((r) => !r.deletedAt);
  }

  getLatestEngineRoomRecord(vesselId?: string): EngineRoomRecord | null {
    const vId = vesselId ?? this.currentVesselId;
    const shiftMap = this.engineRoomRecords[vId];
    if (!shiftMap) return null;
    const all = Object.values(shiftMap)
      .flat()
      .filter((r) => !r.deletedAt);
    if (all.length === 0) return null;
    return all.reduce((latest, record) =>
      new Date(record.createdAt) > new Date(latest.createdAt) ? record : latest
    );
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
    for (const shiftId of Object.keys(shiftMap)) {
      const existing = shiftMap[shiftId].find((r) => r.idempotencyKey === idempotencyKey);
      if (existing) {
        return { record: existing, created: false };
      }
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
    return (this.bilgeWaterRecords[vId]?.[targetShift] ?? []).filter((r) => !r.deletedAt);
  }

  getLatestBilgeWaterRecord(vesselId?: string): BilgeWaterRecord | null {
    const vId = vesselId ?? this.currentVesselId;
    const shiftMap = this.bilgeWaterRecords[vId];
    if (!shiftMap) return null;
    const all = Object.values(shiftMap)
      .flat()
      .filter((r) => !r.deletedAt);
    if (all.length === 0) return null;
    return all.reduce((latest, record) =>
      new Date(record.createdAt) > new Date(latest.createdAt) ? record : latest
    );
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
    for (const shiftId of Object.keys(shiftMap)) {
      const existing = shiftMap[shiftId].find((r) => r.idempotencyKey === idempotencyKey);
      if (existing) {
        return { record: existing, created: false };
      }
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
    return (this.anomalyRecords[vId]?.[targetShift] ?? []).filter(
      (r) => !r.deletedAt && (includeClosed || r.currentStatus !== "已关闭")
    );
  }

  listCarriedOverAnomalies(targetShiftId: string, vesselId?: string): AnomalyRecord[] {
    const vId = vesselId ?? this.currentVesselId;
    const result: AnomalyRecord[] = [];
    const shiftMap = this.anomalyRecords[vId];
    if (!shiftMap) return result;
    for (const shiftId of Object.keys(shiftMap)) {
      for (const record of shiftMap[shiftId]) {
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
    for (const shiftId of Object.keys(shiftMap)) {
      const existing = shiftMap[shiftId].find((r) => r.idempotencyKey === idempotencyKey);
      if (existing) {
        return { record: existing, created: false };
      }
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
    const summary = this.handoverSummaries[vId]?.[shiftId];
    return summary && !summary.deletedAt ? summary : null;
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
    const vesselScopedData: ExportData["vesselScopedData"] = {};
    this.vessels.forEach((v) => {
      vesselScopedData[v.id] = {
        records: JSON.parse(JSON.stringify(this.records[v.id] ?? {})),
        engineRoomRecords: JSON.parse(JSON.stringify(this.engineRoomRecords[v.id] ?? {})),
        anomalyRecords: JSON.parse(JSON.stringify(this.anomalyRecords[v.id] ?? {})),
        bilgeWaterRecords: JSON.parse(JSON.stringify(this.bilgeWaterRecords[v.id] ?? {})),
        handoverSummaries: JSON.parse(JSON.stringify(this.handoverSummaries[v.id] ?? {})),
        riskAssessments: JSON.parse(JSON.stringify(this.riskAssessments[v.id] ?? {})),
      };
    });

    const currentVesselData = vesselScopedData[this.currentVesselId] ?? {
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
      vessels: JSON.parse(JSON.stringify(this.vessels)),
      currentVesselId: this.currentVesselId,
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

  getExportDataForVessel(vesselId: string): ExportData {
    const vessel = this.vessels.find((v) => v.id === vesselId);
    const vesselsForExport = vessel ? [vessel] : [];
    return {
      version: EXPORT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      vessels: JSON.parse(JSON.stringify(vesselsForExport)),
      currentVesselId: vesselId,
      records: JSON.parse(JSON.stringify(this.records[vesselId] ?? {})),
      engineRoomRecords: JSON.parse(JSON.stringify(this.engineRoomRecords[vesselId] ?? {})),
      anomalyRecords: JSON.parse(JSON.stringify(this.anomalyRecords[vesselId] ?? {})),
      bilgeWaterRecords: JSON.parse(JSON.stringify(this.bilgeWaterRecords[vesselId] ?? {})),
      handoverSummaries: JSON.parse(JSON.stringify(this.handoverSummaries[vesselId] ?? {})),
      riskAssessments: JSON.parse(JSON.stringify(this.riskAssessments[vesselId] ?? {})),
      meta: {
        schemaVersion: SCHEMA_VERSION,
        migratedAt: new Date().toISOString(),
      },
    };
  }

  applyImport(exportData: ExportData, strategy: ImportStrategy): { imported: number; conflicts: number } {
    let imported = 0;
    let conflicts = 0;

    if (exportData.vessels && exportData.vessels.length > 0) {
      const existingVesselIds = new Set(this.vessels.map((v) => v.id));
      exportData.vessels.forEach((v) => {
        if (!existingVesselIds.has(v.id)) {
          this.vessels.push(JSON.parse(JSON.stringify(v)));
          this.ensureVesselData(v.id);
          this.currentShiftIdPerVessel[v.id] = getDefaultCurrentShiftId();
        } else {
          const idx = this.vessels.findIndex((ev) => ev.id === v.id);
          if (idx !== -1 && strategy === "overwrite") {
            this.vessels[idx] = { ...this.vessels[idx], ...v, id: this.vessels[idx].id };
          }
        }
      });
    }

    const useVesselScoped = exportData.vesselScopedData && Object.keys(exportData.vesselScopedData).length > 0;

    if (useVesselScoped) {
      Object.entries(exportData.vesselScopedData!).forEach(([vId, vData]) => {
        const existingVessel = this.vessels.find((v) => v.id === vId);
        if (!existingVessel) {
          const newVessel: Vessel = {
            id: vId,
            name: `导入船舶 (${vId.slice(0, 8)})`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            fleetId: null,
          };
          this.vessels.push(newVessel);
          this.ensureVesselData(vId);
          this.currentShiftIdPerVessel[vId] = getDefaultCurrentShiftId();
        }

        imported += this.mergeVesselShiftMap(vData.records, this.records, vId, strategy, (a, b) => {
          conflicts += a;
          imported += b;
        });
        imported += this.mergeVesselShiftMap(vData.engineRoomRecords, this.engineRoomRecords, vId, strategy, (a, b) => {
          conflicts += a;
          imported += b;
        });
        imported += this.mergeVesselShiftMap(vData.anomalyRecords, this.anomalyRecords, vId, strategy, (a, b) => {
          conflicts += a;
          imported += b;
        });
        imported += this.mergeVesselShiftMap(vData.bilgeWaterRecords, this.bilgeWaterRecords, vId, strategy, (a, b) => {
          conflicts += a;
          imported += b;
        });
        imported += this.mergeVesselShiftObject(vData.handoverSummaries, this.handoverSummaries, vId, strategy, (a, b) => {
          conflicts += a;
          imported += b;
        });
        imported += this.mergeVesselShiftMap(vData.riskAssessments, this.riskAssessments, vId, strategy, (a, b) => {
          conflicts += a;
          imported += b;
        });
      });
    }

    const targetVesselId = exportData.currentVesselId ?? DEFAULT_VESSEL_ID;
    const vesselExists = this.vessels.some((v) => v.id === targetVesselId);
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
      this.vessels.push(newVessel);
      this.ensureVesselData(targetVesselId);
      this.currentShiftIdPerVessel[targetVesselId] = getDefaultCurrentShiftId();
    }

    if (!useVesselScoped) {
      imported += this.mergeVesselShiftMap(exportData.records, this.records, targetVesselId, strategy, (a, b) => {
        conflicts += a;
        imported += b;
      });
      imported += this.mergeVesselShiftMap(exportData.engineRoomRecords, this.engineRoomRecords, targetVesselId, strategy, (a, b) => {
        conflicts += a;
        imported += b;
      });
      imported += this.mergeVesselShiftMap(exportData.anomalyRecords, this.anomalyRecords, targetVesselId, strategy, (a, b) => {
        conflicts += a;
        imported += b;
      });
      imported += this.mergeVesselShiftMap(exportData.bilgeWaterRecords, this.bilgeWaterRecords, targetVesselId, strategy, (a, b) => {
        conflicts += a;
        imported += b;
      });
      imported += this.mergeVesselShiftObject(exportData.handoverSummaries, this.handoverSummaries, targetVesselId, strategy, (a, b) => {
        conflicts += a;
        imported += b;
      });
      if (exportData.riskAssessments) {
        imported += this.mergeVesselShiftMap(exportData.riskAssessments, this.riskAssessments, targetVesselId, strategy, (a, b) => {
          conflicts += a;
          imported += b;
        });
      }
    }

    this.saveAll();
    this.emitter.emit("vessels:changed");
    this.emitter.emit("records:changed");
    this.emitter.emit("engineRoom:changed");
    this.emitter.emit("anomalies:changed");
    this.emitter.emit("bilge:changed");
    this.emitter.emit("handover:changed");
    this.emitter.emit("risk:changed");

    return { imported, conflicts };
  }

  private mergeVesselShiftMap<T extends { id: string }>(
    importedData: Record<string, T[]>,
    target: VesselScopedData<Record<string, T[]>>,
    vesselId: string,
    strategy: ImportStrategy,
    report: (conflicts: number, imported: number) => void
  ): number {
    this.ensureVesselData(vesselId);
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

  private mergeVesselShiftObject<T extends { id: string }>(
    importedData: Record<string, T>,
    target: VesselScopedData<Record<string, T>>,
    vesselId: string,
    strategy: ImportStrategy,
    report: (conflicts: number, imported: number) => void
  ): number {
    this.ensureVesselData(vesselId);
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

  listRiskAssessments(shiftId?: string, vesselId?: string): RiskAssessment[] {
    const vId = vesselId ?? this.currentVesselId;
    const targetShift = shiftId ?? this.getCurrentShiftIdForVessel(vId);
    return (this.riskAssessments[vId]?.[targetShift] ?? []).filter((r) => !r.deletedAt);
  }

  getLatestRiskAssessment(shiftId?: string, vesselId?: string): RiskAssessment | null {
    const list = this.listRiskAssessments(shiftId, vesselId);
    if (list.length === 0) return null;
    return list.reduce((latest, r) =>
      new Date(r.calculatedAt) > new Date(latest.calculatedAt) ? r : latest
    );
  }

  getAllRiskAssessments(vesselId?: string): RiskAssessment[] {
    const vId = vesselId ?? this.currentVesselId;
    const shiftMap = this.riskAssessments[vId];
    if (!shiftMap) return [];
    return Object.values(shiftMap)
      .flat()
      .filter((r) => !r.deletedAt);
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
    const shiftEngineRecords = (this.engineRoomRecords[vId]?.[targetShift] ?? []).filter((r) => !r.deletedAt);
    const shiftBilgeRecords = (this.bilgeWaterRecords[vId]?.[targetShift] ?? []).filter((r) => !r.deletedAt);
    const shiftAnomalyRecords = (this.anomalyRecords[vId]?.[targetShift] ?? []).filter((r) => !r.deletedAt);

    const latestEngine = shiftEngineRecords.length > 0
      ? shiftEngineRecords.reduce((a, b) => (new Date(a.createdAt) > new Date(b.createdAt) ? a : b))
      : null;
    const latestBilge = shiftBilgeRecords.length > 0
      ? shiftBilgeRecords.reduce((a, b) => (new Date(a.createdAt) > new Date(b.createdAt) ? a : b))
      : null;

    const calcInput: RiskCalculationInput = {
      shiftId: targetShift,
      engineRoomRecord: latestEngine,
      bilgeWaterRecord: latestBilge,
      anomalyRecords: shiftAnomalyRecords,
      engineRoomRecords: shiftEngineRecords,
      bilgeWaterRecords: shiftBilgeRecords,
    };

    const calculated = calculateRiskAssessment(calcInput);
    return this.addRiskAssessment({ ...calculated, shiftId: targetShift, vesselId: vId });
  }

  checkAndMigrate(): void {
    const storedVersion = this.safeLoad<string>(STORAGE_KEYS.SCHEMA_VERSION, "");
    if (!storedVersion || storedVersion !== SCHEMA_VERSION) {
      try {
        this.migrateFromLegacyFormat();

        for (const vId of Object.keys(this.riskAssessments)) {
          const rawRisk = this.riskAssessments[vId];
          if (rawRisk && typeof rawRisk === "object") {
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
          if (rawAnomalies && typeof rawAnomalies === "object") {
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

  private migrateFromLegacyFormat(): void {
    try {
      const LEGACY_KEYS = {
        RECORDS: "watch-records",
        ENGINE_ROOM: "engine-room-records",
        ANOMALIES: "anomaly-inspection-records",
        BILGE: "bilge-water-records",
        HANDOVER: "handover-summaries",
        RISK: "risk-assessments",
      };

      const tryLoadLegacy = <T>(key: string): T | null => {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            const keys = Object.keys(parsed);
            const isVesselScoped = keys.every((k) => {
              const val = parsed[k];
              return typeof val === "object" && val !== null && !Array.isArray(val);
            });
            const isShiftScoped = keys.length > 0 && Object.values(parsed).every((v: unknown) => Array.isArray(v) || (typeof v === "object" && v !== null && !(v as Record<string, unknown>).id === undefined));
            if (isShiftScoped && !isVesselScoped) {
              return parsed as T;
            }
          }
        } catch {}
        return null;
      };

      const legacyRecords = tryLoadLegacy<Record<string, WatchRecord[]>>(LEGACY_KEYS.RECORDS);
      const legacyEngine = tryLoadLegacy<Record<string, EngineRoomRecord[]>>(LEGACY_KEYS.ENGINE_ROOM);
      const legacyAnomalies = tryLoadLegacy<Record<string, AnomalyRecord[]>>(LEGACY_KEYS.ANOMALIES);
      const legacyBilge = tryLoadLegacy<Record<string, BilgeWaterRecord[]>>(LEGACY_KEYS.BILGE);
      const legacyHandover = tryLoadLegacy<Record<string, HandoverSummary>>(LEGACY_KEYS.HANDOVER);
      const legacyRisk = tryLoadLegacy<Record<string, RiskAssessment[]>>(LEGACY_KEYS.RISK);

      const hasLegacy = legacyRecords || legacyEngine || legacyAnomalies || legacyBilge || legacyHandover || legacyRisk;
      if (!hasLegacy) return;

      const currentVesselIsDefaultOnly =
        Object.keys(this.records).length === 0 &&
        Object.keys(this.engineRoomRecords).length === 0 &&
        Object.keys(this.anomalyRecords).length === 0 &&
        Object.keys(this.bilgeWaterRecords).length === 0 &&
        Object.keys(this.handoverSummaries).length === 0 &&
        Object.keys(this.riskAssessments).length === 0;

      if (currentVesselIsDefaultOnly) {
        this.ensureVesselData(DEFAULT_VESSEL_ID);
        if (legacyRecords) {
          Object.entries(legacyRecords).forEach(([shiftId, arr]) => {
            const migratedArr = arr.map((r) => ({
              ...r,
              vesselId: DEFAULT_VESSEL_ID,
              fleetId: r.fleetId ?? null,
            }));
            if (this.records[DEFAULT_VESSEL_ID][shiftId]) {
              this.records[DEFAULT_VESSEL_ID][shiftId] = [
                ...this.records[DEFAULT_VESSEL_ID][shiftId],
                ...migratedArr.filter((nr) => !this.records[DEFAULT_VESSEL_ID][shiftId].some((er) => er.id === nr.id)),
              ];
            } else {
              this.records[DEFAULT_VESSEL_ID][shiftId] = migratedArr;
            }
          });
        }
        if (legacyEngine) {
          Object.entries(legacyEngine).forEach(([shiftId, arr]) => {
            const migratedArr = arr.map((r) => ({
              ...r,
              vesselId: DEFAULT_VESSEL_ID,
              fleetId: r.fleetId ?? null,
            }));
            if (this.engineRoomRecords[DEFAULT_VESSEL_ID][shiftId]) {
              this.engineRoomRecords[DEFAULT_VESSEL_ID][shiftId] = [
                ...this.engineRoomRecords[DEFAULT_VESSEL_ID][shiftId],
                ...migratedArr.filter((nr) => !this.engineRoomRecords[DEFAULT_VESSEL_ID][shiftId].some((er) => er.id === nr.id)),
              ];
            } else {
              this.engineRoomRecords[DEFAULT_VESSEL_ID][shiftId] = migratedArr;
            }
          });
        }
        if (legacyAnomalies) {
          Object.entries(legacyAnomalies).forEach(([shiftId, arr]) => {
            const migratedArr = arr.map((r) => ({
              ...migrateAnomalyRecord(r, shiftId),
              vesselId: DEFAULT_VESSEL_ID,
              fleetId: r.fleetId ?? null,
            }));
            if (this.anomalyRecords[DEFAULT_VESSEL_ID][shiftId]) {
              this.anomalyRecords[DEFAULT_VESSEL_ID][shiftId] = [
                ...this.anomalyRecords[DEFAULT_VESSEL_ID][shiftId],
                ...migratedArr.filter((nr) => !this.anomalyRecords[DEFAULT_VESSEL_ID][shiftId].some((er) => er.id === nr.id)),
              ];
            } else {
              this.anomalyRecords[DEFAULT_VESSEL_ID][shiftId] = migratedArr;
            }
          });
        }
        if (legacyBilge) {
          Object.entries(legacyBilge).forEach(([shiftId, arr]) => {
            const migratedArr = arr.map((r) => ({
              ...r,
              vesselId: DEFAULT_VESSEL_ID,
              fleetId: r.fleetId ?? null,
            }));
            if (this.bilgeWaterRecords[DEFAULT_VESSEL_ID][shiftId]) {
              this.bilgeWaterRecords[DEFAULT_VESSEL_ID][shiftId] = [
                ...this.bilgeWaterRecords[DEFAULT_VESSEL_ID][shiftId],
                ...migratedArr.filter((nr) => !this.bilgeWaterRecords[DEFAULT_VESSEL_ID][shiftId].some((er) => er.id === nr.id)),
              ];
            } else {
              this.bilgeWaterRecords[DEFAULT_VESSEL_ID][shiftId] = migratedArr;
            }
          });
        }
        if (legacyHandover) {
          Object.entries(legacyHandover).forEach(([shiftId, summary]) => {
            if (!this.handoverSummaries[DEFAULT_VESSEL_ID][shiftId]) {
              this.handoverSummaries[DEFAULT_VESSEL_ID][shiftId] = {
                ...summary,
                vesselId: DEFAULT_VESSEL_ID,
                fleetId: summary.fleetId ?? null,
              };
            }
          });
        }
        if (legacyRisk) {
          Object.entries(legacyRisk).forEach(([shiftId, arr]) => {
            const migratedArr = arr.map((r) => ({
              ...r,
              vesselId: DEFAULT_VESSEL_ID,
              fleetId: r.fleetId ?? null,
            }));
            if (this.riskAssessments[DEFAULT_VESSEL_ID][shiftId]) {
              this.riskAssessments[DEFAULT_VESSEL_ID][shiftId] = [
                ...this.riskAssessments[DEFAULT_VESSEL_ID][shiftId],
                ...migratedArr.filter((nr) => !this.riskAssessments[DEFAULT_VESSEL_ID][shiftId].some((er) => er.id === nr.id)),
              ];
            } else {
              this.riskAssessments[DEFAULT_VESSEL_ID][shiftId] = migratedArr;
            }
          });
        }
      }
    } catch {}
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

export { WatchRepository };
export type { WatchRepositoryState, RepositoryEvent };
