import { useMemo, useState } from "react";
import { useShift } from "./ShiftContext";
import { SHIFTS, getBilgeLevelStatus, isBilgeTreatmentUnfinished } from "./types";
import type { AnomalyRecord, WatchRecord, BilgeWaterRecord } from "./types";

type DeviceCategory = "主机" | "发电机" | "泵组" | "舱底水";
type ReminderType = "待复查" | "连续异常" | "已处理";

const DEVICE_CATEGORIES: DeviceCategory[] = ["主机", "发电机", "泵组", "舱底水"];

const CATEGORY_KEYWORDS: Record<DeviceCategory, string[]> = {
  主机: ["主机", "主柴油", "主推进", "main engine"],
  发电机: ["发电机", "发电", "柴油发电", "generator"],
  泵组: ["泵", "泵组", "水泵", "油泵", "pump"],
  舱底水: ["舱底", "舱底水", "压载", "bilge"],
};

function matchCategory(device: string, category: DeviceCategory): boolean {
  const name = device.toLowerCase();
  return CATEGORY_KEYWORDS[category].some((kw) => name.includes(kw.toLowerCase()));
}

function getCategoryByDevice(device: string): DeviceCategory | null {
  for (const cat of DEVICE_CATEGORIES) {
    if (matchCategory(device, cat)) return cat;
  }
  return null;
}

const SHIFT_ORDER: Record<string, number> = {};
SHIFTS.forEach((s, i) => { SHIFT_ORDER[s.id] = i; });

interface ReminderItem {
  id: string;
  deviceName: string;
  category: DeviceCategory;
  reminderType: ReminderType;
  anomalyCount: number;
  latestAnomaly: string;
  latestTime: string;
  consecutiveShifts: number;
}

function buildReviewReminders(anomalyRecords: AnomalyRecord[]): ReminderItem[] {
  return anomalyRecords
    .filter((r) => r.currentStatus === "需复查")
    .map((r) => {
      const category = getCategoryByDevice(r.device) ?? "主机";
      return {
        id: `review-${r.id}`,
        deviceName: r.device,
        category,
        reminderType: "待复查" as ReminderType,
        anomalyCount: 1,
        latestAnomaly: r.anomalyDescription,
        latestTime: r.createdAt,
        consecutiveShifts: 0,
      };
    });
}

function buildProcessedReminders(anomalyRecords: AnomalyRecord[]): ReminderItem[] {
  return anomalyRecords
    .filter((r) => r.currentStatus === "已处理" || r.currentStatus === "已关闭")
    .map((r) => {
      const category = getCategoryByDevice(r.device) ?? "主机";
      return {
        id: `processed-${r.id}`,
        deviceName: r.device,
        category,
        reminderType: "已处理" as ReminderType,
        anomalyCount: 1,
        latestAnomaly: r.anomalyDescription,
        latestTime: r.statusHistory.length > 0
          ? r.statusHistory[r.statusHistory.length - 1].updatedAt
          : r.createdAt,
        consecutiveShifts: 0,
      };
    });
}

function buildContinuousAnomalyReminders(
  records: Record<string, WatchRecord[]>,
  bilgeRecords: Record<string, BilgeWaterRecord[]>,
  anomalyRecords: Record<string, AnomalyRecord[]>
): ReminderItem[] {
  const reminders: ReminderItem[] = [];

  const deviceShiftMap: Record<string, string[]> = {};
  const deviceAnomalyMap: Record<string, { count: number; latestAnomaly: string; latestTime: string }> = {};

  const addAnomalyForDevice = (device: string, shiftId: string, anomalyDesc: string, time: string) => {
    if (!deviceShiftMap[device]) {
      deviceShiftMap[device] = [];
      deviceAnomalyMap[device] = { count: 0, latestAnomaly: "", latestTime: "" };
    }
    if (!deviceShiftMap[device].includes(shiftId)) {
      deviceShiftMap[device].push(shiftId);
    }
    deviceAnomalyMap[device].count++;
    if (!deviceAnomalyMap[device].latestTime || time > deviceAnomalyMap[device].latestTime) {
      deviceAnomalyMap[device].latestAnomaly = anomalyDesc;
      deviceAnomalyMap[device].latestTime = time;
    }
  };

  for (const [shiftId, shiftRecords] of Object.entries(records)) {
    for (const r of shiftRecords) {
      if (!r.anomaly || r.anomaly.trim() === "") continue;
      addAnomalyForDevice(r.device, shiftId, r.anomaly, r.createdAt);
    }
  }

  for (const [shiftId, shiftAnomalies] of Object.entries(anomalyRecords)) {
    for (const r of shiftAnomalies) {
      if (r.currentStatus === "已关闭" || r.currentStatus === "已处理") continue;
      addAnomalyForDevice(r.device, shiftId, r.anomalyDescription, r.createdAt);
    }
  }

  const bilgeAnomalyShifts: string[] = [];
  let bilgeAnomalyCount = 0;
  let bilgeLatestAnomaly = "";
  let bilgeLatestTime = "";

  for (const [shiftId, shiftBilge] of Object.entries(bilgeRecords)) {
    let shiftHasBilgeAnomaly = false;
    for (const r of shiftBilge) {
      const levelStatus = getBilgeLevelStatus(r.liquidLevel);
      const treatmentUnfinished = isBilgeTreatmentUnfinished(r.treatmentResult);
      if (levelStatus !== "normal" || treatmentUnfinished || r.pumpStatus === "故障") {
        shiftHasBilgeAnomaly = true;
        bilgeAnomalyCount++;
        if (!bilgeLatestTime || r.createdAt > bilgeLatestTime) {
          bilgeLatestAnomaly = `液位${r.liquidLevel}%${levelStatus !== "normal" ? (levelStatus === "danger" ? "·危险" : "·警戒") : ""}${r.pumpStatus === "故障" ? "·泵故障" : ""}${treatmentUnfinished ? "·处理未完成" : ""}`;
          bilgeLatestTime = r.createdAt;
        }
      }
    }
    if (shiftHasBilgeAnomaly && !bilgeAnomalyShifts.includes(shiftId)) {
      bilgeAnomalyShifts.push(shiftId);
    }
  }

  if (bilgeAnomalyShifts.length >= 2) {
    const sortedShifts = bilgeAnomalyShifts.sort((a, b) => (SHIFT_ORDER[a] ?? 0) - (SHIFT_ORDER[b] ?? 0));
    let maxConsecutive = 1;
    let currentConsecutive = 1;
    for (let i = 1; i < sortedShifts.length; i++) {
      const prevOrder = SHIFT_ORDER[sortedShifts[i - 1]] ?? 0;
      const currOrder = SHIFT_ORDER[sortedShifts[i]] ?? 0;
      if (currOrder - prevOrder === 1 || (prevOrder === 5 && currOrder === 0)) {
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else {
        currentConsecutive = 1;
      }
    }
    if (maxConsecutive >= 2) {
      reminders.push({
        id: "continuous-舱底水",
        deviceName: "舱底水系统",
        category: "舱底水",
        reminderType: "连续异常",
        anomalyCount: bilgeAnomalyCount,
        latestAnomaly: bilgeLatestAnomaly,
        latestTime: bilgeLatestTime,
        consecutiveShifts: maxConsecutive,
      });
    }
  }

  for (const [device, shiftIds] of Object.entries(deviceShiftMap)) {
    if (shiftIds.length < 2) continue;
    const category = getCategoryByDevice(device) ?? "主机";
    const sortedShifts = shiftIds.sort((a, b) => (SHIFT_ORDER[a] ?? 0) - (SHIFT_ORDER[b] ?? 0));
    let maxConsecutive = 1;
    let currentConsecutive = 1;
    for (let i = 1; i < sortedShifts.length; i++) {
      const prevOrder = SHIFT_ORDER[sortedShifts[i - 1]] ?? 0;
      const currOrder = SHIFT_ORDER[sortedShifts[i]] ?? 0;
      if (currOrder - prevOrder === 1 || (prevOrder === 5 && currOrder === 0)) {
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else {
        currentConsecutive = 1;
      }
    }
    if (maxConsecutive >= 2) {
      reminders.push({
        id: `continuous-${device}`,
        deviceName: device,
        category,
        reminderType: "连续异常",
        anomalyCount: deviceAnomalyMap[device].count,
        latestAnomaly: deviceAnomalyMap[device].latestAnomaly,
        latestTime: deviceAnomalyMap[device].latestTime,
        consecutiveShifts: maxConsecutive,
      });
    }
  }

  return reminders;
}

type FilterType = "全部" | "待复查" | "连续异常" | "已处理";

export function MaintenanceReminder({
  onNavigateToHistory,
}: {
  onNavigateToHistory: (category: DeviceCategory, deviceName?: string) => void;
}) {
  const { records, anomalyRecords, allAnomalyRecords, bilgeWaterRecords } = useShift();
  const [activeFilter, setActiveFilter] = useState<FilterType>("全部");

  const allReminders = useMemo(() => {
    const review = buildReviewReminders(allAnomalyRecords);
    const processed = buildProcessedReminders(allAnomalyRecords);
    const continuous = buildContinuousAnomalyReminders(records, bilgeWaterRecords, anomalyRecords);
    return [...review, ...continuous, ...processed];
  }, [allAnomalyRecords, records, bilgeWaterRecords, anomalyRecords]);

  const filteredReminders = useMemo(() => {
    if (activeFilter === "全部") return allReminders;
    return allReminders.filter((r) => r.reminderType === activeFilter);
  }, [allReminders, activeFilter]);

  const counts = useMemo(() => ({
    all: allReminders.length,
    review: allReminders.filter((r) => r.reminderType === "待复查").length,
    continuous: allReminders.filter((r) => r.reminderType === "连续异常").length,
    processed: allReminders.filter((r) => r.reminderType === "已处理").length,
  }), [allReminders]);

  return (
    <section className="panel maintenance-reminder-panel">
      <div className="heading">
        <div>
          <p>设备维保</p>
          <h2>维保提醒</h2>
        </div>
        {counts.review + counts.continuous > 0 && (
          <span className="reminder-alert-badge">
            <span className="alert-dot-blink" />
            {counts.review + counts.continuous} 条需关注
          </span>
        )}
      </div>

      <div className="reminder-filter-bar">
        {(["全部", "待复查", "连续异常", "已处理"] as FilterType[]).map((f) => (
          <button
            key={f}
            className={`reminder-filter-tab${activeFilter === f ? " active" : ""}`}
            onClick={() => setActiveFilter(f)}
          >
            {f}
            {f === "全部" && counts.all > 0 && <span className="reminder-count-badge">{counts.all}</span>}
            {f === "待复查" && counts.review > 0 && <span className="reminder-count-badge badge-danger">{counts.review}</span>}
            {f === "连续异常" && counts.continuous > 0 && <span className="reminder-count-badge badge-warning">{counts.continuous}</span>}
            {f === "已处理" && counts.processed > 0 && <span className="reminder-count-badge badge-success">{counts.processed}</span>}
          </button>
        ))}
      </div>

      {filteredReminders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <p>暂无维保提醒</p>
          <span>所有设备运行正常，无异常记录</span>
        </div>
      ) : (
        <div className="reminder-list">
          {filteredReminders.map((item) => (
            <div
              key={item.id}
              className={`reminder-card reminder-type-${item.reminderType === "待复查" ? "review" : item.reminderType === "连续异常" ? "continuous" : "processed"}`}
            >
              <div className="reminder-card-header">
                <span className={`reminder-type-tag type-${item.reminderType === "待复查" ? "review" : item.reminderType === "连续异常" ? "continuous" : "processed"}`}>
                  {item.reminderType}
                </span>
                <span className="reminder-category-tag">{item.category}</span>
                <span className="reminder-time">{new Date(item.latestTime).toLocaleString("zh-CN")}</span>
              </div>
              <div className="reminder-card-body">
                <h4 className="reminder-device-name">{item.deviceName}</h4>
                <p className="reminder-anomaly-desc">{item.latestAnomaly}</p>
                <div className="reminder-meta">
                  <span className="reminder-anomaly-count">异常 {item.anomalyCount} 次</span>
                  {item.consecutiveShifts > 0 && (
                    <span className="reminder-consecutive">连续 {item.consecutiveShifts} 个班次</span>
                  )}
                </div>
              </div>
              <button
                className="reminder-goto-btn"
                onClick={() => onNavigateToHistory(item.category, item.category === "舱底水" ? undefined : item.deviceName)}
              >
                查看历史记录 →
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
