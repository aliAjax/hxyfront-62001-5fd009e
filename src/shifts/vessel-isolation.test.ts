import { describe, it, expect, beforeEach } from "vitest";
import { WatchRepository, resetRepositoryInstance } from "./repository";
import { DEFAULT_VESSEL_ID, SHIFTS } from "./domain";
import type { Vessel, WatchRecord, EngineRoomRecord, AnomalyRecord, BilgeWaterRecord } from "./domain";

function createFreshRepo(): WatchRepository {
  localStorage.clear();
  resetRepositoryInstance();
  return new WatchRepository();
}

const SHIFT_08 = "08-12";
const SHIFT_12 = "12-16";

describe("多船舶数据隔离 - 新增船舶", () => {
  let repo: WatchRepository;
  let defaultVessel: Vessel;

  beforeEach(() => {
    repo = createFreshRepo();
    defaultVessel = repo.getCurrentVessel();
  });

  it("初始状态只有默认船舶，且默认船舶数据为空", () => {
    const vessels = repo.listVessels();
    expect(vessels.length).toBe(1);
    expect(vessels[0].id).toBe(DEFAULT_VESSEL_ID);
    expect(repo.getCurrentVesselId()).toBe(DEFAULT_VESSEL_ID);

    repo.setCurrentShiftId(SHIFT_08);
    expect(repo.listRecords(SHIFT_08).length).toBe(0);
    expect(repo.listEngineRoomRecords(SHIFT_08).length).toBe(0);
    expect(repo.listAnomalyRecords(SHIFT_08).length).toBe(0);
    expect(repo.listBilgeWaterRecords(SHIFT_08).length).toBe(0);
  });

  it("新增船舶后，新船舶独立的数据空间初始为空", () => {
    repo.setCurrentShiftId(SHIFT_08);
    repo.addRecord({
      shiftId: SHIFT_08,
      device: "主机",
      params: "转速800rpm",
      anomaly: "无",
      status: "正常巡检",
      handoverNote: "",
    });

    const newVessel = repo.addVessel({ name: "新船01" });
    expect(repo.listVessels().length).toBe(2);

    repo.setCurrentVesselId(newVessel.id);
    repo.setCurrentShiftId(SHIFT_08);

    expect(repo.listRecords(SHIFT_08).length).toBe(0);
    expect(repo.listEngineRoomRecords(SHIFT_08).length).toBe(0);
    expect(repo.listAnomalyRecords(SHIFT_08).length).toBe(0);
    expect(repo.listBilgeWaterRecords(SHIFT_08).length).toBe(0);
  });

  it("新增船舶不影响默认船舶已有数据", () => {
    repo.setCurrentShiftId(SHIFT_08);
    repo.addRecord({
      shiftId: SHIFT_08,
      device: "主机",
      params: "转速800rpm",
      anomaly: "无",
      status: "正常巡检",
      handoverNote: "",
    });

    repo.addVessel({ name: "新船01" });

    repo.setCurrentVesselId(DEFAULT_VESSEL_ID);
    repo.setCurrentShiftId(SHIFT_08);
    expect(repo.listRecords(SHIFT_08).length).toBe(1);
    expect(repo.listRecords(SHIFT_08)[0].device).toBe("主机");
  });

  it("新增船舶的 vesselId 正确写入其创建的所有记录", () => {
    const vesselB = repo.addVessel({ name: "船舶B" });
    repo.setCurrentVesselId(vesselB.id);
    repo.setCurrentShiftId(SHIFT_08);

    const { record: watchRec } = repo.addRecord({
      shiftId: SHIFT_08,
      device: "发电机",
      params: "电压380V",
      anomaly: "无",
      status: "正常巡检",
      handoverNote: "",
    });
    const { record: engineRec } = repo.addEngineRoomRecord({
      shiftId: SHIFT_08,
      mainEngineSpeed: 800,
      lubricatingOilPressure: 0.45,
      coolingWaterTemp: 75,
      fuelConsumption: 25,
    });
    const { record: anomalyRec } = repo.addAnomalyRecord({
      shiftId: SHIFT_08,
      device: "泵组",
      anomalyDescription: "异常震动",
      status: "待处理",
      reviewTime: new Date().toISOString(),
      handoverNote: "",
    });
    const { record: bilgeRec } = repo.addBilgeWaterRecord({
      shiftId: SHIFT_08,
      liquidLevel: 50,
      pumpStatus: "未运行",
      pumpRunDuration: 0,
      treatmentResult: "未处理",
      warningNote: "",
    });

    expect(watchRec.vesselId).toBe(vesselB.id);
    expect(engineRec.vesselId).toBe(vesselB.id);
    expect(anomalyRec.vesselId).toBe(vesselB.id);
    expect(bilgeRec.vesselId).toBe(vesselB.id);
  });
});

describe("多船舶数据隔离 - 切换船舶", () => {
  let repo: WatchRepository;
  let vesselA: Vessel;
  let vesselB: Vessel;

  beforeEach(() => {
    repo = createFreshRepo();
    vesselA = repo.getCurrentVessel();
    vesselB = repo.addVessel({ name: "船舶B号" });
  });

  it("切换船舶后，普通值班记录(WatchRecord)不会串船", () => {
    repo.setCurrentVesselId(vesselA.id);
    repo.setCurrentShiftId(SHIFT_08);
    repo.addRecord({
      shiftId: SHIFT_08,
      device: "A船主机",
      params: "转速800rpm",
      anomaly: "无",
      status: "正常巡检",
      handoverNote: "A船专属",
    });

    repo.setCurrentVesselId(vesselB.id);
    repo.setCurrentShiftId(SHIFT_08);
    repo.addRecord({
      shiftId: SHIFT_08,
      device: "B船发电机",
      params: "电压380V",
      anomaly: "轻微异响",
      status: "需关注",
      handoverNote: "B船专属",
    });

    repo.setCurrentVesselId(vesselA.id);
    const recordsA = repo.listRecords(SHIFT_08);
    expect(recordsA.length).toBe(1);
    expect(recordsA[0].device).toBe("A船主机");
    expect(recordsA[0].vesselId).toBe(vesselA.id);

    repo.setCurrentVesselId(vesselB.id);
    const recordsB = repo.listRecords(SHIFT_08);
    expect(recordsB.length).toBe(1);
    expect(recordsB[0].device).toBe("B船发电机");
    expect(recordsB[0].vesselId).toBe(vesselB.id);
  });

  it("切换船舶后，机舱参数(EngineRoomRecord)不会串船", () => {
    repo.setCurrentVesselId(vesselA.id);
    repo.setCurrentShiftId(SHIFT_08);
    repo.addEngineRoomRecord({
      shiftId: SHIFT_08,
      mainEngineSpeed: 800,
      lubricatingOilPressure: 0.45,
      coolingWaterTemp: 75,
      fuelConsumption: 25,
    });

    repo.setCurrentVesselId(vesselB.id);
    repo.setCurrentShiftId(SHIFT_08);
    repo.addEngineRoomRecord({
      shiftId: SHIFT_08,
      mainEngineSpeed: 900,
      lubricatingOilPressure: 0.5,
      coolingWaterTemp: 80,
      fuelConsumption: 30,
    });

    repo.setCurrentVesselId(vesselA.id);
    const engineA = repo.listEngineRoomRecords(SHIFT_08);
    expect(engineA.length).toBe(1);
    expect(engineA[0].mainEngineSpeed).toBe(800);

    repo.setCurrentVesselId(vesselB.id);
    const engineB = repo.listEngineRoomRecords(SHIFT_08);
    expect(engineB.length).toBe(1);
    expect(engineB[0].mainEngineSpeed).toBe(900);
  });

  it("切换船舶后，异常记录(AnomalyRecord)不会串船", () => {
    repo.setCurrentVesselId(vesselA.id);
    repo.setCurrentShiftId(SHIFT_08);
    repo.addAnomalyRecord({
      shiftId: SHIFT_08,
      device: "A船泵组",
      anomalyDescription: "A船：泵组漏水",
      status: "待处理",
      reviewTime: new Date().toISOString(),
      handoverNote: "A船问题",
    });

    repo.setCurrentVesselId(vesselB.id);
    repo.setCurrentShiftId(SHIFT_08);
    repo.addAnomalyRecord({
      shiftId: SHIFT_08,
      device: "B船舵机",
      anomalyDescription: "B船：舵机异响",
      status: "处理中",
      reviewTime: new Date().toISOString(),
      handoverNote: "B船问题",
    });

    repo.setCurrentVesselId(vesselA.id);
    const anomaliesA = repo.listAnomalyRecords(SHIFT_08, true);
    expect(anomaliesA.length).toBe(1);
    expect(anomaliesA[0].anomalyDescription).toContain("A船");
    expect(anomaliesA[0].vesselId).toBe(vesselA.id);

    repo.setCurrentVesselId(vesselB.id);
    const anomaliesB = repo.listAnomalyRecords(SHIFT_08, true);
    expect(anomaliesB.length).toBe(1);
    expect(anomaliesB[0].anomalyDescription).toContain("B船");
    expect(anomaliesB[0].vesselId).toBe(vesselB.id);
  });

  it("切换船舶后，舱底水记录(BilgeWaterRecord)不会串船", () => {
    repo.setCurrentVesselId(vesselA.id);
    repo.setCurrentShiftId(SHIFT_08);
    repo.addBilgeWaterRecord({
      shiftId: SHIFT_08,
      liquidLevel: 30,
      pumpStatus: "未运行",
      pumpRunDuration: 0,
      treatmentResult: "未处理",
      warningNote: "A船正常",
    });

    repo.setCurrentVesselId(vesselB.id);
    repo.setCurrentShiftId(SHIFT_08);
    repo.addBilgeWaterRecord({
      shiftId: SHIFT_08,
      liquidLevel: 85,
      pumpStatus: "运行中",
      pumpRunDuration: 30,
      treatmentResult: "处理中",
      warningNote: "B船警戒",
    });

    repo.setCurrentVesselId(vesselA.id);
    const bilgeA = repo.listBilgeWaterRecords(SHIFT_08);
    expect(bilgeA.length).toBe(1);
    expect(bilgeA[0].liquidLevel).toBe(30);
    expect(bilgeA[0].warningNote).toBe("A船正常");

    repo.setCurrentVesselId(vesselB.id);
    const bilgeB = repo.listBilgeWaterRecords(SHIFT_08);
    expect(bilgeB.length).toBe(1);
    expect(bilgeB[0].liquidLevel).toBe(85);
    expect(bilgeB[0].warningNote).toBe("B船警戒");
  });

  it("每艘船舶独立记忆自己的当前班次", () => {
    repo.setCurrentVesselId(vesselA.id);
    repo.setCurrentShiftId(SHIFT_08);
    expect(repo.getCurrentShiftId()).toBe(SHIFT_08);

    repo.setCurrentVesselId(vesselB.id);
    repo.setCurrentShiftId(SHIFT_12);
    expect(repo.getCurrentShiftId()).toBe(SHIFT_12);

    repo.setCurrentVesselId(vesselA.id);
    expect(repo.getCurrentShiftId()).toBe(SHIFT_08);

    repo.setCurrentVesselId(vesselB.id);
    expect(repo.getCurrentShiftId()).toBe(SHIFT_12);
  });

  it("getLatestEngineRoomRecord / getLatestBilgeWaterRecord 只查当前船舶", () => {
    repo.setCurrentVesselId(vesselA.id);
    repo.setCurrentShiftId(SHIFT_08);
    repo.addEngineRoomRecord({
      shiftId: SHIFT_08,
      mainEngineSpeed: 700,
      lubricatingOilPressure: 0.4,
      coolingWaterTemp: 70,
      fuelConsumption: 20,
    });

    repo.setCurrentVesselId(vesselB.id);
    repo.setCurrentShiftId(SHIFT_08);
    const latestBEngine = repo.getLatestEngineRoomRecord();
    const latestBBilge = repo.getLatestBilgeWaterRecord();
    expect(latestBEngine).toBeNull();
    expect(latestBBilge).toBeNull();
  });
});

describe("多船舶数据隔离 - 切换班次", () => {
  let repo: WatchRepository;
  let vesselA: Vessel;
  let vesselB: Vessel;

  beforeEach(() => {
    repo = createFreshRepo();
    vesselA = repo.getCurrentVessel();
    vesselB = repo.addVessel({ name: "船舶B" });
  });

  it("同一船舶内，切换班次后普通值班记录按班次隔离", () => {
    repo.setCurrentVesselId(vesselA.id);

    repo.setCurrentShiftId(SHIFT_08);
    repo.addRecord({
      shiftId: SHIFT_08,
      device: "08班设备",
      params: "08班参数",
      anomaly: "无",
      status: "正常巡检",
      handoverNote: "",
    });

    repo.setCurrentShiftId(SHIFT_12);
    repo.addRecord({
      shiftId: SHIFT_12,
      device: "12班设备",
      params: "12班参数",
      anomaly: "异响",
      status: "需关注",
      handoverNote: "",
    });

    expect(repo.listRecords(SHIFT_08).length).toBe(1);
    expect(repo.listRecords(SHIFT_08)[0].device).toBe("08班设备");
    expect(repo.listRecords(SHIFT_08)[0].shiftId).toBe(SHIFT_08);

    expect(repo.listRecords(SHIFT_12).length).toBe(1);
    expect(repo.listRecords(SHIFT_12)[0].device).toBe("12班设备");
    expect(repo.listRecords(SHIFT_12)[0].shiftId).toBe(SHIFT_12);
  });

  it("同一船舶内，切换班次后机舱参数按班次隔离", () => {
    repo.setCurrentVesselId(vesselA.id);

    repo.setCurrentShiftId(SHIFT_08);
    repo.addEngineRoomRecord({
      shiftId: SHIFT_08,
      mainEngineSpeed: 800,
      lubricatingOilPressure: 0.45,
      coolingWaterTemp: 75,
      fuelConsumption: 25,
    });

    repo.setCurrentShiftId(SHIFT_12);
    repo.addEngineRoomRecord({
      shiftId: SHIFT_12,
      mainEngineSpeed: 850,
      lubricatingOilPressure: 0.48,
      coolingWaterTemp: 78,
      fuelConsumption: 28,
    });

    const engine08 = repo.listEngineRoomRecords(SHIFT_08);
    expect(engine08.length).toBe(1);
    expect(engine08[0].mainEngineSpeed).toBe(800);

    const engine12 = repo.listEngineRoomRecords(SHIFT_12);
    expect(engine12.length).toBe(1);
    expect(engine12[0].mainEngineSpeed).toBe(850);
  });

  it("同一船舶内，切换班次后异常记录按班次隔离", () => {
    repo.setCurrentVesselId(vesselA.id);

    repo.setCurrentShiftId(SHIFT_08);
    repo.addAnomalyRecord({
      shiftId: SHIFT_08,
      device: "08班异常设备",
      anomalyDescription: "08班发现的问题",
      status: "待处理",
      reviewTime: new Date().toISOString(),
      handoverNote: "",
    });

    repo.setCurrentShiftId(SHIFT_12);
    repo.addAnomalyRecord({
      shiftId: SHIFT_12,
      device: "12班异常设备",
      anomalyDescription: "12班发现的问题",
      status: "处理中",
      reviewTime: new Date().toISOString(),
      handoverNote: "",
    });

    const anomalies08 = repo.listAnomalyRecords(SHIFT_08, true);
    expect(anomalies08.length).toBe(1);
    expect(anomalies08[0].device).toBe("08班异常设备");

    const anomalies12 = repo.listAnomalyRecords(SHIFT_12, true);
    expect(anomalies12.length).toBe(1);
    expect(anomalies12[0].device).toBe("12班异常设备");
  });

  it("同一船舶内，切换班次后舱底水记录按班次隔离", () => {
    repo.setCurrentVesselId(vesselA.id);

    repo.setCurrentShiftId(SHIFT_08);
    repo.addBilgeWaterRecord({
      shiftId: SHIFT_08,
      liquidLevel: 40,
      pumpStatus: "未运行",
      pumpRunDuration: 0,
      treatmentResult: "未处理",
      warningNote: "08班正常",
    });

    repo.setCurrentShiftId(SHIFT_12);
    repo.addBilgeWaterRecord({
      shiftId: SHIFT_12,
      liquidLevel: 60,
      pumpStatus: "运行中",
      pumpRunDuration: 15,
      treatmentResult: "达标排放",
      warningNote: "12班排水",
    });

    const bilge08 = repo.listBilgeWaterRecords(SHIFT_08);
    expect(bilge08.length).toBe(1);
    expect(bilge08[0].warningNote).toBe("08班正常");

    const bilge12 = repo.listBilgeWaterRecords(SHIFT_12);
    expect(bilge12.length).toBe(1);
    expect(bilge12[0].warningNote).toBe("12班排水");
  });

  it("船舶与班次双重隔离：A船08班数据不等于B船08班数据", () => {
    repo.setCurrentVesselId(vesselA.id);
    repo.setCurrentShiftId(SHIFT_08);
    repo.addRecord({
      shiftId: SHIFT_08,
      device: "A船08班主机",
      params: "",
      anomaly: "",
      status: "正常巡检",
      handoverNote: "",
    });

    repo.setCurrentVesselId(vesselB.id);
    repo.setCurrentShiftId(SHIFT_08);
    repo.addRecord({
      shiftId: SHIFT_08,
      device: "B船08班副机",
      params: "",
      anomaly: "",
      status: "正常巡检",
      handoverNote: "",
    });

    repo.setCurrentVesselId(vesselA.id);
    const list = repo.listRecords(SHIFT_08);
    expect(list.length).toBe(1);
    expect(list[0].device).toBe("A船08班主机");
    expect(list[0].vesselId).toBe(vesselA.id);
    expect(list[0].shiftId).toBe(SHIFT_08);
  });
});

describe("多船舶数据隔离 - 删除船舶", () => {
  it("删除船舶会清除其所有数据，且不影响其他船舶", () => {
    const repo = createFreshRepo();
    const defaultVessel = repo.getCurrentVessel();
    const vesselC = repo.addVessel({ name: "船舶C" });

    repo.setCurrentVesselId(vesselC.id);
    repo.setCurrentShiftId(SHIFT_08);
    repo.addRecord({ shiftId: SHIFT_08, device: "C船设备", params: "", anomaly: "", status: "", handoverNote: "" });
    repo.addEngineRoomRecord({ shiftId: SHIFT_08, mainEngineSpeed: 100, lubricatingOilPressure: 0.1, coolingWaterTemp: 10, fuelConsumption: 1 });
    repo.addAnomalyRecord({ shiftId: SHIFT_08, device: "C船异常", anomalyDescription: "", status: "待处理", reviewTime: new Date().toISOString(), handoverNote: "" });
    repo.addBilgeWaterRecord({ shiftId: SHIFT_08, liquidLevel: 1, pumpStatus: "未运行", pumpRunDuration: 0, treatmentResult: "未处理", warningNote: "" });

    repo.setCurrentVesselId(defaultVessel.id);
    repo.setCurrentShiftId(SHIFT_08);
    repo.addRecord({ shiftId: SHIFT_08, device: "默认船设备", params: "", anomaly: "", status: "", handoverNote: "" });

    const deleted = repo.deleteVessel(vesselC.id);
    expect(deleted).toBe(true);
    expect(repo.listVessels().length).toBe(1);
    expect(repo.listVessels()[0].id).toBe(defaultVessel.id);

    const state = repo.getState();
    expect(state.records[vesselC.id]).toBeUndefined();
    expect(state.engineRoomRecords[vesselC.id]).toBeUndefined();
    expect(state.anomalyRecords[vesselC.id]).toBeUndefined();
    expect(state.bilgeWaterRecords[vesselC.id]).toBeUndefined();

    expect(repo.listRecords(SHIFT_08).length).toBe(1);
    expect(repo.listRecords(SHIFT_08)[0].device).toBe("默认船设备");
  });

  it("不能删除默认船舶", () => {
    const repo = createFreshRepo();
    const result = repo.deleteVessel(DEFAULT_VESSEL_ID);
    expect(result).toBe(false);
    expect(repo.listVessels().length).toBe(1);
    expect(repo.getCurrentVesselId()).toBe(DEFAULT_VESSEL_ID);
  });
});
