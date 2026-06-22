import type {
  WatchRecord,
  EngineRoomRecord,
  AnomalyRecord,
  BilgeWaterRecord,
  HandoverSummary,
  RiskAssessment,
  RiskCalculationInput,
} from "./domain";
import {
  SHIFTS,
  isBilgeTreatmentUnfinished,
  calculateRiskAssessment,
  computeDataHash,
  getAnomalyOriginShiftLabel,
  formatHandoverPath,
} from "./domain";
import {
  selectActiveRecords,
  selectLatestRecord,
  selectShiftRecords,
  type ShiftMap,
  type ShiftObject,
} from "./shiftSelectors";

export interface ShiftDataForSummary {
  engineRoomRecords: ShiftMap<EngineRoomRecord>;
  bilgeWaterRecords: ShiftMap<BilgeWaterRecord>;
  anomalyRecords: ShiftMap<AnomalyRecord>;
  records: ShiftMap<WatchRecord>;
}

export function generateAutoSummary(
  shiftId: string,
  data: ShiftDataForSummary
): string {
  const parts: string[] = [];
  const now = new Date();
  const timestampStr = now.toLocaleString("zh-CN");
  const shiftLabel = SHIFTS.find((s) => s.id === shiftId)?.label ?? shiftId;

  parts.push(`═══════════════════════════════`);
  parts.push(`交接班摘要 - ${shiftLabel}`);
  parts.push(`生成时间：${timestampStr}`);
  parts.push(`═══════════════════════════════`);

  const stats: string[] = [];
  const shiftEngineRecords = selectActiveRecords(selectShiftRecords(data.engineRoomRecords, shiftId));
  const shiftBilgeRecords = selectActiveRecords(selectShiftRecords(data.bilgeWaterRecords, shiftId));
  const shiftAllAnomalies = selectActiveRecords(selectShiftRecords(data.anomalyRecords, shiftId));
  const shiftAnomalies = shiftAllAnomalies.filter((r) => r.currentStatus !== "已关闭");
  const shiftAllRecords = selectActiveRecords(selectShiftRecords(data.records, shiftId));
  const shiftUnfinishedRecords = shiftAllRecords.filter(
    (r) => r.status && r.status !== "已解决" && r.status !== "正常巡检"
  );
  const carriedOverList = shiftAllAnomalies.filter((r) => r.isCarriedOver);

  stats.push(`机舱参数记录：${shiftEngineRecords.length} 条`);
  stats.push(`舱底水记录：${shiftBilgeRecords.length} 条`);
  stats.push(`巡检记录：${shiftAllRecords.length} 条`);
  stats.push(`异常项：${shiftAllAnomalies.length} 条（未关闭 ${shiftAnomalies.length} 条）`);
  stats.push(`跨班次遗留：${carriedOverList.length} 条`);
  parts.push(`\n【班次统计】\n${stats.join("  |  ")}`);

  if (shiftEngineRecords.length > 0) {
    const latest = shiftEngineRecords[shiftEngineRecords.length - 1];
    const engineEvaluations: string[] = [];

    const { mainEngineSpeed, lubricatingOilPressure, coolingWaterTemp, fuelConsumption } = latest;
    const checkRange = (val: number, range: [number, number]) => val < range[0] || val > range[1];

    if (checkRange(mainEngineSpeed, [600, 950])) {
      engineEvaluations.push(
        `⚠ 主机转速 ${mainEngineSpeed} rpm${checkRange(mainEngineSpeed, [500, 1050]) ? "（严重异常）" : "（偏离正常）"}`
      );
    }
    if (checkRange(lubricatingOilPressure, [0.35, 0.6])) {
      engineEvaluations.push(
        `⚠ 滑油压力 ${lubricatingOilPressure} MPa${checkRange(lubricatingOilPressure, [0.25, 0.7]) ? "（严重异常）" : "（偏离正常）"}`
      );
    }
    if (checkRange(coolingWaterTemp, [70, 85])) {
      engineEvaluations.push(
        `⚠ 冷却水温 ${coolingWaterTemp} ℃${checkRange(coolingWaterTemp, [60, 92]) ? "（严重异常）" : "（偏离正常）"}`
      );
    }
    if (checkRange(fuelConsumption, [15, 35])) {
      engineEvaluations.push(
        `⚠ 燃油消耗 ${fuelConsumption} L/h${checkRange(fuelConsumption, [10, 45]) ? "（严重异常）" : "（偏离正常）"}`
      );
    }

    parts.push(
      `\n【机舱参数读数】\n` +
      `  主机转速：${mainEngineSpeed} rpm\n` +
      `  滑油压力：${lubricatingOilPressure} MPa\n` +
      `  冷却水温：${coolingWaterTemp} ℃\n` +
      `  燃油消耗：${fuelConsumption} L/h\n` +
      (engineEvaluations.length > 0
        ? `  ⚠ 参数异常：\n    ${engineEvaluations.join("\n    ")}`
        : `  ✓ 所有参数在正常范围内`)
    );
  } else {
    parts.push(`\n【机舱参数读数】\n  本班次暂无机舱参数记录`);
  }

  if (shiftBilgeRecords.length > 0) {
    const latest = shiftBilgeRecords[shiftBilgeRecords.length - 1];
    const levelTag = latest.liquidLevel >= 90 ? "⚠危险" : latest.liquidLevel >= 80 ? "⚠警戒" : "✓正常";
    const latestTime = new Date(latest.createdAt).toLocaleString("zh-CN");
    parts.push(
      `\n【舱底水状态】\n` +
      `  最新记录时间：${latestTime}\n` +
      `  液位：${latest.liquidLevel}%（${levelTag}）\n` +
      `  泵状态：${latest.pumpStatus}\n` +
      `  运行时长：${latest.pumpRunDuration} min\n` +
      `  处理结果：${latest.treatmentResult}` +
      (latest.warningNote ? `\n  警戒线备注：${latest.warningNote}` : "") +
      `\n  本班次记录总数：${shiftBilgeRecords.length} 条`
    );

    const unfinishedBilge = shiftBilgeRecords.filter(
      (r) => isBilgeTreatmentUnfinished(r.treatmentResult) || r.liquidLevel >= 80 || r.pumpStatus === "故障"
    );
    if (unfinishedBilge.length > 0) {
      const bilgeItems = unfinishedBilge.map(
        (r, i) => {
          const issues: string[] = [];
          if (r.liquidLevel >= 90) issues.push("液位危险");
          else if (r.liquidLevel >= 80) issues.push("液位警戒");
          if (r.pumpStatus === "故障") issues.push("泵故障");
          if (isBilgeTreatmentUnfinished(r.treatmentResult)) issues.push(`处理${r.treatmentResult}`);
          const recordTime = new Date(r.createdAt).toLocaleString("zh-CN");
          return `${i + 1}. [${recordTime}] 液位 ${r.liquidLevel}% [${issues.join("，")}]${r.warningNote ? " - 备注：" + r.warningNote : ""}`;
        }
      );
      parts.push(
        `\n【舱底水·需关注事项】\n` +
        `  ⚠ 共 ${unfinishedBilge.length} 条舱底水记录需关注，请下一班重点跟进：\n` +
        `${bilgeItems.join("\n")}`
      );
    }

    const normalBilgeCount = shiftBilgeRecords.length - unfinishedBilge.length;
    if (normalBilgeCount > 0 && unfinishedBilge.length > 0) {
      parts.push(`\n  ✓ 另有 ${normalBilgeCount} 条记录状态正常`);
    }
  } else {
    parts.push(`\n【舱底水状态】\n  本班次暂无舱底水记录`);
  }

  if (carriedOverList.length > 0) {
    const items = carriedOverList.map(
      (r, i) => {
        const originLabel = getAnomalyOriginShiftLabel(r);
        const pathStr = formatHandoverPath(r);
        return `${i + 1}. ${r.device}（${r.currentStatus}）【原始班次：${originLabel}】${pathStr ? `【流转：${pathStr}】` : ""}：${r.anomalyDescription}${r.handoverNote ? " - 备注：" + r.handoverNote : ""}`;
      }
    );
    parts.push(`\n【跨班次遗留异常·来自上一班】\n${items.join("\n")}`);
  }

  if (shiftAnomalies.length > 0) {
    const grouped: Record<string, AnomalyRecord[]> = {
      "待处理": [],
      "处理中": [],
      "需复查": [],
    };
    shiftAnomalies.forEach((r) => {
      if (!r.isCarriedOver) {
        if (grouped[r.currentStatus]) {
          grouped[r.currentStatus].push(r);
        } else {
          if (!grouped["其他"]) grouped["其他"] = [];
          grouped["其他"].push(r);
        }
      }
    });

    const newAnomalyItems: string[] = [];
    (["待处理", "处理中", "需复查", "其他"] as const).forEach((status) => {
      if (grouped[status] && grouped[status].length > 0) {
        grouped[status].forEach((r) => {
          newAnomalyItems.push(`  [${status}] ${r.device}：${r.anomalyDescription}${r.handoverNote ? "（备注：" + r.handoverNote + "）" : ""}`);
        });
      }
    });

    if (newAnomalyItems.length > 0) {
      parts.push(`\n【异常巡检项·本班次未关闭】\n${newAnomalyItems.join("\n")}`);
    }
  } else {
    parts.push(`\n【异常巡检项】\n  ✓ 本班次无未关闭异常项`);
  }

  if (shiftUnfinishedRecords.length > 0) {
    const items = shiftUnfinishedRecords.map(
      (r, i) => `${i + 1}. ${r.device} [${r.status}]${r.anomaly ? "：" + r.anomaly : ""}${r.handoverNote ? "（交接备注：" + r.handoverNote + "）" : ""}`
    );
    parts.push(`\n【未完成处理事项】\n${items.join("\n")}`);
  }

  const bilgeUnfinishedCount = shiftBilgeRecords.filter(
    (r) => isBilgeTreatmentUnfinished(r.treatmentResult) || r.liquidLevel >= 80 || r.pumpStatus === "故障"
  ).length;

  const totalUnfinished = shiftAnomalies.length + shiftUnfinishedRecords.length + bilgeUnfinishedCount;

  if (totalUnfinished > 0) {
    parts.push(`\n═══════════════════════════════`);
    parts.push(`⚠ 交接提醒：本班次共有 ${totalUnfinished} 项需关注的事项`);
    parts.push(`  明细分类：`);
    if (shiftAnomalies.length > 0) {
      parts.push(`    • 异常巡检项：${shiftAnomalies.length} 项未关闭`);
    }
    if (bilgeUnfinishedCount > 0) {
      parts.push(`    • 舱底水系统：${bilgeUnfinishedCount} 条记录需关注`);
    }
    if (shiftUnfinishedRecords.length > 0) {
      parts.push(`    • 未完成处理事项：${shiftUnfinishedRecords.length} 项`);
    }
    parts.push(`  请下一班次轮机员重点处理上述标记项目。`);
    parts.push(`═══════════════════════════════`);
  } else {
    parts.push(`\n═══════════════════════════════`);
    parts.push(`✓ 本班次运行正常，所有项目已妥善处理。`);
    parts.push(`  舱底水系统运行正常，无异常需关注。`);
    parts.push(`═══════════════════════════════`);
  }

  return parts.join("\n");
}

export interface ShiftDataForDirtyCheck {
  records: WatchRecord[];
  engineRoomRecords: EngineRoomRecord[];
  anomalyRecords: AnomalyRecord[];
  bilgeWaterRecords: BilgeWaterRecord[];
}

export function isDataDirty(
  shiftData: ShiftDataForDirtyCheck,
  summary: HandoverSummary | null
): boolean {
  if (!summary || !summary.dataHash) return true;
  const currentHash = computeDataHash(shiftData);
  return currentHash !== summary.dataHash;
}

export interface ShiftDataForRisk {
  engineRoomRecords: EngineRoomRecord[];
  bilgeWaterRecords: BilgeWaterRecord[];
  anomalyRecords: AnomalyRecord[];
}

export function computeRiskOnTheFly(
  shiftId: string,
  data: ShiftDataForRisk
): RiskAssessment | null {
  const shiftEngineRecords = data.engineRoomRecords;
  const shiftBilgeRecords = data.bilgeWaterRecords;
  const shiftAnomalyRecords = data.anomalyRecords;

  if (
    shiftEngineRecords.length === 0 &&
    shiftBilgeRecords.length === 0 &&
    shiftAnomalyRecords.length === 0
  ) {
    return null;
  }

  const latestEngine = selectLatestRecord(shiftEngineRecords);
  const latestBilge = selectLatestRecord(shiftBilgeRecords);

  const calcInput: RiskCalculationInput = {
    shiftId,
    engineRoomRecord: latestEngine,
    bilgeWaterRecord: latestBilge,
    anomalyRecords: shiftAnomalyRecords,
    engineRoomRecords: shiftEngineRecords,
    bilgeWaterRecords: shiftBilgeRecords,
  };

  const calculated = calculateRiskAssessment(calcInput);
  return {
    ...calculated,
    id: "on-the-fly",
    vesselId: null,
    fleetId: null,
    createdAt: new Date().toISOString(),
    createdBy: "on-the-fly",
    updatedAt: new Date().toISOString(),
    updatedBy: "on-the-fly",
    deletedAt: null,
  } as RiskAssessment;
}

export function buildRiskCalcInput(
  shiftId: string,
  engineRecords: EngineRoomRecord[],
  bilgeRecords: BilgeWaterRecord[],
  anomalyRecords: AnomalyRecord[]
): RiskCalculationInput {
  const latestEngine = selectLatestRecord(engineRecords);
  const latestBilge = selectLatestRecord(bilgeRecords);

  return {
    shiftId,
    engineRoomRecord: latestEngine,
    bilgeWaterRecord: latestBilge,
    anomalyRecords,
    engineRoomRecords: engineRecords,
    bilgeWaterRecords: bilgeRecords,
  };
}
