import { describe, it, expect, beforeEach } from "vitest";
import { WatchRepository, resetRepositoryInstance } from "./repository";
import {
  DEFAULT_VESSEL_ID,
  SCHEMA_VERSION,
  SHIFTS,
  createDefaultVessel,
  migrateAnomalyRecord,
} from "./domain";
import type {
  WatchRecord,
  EngineRoomRecord,
  AnomalyRecord,
  BilgeWaterRecord,
  Vessel,
} from "./domain";

function createFreshRepo(): WatchRepository {
  localStorage.clear();
  resetRepositoryInstance();
  return new WatchRepository();
}

const SHIFT_08 = "08-12";
const SHIFT_12 = "12-16";

describe("数据迁移功能 - 旧版单船舶格式迁移", () => {
  beforeEach(() => {
    localStorage.clear();
    resetRepositoryInstance();
  });

  it("检测到旧版 shift 作用域数据时自动迁移到船舶作用域", () => {
    const legacyRecords: Record<string, WatchRecord[]> = {
      [SHIFT_08]: [
        {
          id: "legacy-record-1",
          shiftId: SHIFT_08,
          device: "主机",
          params: "转速800rpm",
          anomaly: "无",
          status: "正常巡检",
          handoverNote: "",
          createdAt: new Date().toISOString(),
          createdBy: "system",
          updatedAt: new Date().toISOString(),
          updatedBy: "system",
          deletedAt: null,
          idempotencyKey: "legacy-key-1",
        },
      ],
      [SHIFT_12]: [
        {
          id: "legacy-record-2",
          shiftId: SHIFT_12,
          device: "发电机",
          params: "电压380V",
          anomaly: "轻微异响",
          status: "需关注",
          handoverNote: "",
          createdAt: new Date().toISOString(),
          createdBy: "system",
          updatedAt: new Date().toISOString(),
          updatedBy: "system",
          deletedAt: null,
          idempotencyKey: "legacy-key-2",
        },
      ],
    };

    localStorage.setItem("watch-records", JSON.stringify(legacyRecords));
    localStorage.setItem("watch-schema-version", "3.0.0");

    const repo = new WatchRepository();
    const state = repo.getState();

    expect(state.records[DEFAULT_VESSEL_ID]).toBeDefined();
    expect(state.records[DEFAULT_VESSEL_ID][SHIFT_08]).toHaveLength(1);
    expect(state.records[DEFAULT_VESSEL_ID][SHIFT_08][0].vesselId).toBe(DEFAULT_VESSEL_ID);
    expect(state.records[DEFAULT_VESSEL_ID][SHIFT_12]).toHaveLength(1);
    expect(state.records[DEFAULT_VESSEL_ID][SHIFT_12][0].device).toBe("发电机");
  });

  it("迁移时保留原有数据并正确设置 vesselId", () => {
    const legacyEngineRecords: Record<string, EngineRoomRecord[]> = {
      [SHIFT_08]: [
        {
          id: "legacy-engine-1",
          shiftId: SHIFT_08,
          mainEngineSpeed: 800,
          lubricatingOilPressure: 0.45,
          coolingWaterTemp: 75,
          fuelConsumption: 25,
          createdAt: new Date().toISOString(),
          createdBy: "system",
          updatedAt: new Date().toISOString(),
          updatedBy: "system",
          deletedAt: null,
          idempotencyKey: "legacy-engine-key-1",
        },
      ],
    };

    const legacyAnomalyRecords: Record<string, AnomalyRecord[]> = {
      [SHIFT_08]: [
        {
          id: "legacy-anomaly-1",
          shiftId: SHIFT_08,
          originShiftId: SHIFT_08,
          device: "泵组",
          anomalyDescription: "漏水",
          initialStatus: "待处理",
          currentStatus: "待处理",
          reviewTime: new Date().toISOString(),
          handoverNote: "",
          statusHistory: [],
          handoverPath: [],
          createdAt: new Date().toISOString(),
          createdBy: "system",
          updatedAt: new Date().toISOString(),
          updatedBy: "system",
          deletedAt: null,
          idempotencyKey: "legacy-anomaly-key-1",
        },
      ],
    };

    const legacyBilgeRecords: Record<string, BilgeWaterRecord[]> = {
      [SHIFT_08]: [
        {
          id: "legacy-bilge-1",
          shiftId: SHIFT_08,
          liquidLevel: 50,
          pumpStatus: "未运行",
          pumpRunDuration: 0,
          treatmentResult: "未处理",
          warningNote: "",
          createdAt: new Date().toISOString(),
          createdBy: "system",
          updatedAt: new Date().toISOString(),
          updatedBy: "system",
          deletedAt: null,
          idempotencyKey: "legacy-bilge-key-1",
        },
      ],
    };

    localStorage.setItem("engine-room-records", JSON.stringify(legacyEngineRecords));
    localStorage.setItem("anomaly-inspection-records", JSON.stringify(legacyAnomalyRecords));
    localStorage.setItem("bilge-water-records", JSON.stringify(legacyBilgeRecords));
    localStorage.setItem("watch-schema-version", "2.0.0");

    const repo = new WatchRepository();
    const state = repo.getState();

    expect(state.engineRoomRecords[DEFAULT_VESSEL_ID][SHIFT_08]).toHaveLength(1);
    expect(state.engineRoomRecords[DEFAULT_VESSEL_ID][SHIFT_08][0].vesselId).toBe(DEFAULT_VESSEL_ID);
    expect(state.anomalyRecords[DEFAULT_VESSEL_ID][SHIFT_08]).toHaveLength(1);
    expect(state.anomalyRecords[DEFAULT_VESSEL_ID][SHIFT_08][0].vesselId).toBe(DEFAULT_VESSEL_ID);
    expect(state.bilgeWaterRecords[DEFAULT_VESSEL_ID][SHIFT_08]).toHaveLength(1);
    expect(state.bilgeWaterRecords[DEFAULT_VESSEL_ID][SHIFT_08][0].vesselId).toBe(DEFAULT_VESSEL_ID);
  });

  it("迁移后 schema version 自动更新", () => {
    const legacyRecords: Record<string, WatchRecord[]> = {
      [SHIFT_08]: [
        {
          id: "test-1",
          shiftId: SHIFT_08,
          device: "设备",
          params: "",
          anomaly: "",
          status: "正常",
          handoverNote: "",
          createdAt: new Date().toISOString(),
          createdBy: "system",
          updatedAt: new Date().toISOString(),
          updatedBy: "system",
          deletedAt: null,
          idempotencyKey: "key-1",
        },
      ],
    };

    localStorage.setItem("watch-records", JSON.stringify(legacyRecords));
    localStorage.setItem("watch-schema-version", "1.0.0");

    const repo = new WatchRepository();
    expect(JSON.parse(localStorage.getItem("watch-schema-version")!)).toBe(SCHEMA_VERSION);
  });

  it("迁移时检测到船舶作用域与班次作用域混合格式", () => {
    const mixedRecords: Record<string, unknown> = {
      [DEFAULT_VESSEL_ID]: {
        [SHIFT_08]: [],
      },
      [SHIFT_12]: [
        {
          id: "mixed-1",
          shiftId: SHIFT_12,
          device: "混合格式设备",
          params: "",
          anomaly: "",
          status: "正常",
          handoverNote: "",
          createdAt: new Date().toISOString(),
          createdBy: "system",
          updatedAt: new Date().toISOString(),
          updatedBy: "system",
          deletedAt: null,
          idempotencyKey: "mixed-key-1",
        },
      ],
    };

    localStorage.setItem("watch-records", JSON.stringify(mixedRecords));
    localStorage.setItem("watch-schema-version", "3.5.0");

    const repo = new WatchRepository();
    const state = repo.getState();

    expect(state.records[DEFAULT_VESSEL_ID]).toBeDefined();
    expect(state.records[DEFAULT_VESSEL_ID][SHIFT_12]).toHaveLength(1);
    expect(state.records[DEFAULT_VESSEL_ID][SHIFT_12][0].device).toBe("混合格式设备");
    expect(state.records[SHIFT_12]).toBeUndefined();
  });

  it("空数据时不执行迁移但设置 schema version", () => {
    const repo = createFreshRepo();
    expect(JSON.parse(localStorage.getItem("watch-schema-version")!)).toBe(SCHEMA_VERSION);
  });

  it("已有新版本 schema 时不重复迁移", () => {
    localStorage.setItem("watch-schema-version", SCHEMA_VERSION);
    localStorage.setItem(
      "watch-vessels",
      JSON.stringify([createDefaultVessel()])
    );

    const repo = new WatchRepository();
    const state = repo.getState();
    expect(state.vessels).toHaveLength(1);
    expect(state.records[DEFAULT_VESSEL_ID]).toEqual({});
  });

  it("迁移后数据可正常读写", () => {
    const legacyRecords: Record<string, WatchRecord[]> = {
      [SHIFT_08]: [
        {
          id: "migrated-1",
          shiftId: SHIFT_08,
          device: "迁移后设备",
          params: "参数",
          anomaly: "无",
          status: "正常巡检",
          handoverNote: "迁移备注",
          createdAt: new Date().toISOString(),
          createdBy: "system",
          updatedAt: new Date().toISOString(),
          updatedBy: "system",
          deletedAt: null,
          idempotencyKey: "migrated-key-1",
        },
      ],
    };

    localStorage.setItem("watch-records", JSON.stringify(legacyRecords));
    localStorage.setItem("watch-schema-version", "2.0.0");

    const repo = new WatchRepository();
    repo.setCurrentShiftId(SHIFT_08);

    const records = repo.listRecords(SHIFT_08);
    expect(records).toHaveLength(1);
    expect(records[0].device).toBe("迁移后设备");

    const { record: newRecord } = repo.addRecord({
      shiftId: SHIFT_08,
      device: "新建设备",
      params: "",
      anomaly: "",
      status: "正常巡检",
      handoverNote: "",
    });
    expect(newRecord.vesselId).toBe(DEFAULT_VESSEL_ID);
    expect(repo.listRecords(SHIFT_08)).toHaveLength(2);
  });
});

describe("数据迁移功能 - 异常记录字段补充", () => {
  it("migrateAnomalyRecord 补充缺失字段", () => {
    const incompleteRecord: Partial<AnomalyRecord> = {
      id: "incomplete-1",
      shiftId: SHIFT_08,
      device: "设备",
      anomalyDescription: "异常",
      initialStatus: "待处理",
      currentStatus: "已关闭",
      reviewTime: new Date().toISOString(),
      handoverNote: "",
      createdAt: new Date().toISOString(),
      createdBy: "system",
      updatedAt: new Date().toISOString(),
      updatedBy: "system",
      deletedAt: null,
      idempotencyKey: "key-1",
    };

    const migrated = migrateAnomalyRecord(incompleteRecord as AnomalyRecord, SHIFT_08);

    expect(migrated.originShiftId).toBe(SHIFT_08);
    expect(migrated.handoverPath).toEqual([]);
    expect(migrated.statusHistory).toEqual([]);
    expect(migrated.closedAtShiftId).toBe(SHIFT_08);
    expect(migrated.closedAt).toBeDefined();
    expect(migrated.closedBy).toBe("system");
  });

  it("migrateAnomalyRecord 保留已有字段", () => {
    const completeRecord: AnomalyRecord = {
      id: "complete-1",
      shiftId: SHIFT_08,
      originShiftId: SHIFT_12,
      device: "设备",
      anomalyDescription: "异常",
      initialStatus: "待处理",
      currentStatus: "处理中",
      reviewTime: new Date().toISOString(),
      handoverNote: "",
      statusHistory: [
        {
          id: "status-1",
          status: "待处理",
          note: "备注",
          shiftId: SHIFT_08,
          createdAt: new Date().toISOString(),
          createdBy: "user",
          updatedAt: new Date().toISOString(),
          updatedBy: "user",
          deletedAt: null,
        },
      ],
      handoverPath: [
        {
          id: "handover-1",
          fromShiftId: SHIFT_12,
          toShiftId: SHIFT_08,
          handedAt: new Date().toISOString(),
          handedBy: "user",
        },
      ],
      vesselId: DEFAULT_VESSEL_ID,
      fleetId: null,
      createdAt: new Date().toISOString(),
      createdBy: "system",
      updatedAt: new Date().toISOString(),
      updatedBy: "system",
      deletedAt: null,
      idempotencyKey: "key-1",
    };

    const migrated = migrateAnomalyRecord(completeRecord, SHIFT_08);

    expect(migrated.originShiftId).toBe(SHIFT_12);
    expect(migrated.handoverPath).toHaveLength(1);
    expect(migrated.statusHistory).toHaveLength(1);
    expect(migrated.closedAtShiftId).toBeNull();
    expect(migrated.closedAt).toBeNull();
    expect(migrated.closedBy).toBeNull();
  });
});

describe("数据迁移功能 - 风险评估数据迁移", () => {
  beforeEach(() => {
    localStorage.clear();
    resetRepositoryInstance();
  });

  it("风险评估记录迁移时补充 schemaVersion 字段", () => {
    const legacyRiskRecords: Record<string, unknown> = {
      [SHIFT_08]: [
        {
          id: "legacy-risk-1",
          shiftId: SHIFT_08,
          overallLevel: "low",
          score: 1,
          triggers: [],
          timeline: [],
          handoverRecommendation: "建议",
          calculatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          createdBy: "system",
          updatedAt: new Date().toISOString(),
          updatedBy: "system",
          deletedAt: null,
        },
      ],
    };

    localStorage.setItem("risk-assessments", JSON.stringify(legacyRiskRecords));
    localStorage.setItem("watch-schema-version", "3.0.0");

    const repo = new WatchRepository();
    const state = repo.getState();

    const riskRecords = state.riskAssessments[DEFAULT_VESSEL_ID][SHIFT_08];
    expect(riskRecords).toHaveLength(1);
    expect(riskRecords[0].schemaVersion).toBe(SCHEMA_VERSION);
    expect(riskRecords[0].vesselId).toBe(DEFAULT_VESSEL_ID);
    expect(riskRecords[0].deletedAt).toBeNull();
  });

  it("风险评估记录迁移时确保 triggers 和 timeline 为数组", () => {
    const legacyRiskRecords: Record<string, unknown> = {
      [SHIFT_08]: [
        {
          id: "legacy-risk-2",
          shiftId: SHIFT_08,
          overallLevel: "medium",
          score: 2,
          calculatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          createdBy: "system",
          updatedAt: new Date().toISOString(),
          updatedBy: "system",
          deletedAt: null,
        },
      ],
    };

    localStorage.setItem("risk-assessments", JSON.stringify(legacyRiskRecords));
    localStorage.setItem("watch-schema-version", "2.5.0");

    const repo = new WatchRepository();
    const state = repo.getState();

    const riskRecords = state.riskAssessments[DEFAULT_VESSEL_ID][SHIFT_08];
    expect(Array.isArray(riskRecords[0].triggers)).toBe(true);
    expect(Array.isArray(riskRecords[0].timeline)).toBe(true);
    expect(riskRecords[0].dataSnapshot).toBeDefined();
    expect(riskRecords[0].dataSnapshot?.anomalyIds).toEqual([]);
  });
});

describe("数据迁移功能 - 多船舶场景", () => {
  beforeEach(() => {
    localStorage.clear();
    resetRepositoryInstance();
  });

  it("迁移后可正常添加新船舶", () => {
    const legacyRecords: Record<string, WatchRecord[]> = {
      [SHIFT_08]: [
        {
          id: "legacy-1",
          shiftId: SHIFT_08,
          device: "旧版设备",
          params: "",
          anomaly: "",
          status: "正常",
          handoverNote: "",
          createdAt: new Date().toISOString(),
          createdBy: "system",
          updatedAt: new Date().toISOString(),
          updatedBy: "system",
          deletedAt: null,
          idempotencyKey: "legacy-1",
        },
      ],
    };

    localStorage.setItem("watch-records", JSON.stringify(legacyRecords));
    localStorage.setItem("watch-schema-version", "1.0.0");

    const repo = new WatchRepository();
    const newVessel = repo.addVessel({ name: "新船舶" });

    repo.setCurrentVesselId(newVessel.id);
    repo.setCurrentShiftId(SHIFT_08);
    repo.addRecord({
      shiftId: SHIFT_08,
      device: "新船设备",
      params: "",
      anomaly: "",
      status: "正常巡检",
      handoverNote: "",
    });

    expect(repo.listRecords(SHIFT_08)).toHaveLength(1);
    expect(repo.listRecords(SHIFT_08)[0].device).toBe("新船设备");

    repo.setCurrentVesselId(DEFAULT_VESSEL_ID);
    expect(repo.listRecords(SHIFT_08)).toHaveLength(1);
    expect(repo.listRecords(SHIFT_08)[0].device).toBe("旧版设备");
  });

  it("迁移后船舶数据完全隔离", () => {
    const legacyRecords: Record<string, WatchRecord[]> = {
      [SHIFT_08]: [
        {
          id: "legacy-default-1",
          shiftId: SHIFT_08,
          device: "默认船设备",
          params: "",
          anomaly: "",
          status: "正常",
          handoverNote: "",
          createdAt: new Date().toISOString(),
          createdBy: "system",
          updatedAt: new Date().toISOString(),
          updatedBy: "system",
          deletedAt: null,
          idempotencyKey: "legacy-default-1",
        },
      ],
    };

    localStorage.setItem("watch-records", JSON.stringify(legacyRecords));
    localStorage.setItem("watch-schema-version", "2.0.0");

    const repo = new WatchRepository();
    const vesselA = repo.addVessel({ name: "船舶A" });

    repo.setCurrentVesselId(vesselA.id);
    repo.setCurrentShiftId(SHIFT_08);
    repo.addRecord({
      shiftId: SHIFT_08,
      device: "A船设备",
      params: "",
      anomaly: "",
      status: "正常巡检",
      handoverNote: "",
    });

    const state = repo.getState();
    expect(state.records[DEFAULT_VESSEL_ID][SHIFT_08]).toHaveLength(1);
    expect(state.records[DEFAULT_VESSEL_ID][SHIFT_08][0].device).toBe("默认船设备");
    expect(state.records[vesselA.id][SHIFT_08]).toHaveLength(1);
    expect(state.records[vesselA.id][SHIFT_08][0].device).toBe("A船设备");
  });
});
