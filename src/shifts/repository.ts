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
  SHIFTS,
  SCHEMA_VERSION,
  EXPORT_VERSION,
  generateIdempotencyKey,
  getCurrentShiftId as getDefaultCurrentShiftId,
  loadRiskAssessments,
  saveRiskAssessments,
  calculateRiskAssessment,
  type RiskCalculationInput,
  migrateAnomalyRecord,
  buildHandoverStep,
} from "./domain";

const STORAGE_KEYS = {
  SCHEMA_VERSION: "watch-schema-version",
  CURRENT_SHIFT: "watch-current-shift",
  RECORDS: "watch-records",
  ENGINE_ROOM: "engine-room-records",
  ANOMALIES: "anomaly-inspection-records",
  BILGE: "bilge-water-records",
  HANDOVER: "handover-summaries",
  RISK: "risk-assessments",
} as const;

type RepositoryEvent =
  | "records:changed"
  | "engineRoom:changed"
  | "anomalies:changed"
  | "bilge:changed"
  | "handover:changed"
  | "risk:changed"
  | "shift:changed";

type EventHandler = () => void;

interface WatchRepositoryState {
  currentShiftId: string;
  records: Record<string, WatchRecord[]>;
  engineRoomRecords: Record<string, EngineRoomRecord[]>;
  anomalyRecords: Record<string, AnomalyRecord[]>;
  bilgeWaterRecords: Record<string, BilgeWaterRecord[]>;
  handoverSummaries: Record<string, HandoverSummary>;
  riskAssessments: Record<string, RiskAssessment[]>;
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

class WatchRepository {
  private emitter: EventEmitter = new EventEmitter();
  private currentShiftId: string = "";
  private records: Record<string, WatchRecord[]> = {};
  private engineRoomRecords: Record<string, EngineRoomRecord[]> = {};
  private anomalyRecords: Record<string, AnomalyRecord[]> = {};
  private bilgeWaterRecords: Record<string, BilgeWaterRecord[]> = {};
  private handoverSummaries: Record<string, HandoverSummary> = {};
  private riskAssessments: Record<string, RiskAssessment[]> = {};

  constructor() {
    this.loadAll();
    this.checkAndMigrate();
  }

  getState(): WatchRepositoryState {
    return {
      currentShiftId: this.currentShiftId,
      records: JSON.parse(JSON.stringify(this.records)),
      engineRoomRecords: JSON.parse(JSON.stringify(this.engineRoomRecords)),
      anomalyRecords: JSON.parse(JSON.stringify(this.anomalyRecords)),
      bilgeWaterRecords: JSON.parse(JSON.stringify(this.bilgeWaterRecords)),
      handoverSummaries: JSON.parse(JSON.stringify(this.handoverSummaries)),
      riskAssessments: JSON.parse(JSON.stringify(this.riskAssessments)),
    };
  }

  loadAll(): void {
    this.currentShiftId = this.loadCurrentShiftId();
    this.records = this.safeLoad<Record<string, WatchRecord[]>>(STORAGE_KEYS.RECORDS, {});
    this.engineRoomRecords = this.safeLoad<Record<string, EngineRoomRecord[]>>(STORAGE_KEYS.ENGINE_ROOM, {});
    this.anomalyRecords = this.safeLoad<Record<string, AnomalyRecord[]>>(STORAGE_KEYS.ANOMALIES, {});
    this.bilgeWaterRecords = this.safeLoad<Record<string, BilgeWaterRecord[]>>(STORAGE_KEYS.BILGE, {});
    this.handoverSummaries = this.safeLoad<Record<string, HandoverSummary>>(STORAGE_KEYS.HANDOVER, {});
    this.riskAssessments = this.safeLoadWithMigration<Record<string, RiskAssessment[]>>(STORAGE_KEYS.RISK, {});
  }

  saveAll(): void {
    this.safeSave(STORAGE_KEYS.RECORDS, this.records);
    this.safeSave(STORAGE_KEYS.ENGINE_ROOM, this.engineRoomRecords);
    this.safeSave(STORAGE_KEYS.ANOMALIES, this.anomalyRecords);
    this.safeSave(STORAGE_KEYS.BILGE, this.bilgeWaterRecords);
    this.safeSave(STORAGE_KEYS.HANDOVER, this.handoverSummaries);
    this.safeSave(STORAGE_KEYS.RISK, this.riskAssessments);
    this.safeSave(STORAGE_KEYS.CURRENT_SHIFT, this.currentShiftId);
    this.safeSave(STORAGE_KEYS.SCHEMA_VERSION, SCHEMA_VERSION);
  }

  on(event: RepositoryEvent, handler: EventHandler): () => void {
    return this.emitter.on(event, handler);
  }

  getCurrentShiftId(): string {
    return this.currentShiftId;
  }

  setCurrentShiftId(id: string): void {
    if (SHIFTS.some((s: Shift) => s.id === id)) {
      this.currentShiftId = id;
      this.safeSave(STORAGE_KEYS.CURRENT_SHIFT, id);
      this.emitter.emit("shift:changed");
    }
  }

  listRecords(shiftId?: string): WatchRecord[] {
    const targetShift = shiftId ?? this.currentShiftId;
    return (this.records[targetShift] ?? []).filter((r) => !r.deletedAt);
  }

  getRecord(id: string): WatchRecord | null {
    for (const shiftId of Object.keys(this.records)) {
      const found = this.records[shiftId].find((r) => r.id === id && !r.deletedAt);
      if (found) return found;
    }
    return null;
  }

  addRecord(
    input: Omit<WatchRecord, "id" | "vesselId" | "fleetId" | "deletedAt" | "shiftId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "idempotencyKey" | "isEdited" | "editedAt" | "editedBy" | "editHistory"> & {
      shiftId: string;
      idempotencyKey?: string;
    }
  ): { record: WatchRecord; created: boolean } {
    const now = new Date().toISOString();
    const idempotencyKey = input.idempotencyKey ?? generateIdempotencyKey();
    for (const shiftId of Object.keys(this.records)) {
      const existing = this.records[shiftId].find((r) => r.idempotencyKey === idempotencyKey);
      if (existing) {
        return { record: existing, created: false };
      }
    }
    const record: WatchRecord = {
      ...input,
      id: crypto.randomUUID(),
      vesselId: null,
      fleetId: null,
      shiftId: input.shiftId,
      createdAt: now,
      createdBy: "system",
      updatedAt: now,
      updatedBy: "system",
      deletedAt: null,
      idempotencyKey,
    };
    if (!this.records[input.shiftId]) {
      this.records[input.shiftId] = [];
    }
    this.records[input.shiftId].push(record);
    this.safeSave(STORAGE_KEYS.RECORDS, this.records);
    this.emitter.emit("records:changed");
    return { record, created: true };
  }

  updateRecord(id: string, patch: Partial<WatchRecord>, updatedBy: string): WatchRecord | null {
    const now = new Date().toISOString();
    for (const shiftId of Object.keys(this.records)) {
      const idx = this.records[shiftId].findIndex((r) => r.id === id && !r.deletedAt);
      if (idx !== -1) {
        const original = this.records[shiftId][idx];
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
          updatedAt: now,
          updatedBy,
          isEdited: true,
          editedAt: now,
          editedBy: updatedBy,
          editHistory: Object.keys(changes).length > 0
            ? [...editHistory, { editedAt: now, editedBy: updatedBy, changes }]
            : editHistory,
        };
        this.records[shiftId][idx] = updated;
        this.safeSave(STORAGE_KEYS.RECORDS, this.records);
        this.emitter.emit("records:changed");
        return updated;
      }
    }
    return null;
  }

  deleteRecord(id: string, deletedBy: string): void {
    const now = new Date().toISOString();
    for (const shiftId of Object.keys(this.records)) {
      const idx = this.records[shiftId].findIndex((r) => r.id === id && !r.deletedAt);
      if (idx !== -1) {
        this.records[shiftId][idx] = {
          ...this.records[shiftId][idx],
          deletedAt: now,
        };
        this.safeSave(STORAGE_KEYS.RECORDS, this.records);
        this.emitter.emit("records:changed");
        return;
      }
    }
  }

  listEngineRoomRecords(shiftId?: string): EngineRoomRecord[] {
    const targetShift = shiftId ?? this.currentShiftId;
    return (this.engineRoomRecords[targetShift] ?? []).filter((r) => !r.deletedAt);
  }

  getLatestEngineRoomRecord(): EngineRoomRecord | null {
    const all = Object.values(this.engineRoomRecords)
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
      idempotencyKey?: string;
    }
  ): { record: EngineRoomRecord; created: boolean } {
    const now = new Date().toISOString();
    const idempotencyKey = input.idempotencyKey ?? generateIdempotencyKey();
    for (const shiftId of Object.keys(this.engineRoomRecords)) {
      const existing = this.engineRoomRecords[shiftId].find((r) => r.idempotencyKey === idempotencyKey);
      if (existing) {
        return { record: existing, created: false };
      }
    }
    const record: EngineRoomRecord = {
      ...input,
      id: crypto.randomUUID(),
      vesselId: null,
      fleetId: null,
      shiftId: input.shiftId,
      createdAt: now,
      createdBy: "system",
      updatedAt: now,
      updatedBy: "system",
      deletedAt: null,
      idempotencyKey,
    };
    if (!this.engineRoomRecords[input.shiftId]) {
      this.engineRoomRecords[input.shiftId] = [];
    }
    this.engineRoomRecords[input.shiftId].push(record);
    this.safeSave(STORAGE_KEYS.ENGINE_ROOM, this.engineRoomRecords);
    this.emitter.emit("engineRoom:changed");
    return { record, created: true };
  }

  updateEngineRoomRecord(id: string, patch: Partial<EngineRoomRecord>, updatedBy: string): EngineRoomRecord | null {
    const now = new Date().toISOString();
    for (const shiftId of Object.keys(this.engineRoomRecords)) {
      const idx = this.engineRoomRecords[shiftId].findIndex((r) => r.id === id && !r.deletedAt);
      if (idx !== -1) {
        const original = this.engineRoomRecords[shiftId][idx];
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
          updatedAt: now,
          updatedBy,
          isEdited: true,
          editedAt: now,
          editedBy: updatedBy,
          editHistory: Object.keys(changes).length > 0
            ? [...editHistory, { editedAt: now, editedBy: updatedBy, changes }]
            : editHistory,
        };
        this.engineRoomRecords[shiftId][idx] = updated;
        this.safeSave(STORAGE_KEYS.ENGINE_ROOM, this.engineRoomRecords);
        this.emitter.emit("engineRoom:changed");
        return updated;
      }
    }
    return null;
  }

  deleteEngineRoomRecord(id: string, deletedBy: string): void {
    const now = new Date().toISOString();
    for (const shiftId of Object.keys(this.engineRoomRecords)) {
      const idx = this.engineRoomRecords[shiftId].findIndex((r) => r.id === id && !r.deletedAt);
      if (idx !== -1) {
        this.engineRoomRecords[shiftId][idx] = {
          ...this.engineRoomRecords[shiftId][idx],
          deletedAt: now,
        };
        this.safeSave(STORAGE_KEYS.ENGINE_ROOM, this.engineRoomRecords);
        this.emitter.emit("engineRoom:changed");
        return;
      }
    }
  }

  listBilgeWaterRecords(shiftId?: string): BilgeWaterRecord[] {
    const targetShift = shiftId ?? this.currentShiftId;
    return (this.bilgeWaterRecords[targetShift] ?? []).filter((r) => !r.deletedAt);
  }

  getLatestBilgeWaterRecord(): BilgeWaterRecord | null {
    const all = Object.values(this.bilgeWaterRecords)
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
      idempotencyKey?: string;
    }
  ): { record: BilgeWaterRecord; created: boolean } {
    const now = new Date().toISOString();
    const idempotencyKey = input.idempotencyKey ?? generateIdempotencyKey();
    for (const shiftId of Object.keys(this.bilgeWaterRecords)) {
      const existing = this.bilgeWaterRecords[shiftId].find((r) => r.idempotencyKey === idempotencyKey);
      if (existing) {
        return { record: existing, created: false };
      }
    }
    const record: BilgeWaterRecord = {
      ...input,
      id: crypto.randomUUID(),
      vesselId: null,
      fleetId: null,
      shiftId: input.shiftId,
      createdAt: now,
      createdBy: "system",
      updatedAt: now,
      updatedBy: "system",
      deletedAt: null,
      idempotencyKey,
    };
    if (!this.bilgeWaterRecords[input.shiftId]) {
      this.bilgeWaterRecords[input.shiftId] = [];
    }
    this.bilgeWaterRecords[input.shiftId].push(record);
    this.safeSave(STORAGE_KEYS.BILGE, this.bilgeWaterRecords);
    this.emitter.emit("bilge:changed");
    return { record, created: true };
  }

  updateBilgeWaterRecord(id: string, patch: Partial<BilgeWaterRecord>, updatedBy: string): BilgeWaterRecord | null {
    const now = new Date().toISOString();
    for (const shiftId of Object.keys(this.bilgeWaterRecords)) {
      const idx = this.bilgeWaterRecords[shiftId].findIndex((r) => r.id === id && !r.deletedAt);
      if (idx !== -1) {
        const original = this.bilgeWaterRecords[shiftId][idx];
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
          updatedAt: now,
          updatedBy,
          isEdited: true,
          editedAt: now,
          editedBy: updatedBy,
          editHistory: Object.keys(changes).length > 0
            ? [...editHistory, { editedAt: now, editedBy: updatedBy, changes }]
            : editHistory,
        };
        this.bilgeWaterRecords[shiftId][idx] = updated;
        this.safeSave(STORAGE_KEYS.BILGE, this.bilgeWaterRecords);
        this.emitter.emit("bilge:changed");
        return updated;
      }
    }
    return null;
  }

  deleteBilgeWaterRecord(id: string, deletedBy: string): void {
    const now = new Date().toISOString();
    for (const shiftId of Object.keys(this.bilgeWaterRecords)) {
      const idx = this.bilgeWaterRecords[shiftId].findIndex((r) => r.id === id && !r.deletedAt);
      if (idx !== -1) {
        this.bilgeWaterRecords[shiftId][idx] = {
          ...this.bilgeWaterRecords[shiftId][idx],
          deletedAt: now,
        };
        this.safeSave(STORAGE_KEYS.BILGE, this.bilgeWaterRecords);
        this.emitter.emit("bilge:changed");
        return;
      }
    }
  }

  listAnomalyRecords(shiftId?: string, includeClosed: boolean = false): AnomalyRecord[] {
    const targetShift = shiftId ?? this.currentShiftId;
    return (this.anomalyRecords[targetShift] ?? []).filter(
      (r) => !r.deletedAt && (includeClosed || r.currentStatus !== "已关闭")
    );
  }

  listCarriedOverAnomalies(targetShiftId: string): AnomalyRecord[] {
    const result: AnomalyRecord[] = [];
    for (const shiftId of Object.keys(this.anomalyRecords)) {
      for (const record of this.anomalyRecords[shiftId]) {
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
      status: AnomalyStatus;
      idempotencyKey?: string;
    }
  ): { record: AnomalyRecord; created: boolean } {
    const now = new Date().toISOString();
    const idempotencyKey = input.idempotencyKey ?? generateIdempotencyKey();
    for (const shiftId of Object.keys(this.anomalyRecords)) {
      const existing = this.anomalyRecords[shiftId].find((r) => r.idempotencyKey === idempotencyKey);
      if (existing) {
        return { record: existing, created: false };
      }
    }
    const isClosed = input.status === "已关闭";
    const record: AnomalyRecord = {
      ...input,
      id: crypto.randomUUID(),
      vesselId: null,
      fleetId: null,
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
    if (!this.anomalyRecords[input.shiftId]) {
      this.anomalyRecords[input.shiftId] = [];
    }
    this.anomalyRecords[input.shiftId].push(record);
    this.safeSave(STORAGE_KEYS.ANOMALIES, this.anomalyRecords);
    this.emitter.emit("anomalies:changed");
    return { record, created: true };
  }

  updateAnomalyRecord(id: string, patch: Partial<AnomalyRecord>, updatedBy: string): AnomalyRecord | null {
    const now = new Date().toISOString();
    for (const shiftId of Object.keys(this.anomalyRecords)) {
      const idx = this.anomalyRecords[shiftId].findIndex((r) => r.id === id && !r.deletedAt);
      if (idx !== -1) {
        const updated: AnomalyRecord = {
          ...this.anomalyRecords[shiftId][idx],
          ...patch,
          id: this.anomalyRecords[shiftId][idx].id,
          updatedAt: now,
          updatedBy,
        };
        this.anomalyRecords[shiftId][idx] = updated;
        this.safeSave(STORAGE_KEYS.ANOMALIES, this.anomalyRecords);
        this.emitter.emit("anomalies:changed");
        return updated;
      }
    }
    return null;
  }

  updateAnomalyStatus(id: string, newStatus: AnomalyStatus, note: string, updatedBy: string): AnomalyRecord | null {
    const now = new Date().toISOString();
    for (const shiftId of Object.keys(this.anomalyRecords)) {
      const idx = this.anomalyRecords[shiftId].findIndex((r) => r.id === id && !r.deletedAt);
      if (idx !== -1) {
        const original = this.anomalyRecords[shiftId][idx];
        const isClosing = newStatus === "已关闭";
        const isReopening = original.currentStatus === "已关闭" && newStatus !== "已关闭";
        const statusUpdate: StatusUpdate = {
          id: crypto.randomUUID(),
          status: newStatus,
          note,
          shiftId: this.currentShiftId,
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
          closedAtShiftId: isClosing ? this.currentShiftId : isReopening ? null : original.closedAtShiftId,
          closedAt: isClosing ? now : isReopening ? null : original.closedAt,
          closedBy: isClosing ? updatedBy : isReopening ? null : original.closedBy,
        };
        this.anomalyRecords[shiftId][idx] = updated;
        this.safeSave(STORAGE_KEYS.ANOMALIES, this.anomalyRecords);
        this.emitter.emit("anomalies:changed");
        return updated;
      }
    }
    return null;
  }

  carryOverAnomaliesToShift(anomalyIds: string[], targetShiftId: string, operator: string): AnomalyRecord[] {
    const now = new Date().toISOString();
    const carried: AnomalyRecord[] = [];
    for (const shiftId of Object.keys(this.anomalyRecords)) {
      for (let i = 0; i < this.anomalyRecords[shiftId].length; i++) {
        const record = this.anomalyRecords[shiftId][i];
        if (anomalyIds.includes(record.id) && !record.deletedAt && record.currentStatus !== "已关闭") {
          const handoverStep = buildHandoverStep(shiftId, targetShiftId, operator);
          const updated: AnomalyRecord = {
            ...record,
            updatedAt: now,
            updatedBy: operator,
            handoverPath: [...(record.handoverPath ?? []), handoverStep],
          };
          this.anomalyRecords[shiftId][i] = updated;
          if (!this.anomalyRecords[targetShiftId]) {
            this.anomalyRecords[targetShiftId] = [];
          }
          const idempotencyKey = `carryover-${record.id}-${targetShiftId}-${now}`;
          const existsInTarget = this.anomalyRecords[targetShiftId].some(
            (r) => !r.deletedAt && r.idempotencyKey === idempotencyKey
          );
          if (!existsInTarget) {
            const cloned: AnomalyRecord = {
              ...updated,
              id: crypto.randomUUID(),
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
            this.anomalyRecords[targetShiftId].push(cloned);
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
    for (const shiftId of Object.keys(this.anomalyRecords)) {
      const idx = this.anomalyRecords[shiftId].findIndex((r) => r.id === id && !r.deletedAt);
      if (idx !== -1) {
        this.anomalyRecords[shiftId][idx] = {
          ...this.anomalyRecords[shiftId][idx],
          deletedAt: now,
        };
        this.safeSave(STORAGE_KEYS.ANOMALIES, this.anomalyRecords);
        this.emitter.emit("anomalies:changed");
        return;
      }
    }
  }

  getHandoverSummary(shiftId: string): HandoverSummary | null {
    const summary = this.handoverSummaries[shiftId];
    return summary && !summary.deletedAt ? summary : null;
  }

  saveHandoverSummary(
    shiftId: string,
    input: { autoSummary: string; manualNote: string; isDraft: boolean; dataHash?: string },
    updatedBy: string
  ): HandoverSummary {
    const now = new Date().toISOString();
    const existing = this.handoverSummaries[shiftId];
    const summary: HandoverSummary = {
      id: existing?.id ?? crypto.randomUUID(),
      vesselId: null,
      fleetId: null,
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
    this.handoverSummaries[shiftId] = summary;
    this.safeSave(STORAGE_KEYS.HANDOVER, this.handoverSummaries);
    this.emitter.emit("handover:changed");
    return summary;
  }

  getExportData(): ExportData {
    return {
      version: EXPORT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      records: JSON.parse(JSON.stringify(this.records)),
      engineRoomRecords: JSON.parse(JSON.stringify(this.engineRoomRecords)),
      anomalyRecords: JSON.parse(JSON.stringify(this.anomalyRecords)),
      bilgeWaterRecords: JSON.parse(JSON.stringify(this.bilgeWaterRecords)),
      handoverSummaries: JSON.parse(JSON.stringify(this.handoverSummaries)),
      riskAssessments: JSON.parse(JSON.stringify(this.riskAssessments)),
      meta: {
        schemaVersion: SCHEMA_VERSION,
        migratedAt: new Date().toISOString(),
      },
    };
  }

  applyImport(exportData: ExportData, strategy: ImportStrategy): { imported: number; conflicts: number } {
    let imported = 0;
    let conflicts = 0;

    function mergeArrayMap<T extends { id: string }>(
      importedData: Record<string, T[]>,
      existing: Record<string, T[]>
    ): Record<string, T[]> {
      const result: Record<string, T[]> = { ...existing };
      Object.keys(importedData).forEach((shiftId) => {
        if (strategy === "overwrite") {
          result[shiftId] = [...importedData[shiftId]];
          imported += importedData[shiftId].length;
          if ((existing[shiftId]?.length ?? 0) > 0) {
            conflicts += existing[shiftId]!.length;
          }
        } else {
          const existingIds = new Set((existing[shiftId] ?? []).map((r) => r.id));
          const newItems = importedData[shiftId].filter((item) => !existingIds.has(item.id));
          result[shiftId] = [...(existing[shiftId] ?? []), ...newItems];
          imported += newItems.length;
          conflicts += importedData[shiftId].length - newItems.length;
        }
      });
      return result;
    }

    function mergeObjectMap<T extends { id: string }>(
      importedData: Record<string, T>,
      existing: Record<string, T>
    ): Record<string, T> {
      const result: Record<string, T> = { ...existing };
      Object.keys(importedData).forEach((key) => {
        if (strategy === "overwrite") {
          result[key] = importedData[key];
          imported += 1;
          if (existing[key]) conflicts += 1;
        } else {
          if (!result[key]) {
            result[key] = importedData[key];
            imported += 1;
          } else {
            conflicts += 1;
          }
        }
      });
      return result;
    }

    this.records = mergeArrayMap(exportData.records, this.records);
    this.engineRoomRecords = mergeArrayMap(exportData.engineRoomRecords, this.engineRoomRecords);
    this.anomalyRecords = mergeArrayMap(exportData.anomalyRecords, this.anomalyRecords);
    this.bilgeWaterRecords = mergeArrayMap(exportData.bilgeWaterRecords, this.bilgeWaterRecords);
    this.handoverSummaries = mergeObjectMap(exportData.handoverSummaries, this.handoverSummaries);
    if (exportData.riskAssessments) {
      this.riskAssessments = mergeArrayMap(exportData.riskAssessments as Record<string, RiskAssessment[]>, this.riskAssessments);
    }

    this.saveAll();
    this.emitter.emit("records:changed");
    this.emitter.emit("engineRoom:changed");
    this.emitter.emit("anomalies:changed");
    this.emitter.emit("bilge:changed");
    this.emitter.emit("handover:changed");
    this.emitter.emit("risk:changed");

    return { imported, conflicts };
  }

  listRiskAssessments(shiftId?: string): RiskAssessment[] {
    const targetShift = shiftId ?? this.currentShiftId;
    return (this.riskAssessments[targetShift] ?? []).filter((r) => !r.deletedAt);
  }

  getLatestRiskAssessment(shiftId?: string): RiskAssessment | null {
    const list = this.listRiskAssessments(shiftId);
    if (list.length === 0) return null;
    return list.reduce((latest, r) =>
      new Date(r.calculatedAt) > new Date(latest.calculatedAt) ? r : latest
    );
  }

  getAllRiskAssessments(): RiskAssessment[] {
    return Object.values(this.riskAssessments)
      .flat()
      .filter((r) => !r.deletedAt);
  }

  addRiskAssessment(
    input: Omit<RiskAssessment, "id" | "vesselId" | "fleetId" | "deletedAt" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"> & {
      shiftId: string;
    }
  ): RiskAssessment {
    const now = new Date().toISOString();
    const assessment: RiskAssessment = {
      ...input,
      id: crypto.randomUUID(),
      vesselId: null,
      fleetId: null,
      createdAt: now,
      createdBy: "system",
      updatedAt: now,
      updatedBy: "system",
      deletedAt: null,
    };
    if (!this.riskAssessments[input.shiftId]) {
      this.riskAssessments[input.shiftId] = [];
    }
    this.riskAssessments[input.shiftId].push(assessment);
    this.safeSave(STORAGE_KEYS.RISK, this.riskAssessments);
    this.emitter.emit("risk:changed");
    return assessment;
  }

  deleteRiskAssessment(id: string, deletedBy: string): void {
    const now = new Date().toISOString();
    for (const shiftId of Object.keys(this.riskAssessments)) {
      const idx = this.riskAssessments[shiftId].findIndex((r) => r.id === id && !r.deletedAt);
      if (idx !== -1) {
        this.riskAssessments[shiftId][idx] = {
          ...this.riskAssessments[shiftId][idx],
          deletedAt: now,
        };
        this.safeSave(STORAGE_KEYS.RISK, this.riskAssessments);
        this.emitter.emit("risk:changed");
        return;
      }
    }
  }

  calculateAndSaveRiskAssessment(shiftId?: string): RiskAssessment {
    const targetShift = shiftId ?? this.currentShiftId;
    const shiftEngineRecords = (this.engineRoomRecords[targetShift] ?? []).filter((r) => !r.deletedAt);
    const shiftBilgeRecords = (this.bilgeWaterRecords[targetShift] ?? []).filter((r) => !r.deletedAt);
    const shiftAnomalyRecords = (this.anomalyRecords[targetShift] ?? []).filter((r) => !r.deletedAt);

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
    return this.addRiskAssessment({ ...calculated, shiftId: targetShift });
  }

  checkAndMigrate(): void {
    const storedVersion = this.safeLoad<string>(STORAGE_KEYS.SCHEMA_VERSION, "");
    if (!storedVersion || storedVersion !== SCHEMA_VERSION) {
      try {
        const rawRisk = this.safeLoad<Record<string, RiskAssessment[]>>(STORAGE_KEYS.RISK, {});
        if (rawRisk && typeof rawRisk === "object") {
          for (const shiftId of Object.keys(rawRisk)) {
            const list = rawRisk[shiftId];
            if (Array.isArray(list)) {
              this.riskAssessments[shiftId] = list.map((r) => ({
                ...r,
                schemaVersion: r.schemaVersion || SCHEMA_VERSION,
                deletedAt: r.deletedAt || null,
                vesselId: r.vesselId || null,
                fleetId: r.fleetId || null,
                triggers: Array.isArray(r.triggers) ? r.triggers : [],
                timeline: Array.isArray(r.timeline) ? r.timeline : [],
                dataSnapshot: r.dataSnapshot || { anomalyIds: [] },
              }));
            }
          }
        }
        const rawAnomalies = this.safeLoad<Record<string, AnomalyRecord[]>>(STORAGE_KEYS.ANOMALIES, {});
        if (rawAnomalies && typeof rawAnomalies === "object") {
          for (const shiftId of Object.keys(rawAnomalies)) {
            const list = rawAnomalies[shiftId];
            if (Array.isArray(list)) {
              this.anomalyRecords[shiftId] = list.map((r) => migrateAnomalyRecord(r, shiftId));
            }
          }
        }
      } catch {}
      this.safeSave(STORAGE_KEYS.SCHEMA_VERSION, SCHEMA_VERSION);
    }
  }

  private loadCurrentShiftId(): string {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_SHIFT);
      if (stored && SHIFTS.some((s: Shift) => s.id === stored)) return stored;
    } catch {}
    return getDefaultCurrentShiftId();
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
        if (key === STORAGE_KEYS.RISK) {
          const obj = parsed as Record<string, RiskAssessment[]>;
          if (obj && typeof obj === "object") {
            for (const shiftId of Object.keys(obj)) {
              const list = obj[shiftId];
              if (Array.isArray(list)) {
                obj[shiftId] = list.map((r) => ({
                  ...r,
                  schemaVersion: r.schemaVersion || SCHEMA_VERSION,
                  deletedAt: r.deletedAt || null,
                  vesselId: r.vesselId || null,
                  fleetId: r.fleetId || null,
                  triggers: Array.isArray(r.triggers) ? r.triggers : [],
                  timeline: Array.isArray(r.timeline) ? r.timeline : [],
                  dataSnapshot: r.dataSnapshot || { anomalyIds: [] },
                }));
              }
            }
          }
          return obj as T;
        }
        if (key === STORAGE_KEYS.ANOMALIES) {
          const obj = parsed as Record<string, AnomalyRecord[]>;
          if (obj && typeof obj === "object") {
            for (const shiftId of Object.keys(obj)) {
              const list = obj[shiftId];
              if (Array.isArray(list)) {
                obj[shiftId] = list.map((r) => migrateAnomalyRecord(r, shiftId));
              }
            }
          }
          return obj as T;
        }
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
