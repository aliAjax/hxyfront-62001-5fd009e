import { describe, it, expect, beforeEach } from "vitest";
import { WatchRepository, resetRepositoryInstance } from "./repository";
import { DEFAULT_VESSEL_ID, EXPORT_VERSION, SCHEMA_VERSION } from "./domain";
import type { ExportData, ImportStrategy, Vessel } from "./domain";

function createFreshRepo(): WatchRepository {
  localStorage.clear();
  resetRepositoryInstance();
  return new WatchRepository();
}

const SHIFT_08 = "08-12";
const SHIFT_12 = "12-16";

describe("数据导出功能", () => {
  let repo: WatchRepository;

  beforeEach(() => {
    repo = createFreshRepo();
  });

  it("空数据导出格式正确", () => {
    const exportData = repo.getExportData();

    expect(exportData.version).toBe(EXPORT_VERSION);
    expect(exportData.schemaVersion).toBe(SCHEMA_VERSION);
    expect(exportData.exportedAt).toBeDefined();
    expect(exportData.vessels).toHaveLength(1);
    expect(exportData.vessels![0].id).toBe(DEFAULT_VESSEL_ID);
    expect(exportData.currentVesselId).toBe(DEFAULT_VESSEL_ID);
    expect(exportData.records).toEqual({});
    expect(exportData.engineRoomRecords).toEqual({});
    expect(exportData.anomalyRecords).toEqual({});
    expect(exportData.bilgeWaterRecords).toEqual({});
    expect(exportData.handoverSummaries).toEqual({});
    expect(exportData.vesselScopedData).toBeDefined();
    expect(exportData.meta).toBeDefined();
  });

  it("导出包含所有船舶的 vesselScopedData", () => {
    repo.addVessel({ name: "船舶A" });
    repo.addVessel({ name: "船舶B" });

    const exportData = repo.getExportData();

    expect(exportData.vessels).toHaveLength(3);
    expect(Object.keys(exportData.vesselScopedData!)).toHaveLength(3);
    expect(exportData.vesselScopedData![DEFAULT_VESSEL_ID]).toBeDefined();
  });

  it("导出数据包含值班记录", () => {
    repo.setCurrentShiftId(SHIFT_08);
    repo.addRecord({
      shiftId: SHIFT_08,
      device: "主机",
      params: "转速800rpm",
      anomaly: "无",
      status: "正常巡检",
      handoverNote: "",
    });

    const exportData = repo.getExportData();
    expect(exportData.records[SHIFT_08]).toHaveLength(1);
    expect(exportData.records[SHIFT_08][0].device).toBe("主机");
    expect(exportData.vesselScopedData![DEFAULT_VESSEL_ID].records[SHIFT_08]).toHaveLength(1);
  });

  it("导出数据包含机舱参数记录", () => {
    repo.setCurrentShiftId(SHIFT_08);
    repo.addEngineRoomRecord({
      shiftId: SHIFT_08,
      mainEngineSpeed: 800,
      lubricatingOilPressure: 0.45,
      coolingWaterTemp: 75,
      fuelConsumption: 25,
    });

    const exportData = repo.getExportData();
    expect(exportData.engineRoomRecords[SHIFT_08]).toHaveLength(1);
    expect(exportData.engineRoomRecords[SHIFT_08][0].mainEngineSpeed).toBe(800);
  });

  it("导出数据包含异常记录", () => {
    repo.setCurrentShiftId(SHIFT_08);
    repo.addAnomalyRecord({
      shiftId: SHIFT_08,
      device: "泵组",
      anomalyDescription: "异常震动",
      status: "待处理",
      reviewTime: new Date().toISOString(),
      handoverNote: "",
    });

    const exportData = repo.getExportData();
    expect(exportData.anomalyRecords[SHIFT_08]).toHaveLength(1);
    expect(exportData.anomalyRecords[SHIFT_08][0].anomalyDescription).toBe("异常震动");
  });

  it("导出数据包含舱底水记录", () => {
    repo.setCurrentShiftId(SHIFT_08);
    repo.addBilgeWaterRecord({
      shiftId: SHIFT_08,
      liquidLevel: 50,
      pumpStatus: "未运行",
      pumpRunDuration: 0,
      treatmentResult: "未处理",
      warningNote: "",
    });

    const exportData = repo.getExportData();
    expect(exportData.bilgeWaterRecords[SHIFT_08]).toHaveLength(1);
    expect(exportData.bilgeWaterRecords[SHIFT_08][0].liquidLevel).toBe(50);
  });

  it("按单船舶导出数据", () => {
    const vesselB = repo.addVessel({ name: "船舶B" });
    repo.setCurrentVesselId(vesselB.id);
    repo.setCurrentShiftId(SHIFT_08);
    repo.addRecord({
      shiftId: SHIFT_08,
      device: "B船主机",
      params: "转速750rpm",
      anomaly: "无",
      status: "正常巡检",
      handoverNote: "",
    });

    const exportData = repo.getExportDataForVessel(vesselB.id);
    expect(exportData.vessels).toHaveLength(1);
    expect(exportData.vessels![0].id).toBe(vesselB.id);
    expect(exportData.records[SHIFT_08]).toHaveLength(1);
    expect(exportData.records[SHIFT_08][0].device).toBe("B船主机");
  });

  it("多船舶数据导出时互不干扰", () => {
    const vesselA = repo.addVessel({ name: "船舶A" });
    const vesselB = repo.addVessel({ name: "船舶B" });

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

    repo.setCurrentVesselId(vesselB.id);
    repo.setCurrentShiftId(SHIFT_08);
    repo.addRecord({
      shiftId: SHIFT_08,
      device: "B船设备",
      params: "",
      anomaly: "",
      status: "正常巡检",
      handoverNote: "",
    });

    const exportData = repo.getExportData();
    expect(exportData.vesselScopedData![vesselA.id].records[SHIFT_08][0].device).toBe("A船设备");
    expect(exportData.vesselScopedData![vesselB.id].records[SHIFT_08][0].device).toBe("B船设备");
  });
});

describe("数据导入功能", () => {
  let repo: WatchRepository;

  beforeEach(() => {
    repo = createFreshRepo();
  });

  function createTestExportData(vesselId: string, shiftId: string): ExportData {
    return {
      version: EXPORT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      vessels: [
        {
          id: vesselId,
          name: "导入船舶",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          fleetId: null,
        },
      ],
      currentVesselId: vesselId,
      records: {
        [shiftId]: [
          {
            id: "test-record-1",
            shiftId,
            device: "导入设备",
            params: "导入参数",
            anomaly: "无",
            status: "正常巡检",
            handoverNote: "导入备注",
            vesselId,
            fleetId: null,
            createdAt: new Date().toISOString(),
            createdBy: "system",
            updatedAt: new Date().toISOString(),
            updatedBy: "system",
            deletedAt: null,
            idempotencyKey: "test-key-1",
          },
        ],
      },
      engineRoomRecords: {
        [shiftId]: [
          {
            id: "test-engine-1",
            shiftId,
            mainEngineSpeed: 850,
            lubricatingOilPressure: 0.5,
            coolingWaterTemp: 78,
            fuelConsumption: 28,
            vesselId,
            fleetId: null,
            createdAt: new Date().toISOString(),
            createdBy: "system",
            updatedAt: new Date().toISOString(),
            updatedBy: "system",
            deletedAt: null,
            idempotencyKey: "test-key-2",
          },
        ],
      },
      anomalyRecords: {
        [shiftId]: [
          {
            id: "test-anomaly-1",
            shiftId,
            originShiftId: shiftId,
            device: "导入异常设备",
            anomalyDescription: "导入的异常",
            initialStatus: "待处理",
            currentStatus: "待处理",
            reviewTime: new Date().toISOString(),
            handoverNote: "",
            statusHistory: [],
            handoverPath: [],
            vesselId,
            fleetId: null,
            createdAt: new Date().toISOString(),
            createdBy: "system",
            updatedAt: new Date().toISOString(),
            updatedBy: "system",
            deletedAt: null,
            idempotencyKey: "test-key-3",
          },
        ],
      },
      bilgeWaterRecords: {
        [shiftId]: [
          {
            id: "test-bilge-1",
            shiftId,
            liquidLevel: 60,
            pumpStatus: "运行中",
            pumpRunDuration: 15,
            treatmentResult: "处理中",
            warningNote: "导入警告",
            vesselId,
            fleetId: null,
            createdAt: new Date().toISOString(),
            createdBy: "system",
            updatedAt: new Date().toISOString(),
            updatedBy: "system",
            deletedAt: null,
            idempotencyKey: "test-key-4",
          },
        ],
      },
      handoverSummaries: {
        [shiftId]: {
          id: "test-handover-1",
          shiftId,
          autoSummary: "自动摘要",
          manualNote: "手动备注",
          isDraft: false,
          vesselId,
          fleetId: null,
          createdAt: new Date().toISOString(),
          createdBy: "system",
          updatedAt: new Date().toISOString(),
          updatedBy: "system",
          deletedAt: null,
        },
      },
      riskAssessments: {},
      meta: {
        schemaVersion: SCHEMA_VERSION,
        migratedAt: new Date().toISOString(),
      },
    };
  }

  it("merge 策略导入新船舶数据", () => {
    const importData = createTestExportData("import-vessel-1", SHIFT_08);
    const result = repo.applyImport(importData, "merge");

    expect(result.imported).toBeGreaterThan(0);
    expect(result.conflicts).toBe(0);

    const vessels = repo.listVessels();
    expect(vessels.some((v) => v.id === "import-vessel-1")).toBe(true);

    repo.setCurrentVesselId("import-vessel-1");
    expect(repo.listRecords(SHIFT_08)).toHaveLength(1);
    expect(repo.listEngineRoomRecords(SHIFT_08)).toHaveLength(1);
    expect(repo.listAnomalyRecords(SHIFT_08)).toHaveLength(1);
    expect(repo.listBilgeWaterRecords(SHIFT_08)).toHaveLength(1);
  });

  it("overwrite 策略导入会覆盖已有数据", () => {
    repo.setCurrentShiftId(SHIFT_08);
    repo.addRecord({
      shiftId: SHIFT_08,
      device: "原有设备",
      params: "",
      anomaly: "",
      status: "正常巡检",
      handoverNote: "",
    });

    const importData = createTestExportData(DEFAULT_VESSEL_ID, SHIFT_08);
    const result = repo.applyImport(importData, "overwrite");

    expect(result.conflicts).toBeGreaterThan(0);
    expect(repo.listRecords(SHIFT_08)).toHaveLength(1);
    expect(repo.listRecords(SHIFT_08)[0].device).toBe("导入设备");
  });

  it("merge 策略不会覆盖已有记录", () => {
    repo.setCurrentShiftId(SHIFT_08);
    const { record } = repo.addRecord({
      shiftId: SHIFT_08,
      device: "原有设备",
      params: "",
      anomaly: "",
      status: "正常巡检",
      handoverNote: "",
    });

    const importData = createTestExportData(DEFAULT_VESSEL_ID, SHIFT_08);
    importData.records[SHIFT_08][0].id = record.id;

    const result = repo.applyImport(importData, "merge");
    expect(result.conflicts).toBe(1);
    expect(repo.listRecords(SHIFT_08)).toHaveLength(1);
    expect(repo.listRecords(SHIFT_08)[0].device).toBe("原有设备");
  });

  it("导入包含 vesselScopedData 的多船舶数据", () => {
    const importData = createTestExportData("vessel-a", SHIFT_08);
    importData.vesselScopedData = {
      "vessel-a": {
        records: importData.records,
        engineRoomRecords: importData.engineRoomRecords,
        anomalyRecords: importData.anomalyRecords,
        bilgeWaterRecords: importData.bilgeWaterRecords,
        handoverSummaries: importData.handoverSummaries,
        riskAssessments: {},
      },
      "vessel-b": {
        records: {
          [SHIFT_12]: [
            {
              id: "vessel-b-record",
              shiftId: SHIFT_12,
              device: "B船专属设备",
              params: "",
              anomaly: "",
              status: "正常巡检",
              handoverNote: "",
              vesselId: "vessel-b",
              fleetId: null,
              createdAt: new Date().toISOString(),
              createdBy: "system",
              updatedAt: new Date().toISOString(),
              updatedBy: "system",
              deletedAt: null,
              idempotencyKey: "vessel-b-key",
            },
          ],
        },
        engineRoomRecords: {},
        anomalyRecords: {},
        bilgeWaterRecords: {},
        handoverSummaries: {},
        riskAssessments: {},
      },
    };
    importData.vessels = [
      ...(importData.vessels || []),
      {
        id: "vessel-b",
        name: "B船",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fleetId: null,
      },
    ];

    const result = repo.applyImport(importData, "merge");
    expect(result.imported).toBeGreaterThan(0);

    const vessels = repo.listVessels();
    expect(vessels.some((v) => v.id === "vessel-a")).toBe(true);
    expect(vessels.some((v) => v.id === "vessel-b")).toBe(true);

    repo.setCurrentVesselId("vessel-b");
    expect(repo.listRecords(SHIFT_12)).toHaveLength(1);
    expect(repo.listRecords(SHIFT_12)[0].device).toBe("B船专属设备");
  });

  it("导入后默认船舶数据不受影响", () => {
    repo.setCurrentVesselId(DEFAULT_VESSEL_ID);
    repo.setCurrentShiftId(SHIFT_08);
    repo.addRecord({
      shiftId: SHIFT_08,
      device: "默认船设备",
      params: "",
      anomaly: "",
      status: "正常巡检",
      handoverNote: "",
    });

    const importData = createTestExportData("new-vessel", SHIFT_08);
    repo.applyImport(importData, "merge");

    repo.setCurrentVesselId(DEFAULT_VESSEL_ID);
    expect(repo.listRecords(SHIFT_08)).toHaveLength(1);
    expect(repo.listRecords(SHIFT_08)[0].device).toBe("默认船设备");
  });

  it("导入导出往返数据一致性", () => {
    repo.setCurrentShiftId(SHIFT_08);
    repo.addRecord({
      shiftId: SHIFT_08,
      device: "测试设备",
      params: "测试参数",
      anomaly: "测试异常",
      status: "需关注",
      handoverNote: "测试备注",
    });
    repo.addEngineRoomRecord({
      shiftId: SHIFT_08,
      mainEngineSpeed: 800,
      lubricatingOilPressure: 0.45,
      coolingWaterTemp: 75,
      fuelConsumption: 25,
    });

    const exportData = repo.getExportData();
    const importData: ExportData = JSON.parse(JSON.stringify(exportData));

    const freshRepo = createFreshRepo();
    freshRepo.applyImport(importData, "overwrite");

    expect(freshRepo.listRecords(SHIFT_08)).toHaveLength(1);
    expect(freshRepo.listRecords(SHIFT_08)[0].device).toBe("测试设备");
    expect(freshRepo.listEngineRoomRecords(SHIFT_08)).toHaveLength(1);
    expect(freshRepo.listEngineRoomRecords(SHIFT_08)[0].mainEngineSpeed).toBe(800);
  });
});
