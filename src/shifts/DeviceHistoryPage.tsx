import { useState, useMemo, useEffect } from "react";
import { useShift } from "./ShiftContext";
import type { AnomalyRecord, WatchRecord } from "./types";
import type { BilgeWaterRecord } from "./types";
import {
  SHIFTS,
  getStatusClass,
  getBilgeLevelStatus,
  isBilgeTreatmentUnfinished,
} from "./types";

type DeviceCategory = "主机" | "发电机" | "泵组" | "舱底水";

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

function getShiftLabel(shiftId: string): string {
  const shift = SHIFTS.find((s) => s.id === shiftId);
  return shift ? shift.label : shiftId;
}

export function DeviceHistoryPage({
  onBack,
  initialCategory,
  initialDevice,
}: {
  onBack: () => void;
  initialCategory?: DeviceCategory;
  initialDevice?: string;
}) {
  const { records, allBilgeWaterRecords, allAnomalyRecords } = useShift();
  const [activeCategory, setActiveCategory] = useState<DeviceCategory>(initialCategory ?? "主机");
  const [activeDevice, setActiveDevice] = useState<string | null>(initialDevice ?? null);

  useEffect(() => {
    if (initialCategory) {
      setActiveCategory(initialCategory);
    }
  }, [initialCategory]);

  useEffect(() => {
    if (initialDevice) {
      setActiveDevice(initialDevice);
    } else {
      setActiveDevice(null);
    }
  }, [initialDevice]);

  const allRecords: WatchRecord[] = Object.values(records)
    .flat()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const categoryRecords = allRecords.filter((r) => matchCategory(r.device, activeCategory));
  const categoryAnomalies = allAnomalyRecords
    .filter((r) => matchCategory(r.device, activeCategory))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const deviceNames = useMemo(() => {
    const names = new Set<string>();
    categoryRecords.forEach((r) => names.add(r.device));
    categoryAnomalies.forEach((r) => names.add(r.device));
    return Array.from(names).sort();
  }, [categoryRecords, categoryAnomalies]);

  const filtered = useMemo(() => {
    if (!activeDevice) return categoryRecords;
    return categoryRecords.filter((r) => r.device === activeDevice);
  }, [categoryRecords, activeDevice]);
  const filteredAnomalies = useMemo(() => {
    if (!activeDevice) return categoryAnomalies;
    return categoryAnomalies.filter((r) => r.device === activeDevice);
  }, [categoryAnomalies, activeDevice]);

  const sortedBilgeRecords: BilgeWaterRecord[] = useMemo(() =>
    [...allBilgeWaterRecords].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ), [allBilgeWaterRecords]);

  const alertBilgeCount = sortedBilgeRecords.filter(
    (r) => getBilgeLevelStatus(r.liquidLevel) !== "normal" || isBilgeTreatmentUnfinished(r.treatmentResult)
  ).length;

  return (
    <main className="app">
      <section className="hero">
        <p>设备筛选 · 历史记录</p>
        <h1>按设备查看记录</h1>
        <span>
          切换设备类别，查看对应的历史巡检记录与异常处理状态
        </span>
      </section>

      <div className="device-filter-bar">
        {DEVICE_CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`device-filter-tab${activeCategory === cat ? " active" : ""}`}
            onClick={() => {
              setActiveCategory(cat);
              setActiveDevice(null);
            }}
          >
            {cat}
            {cat === "舱底水" && alertBilgeCount > 0 && (
              <span className="tab-alert-badge">{alertBilgeCount}</span>
            )}
          </button>
        ))}
        <button className="back-btn" onClick={onBack}>
          ← 返回首页
        </button>
      </div>

      {activeCategory === "舱底水" ? (
        <section className="panel bilge-history-panel">
          <div className="heading">
            <div>
              <p>舱底水 · 监控与异常记录</p>
              <h2>舱底水历史记录</h2>
            </div>
            <div className="history-stats-row">
              <span className="record-count">共 {sortedBilgeRecords.length + categoryAnomalies.length} 条</span>
              {alertBilgeCount > 0 && (
                <span className="bilge-alert-count">
                  <span className="alert-dot-blink" />
                  {alertBilgeCount} 条需关注
                </span>
              )}
            </div>
          </div>

          {sortedBilgeRecords.length === 0 && categoryAnomalies.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">💧</div>
              <p>暂无舱底水相关记录</p>
              <span>返回首页录入舱底水状态记录</span>
            </div>
          ) : sortedBilgeRecords.length > 0 ? (
            <div className="history-table-wrap">
              <table className="history-table bilge-history-table">
                <thead>
                  <tr>
                    <th>班次</th>
                    <th>液位</th>
                    <th>泵状态</th>
                    <th>运行时长</th>
                    <th>处理结果</th>
                    <th>警戒线备注</th>
                    <th>状态</th>
                    <th>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBilgeRecords.map((record) => {
                    const levelStatus = getBilgeLevelStatus(record.liquidLevel);
                    const treatmentUnfinished = isBilgeTreatmentUnfinished(record.treatmentResult);
                    const isAlert = levelStatus !== "normal" || treatmentUnfinished;
                    return (
                      <tr
                        key={record.id}
                        className={isAlert ? "bilge-alert-row" : ""}
                      >
                        <td>
                          <span className="shift-badge">{getShiftLabel(record.shiftId)}</span>
                        </td>
                        <td>
                          <div className="bilge-level-cell">
                            <span className={`bilge-level-value level-${levelStatus}`}>
                              {record.liquidLevel}%
                            </span>
                            {levelStatus !== "normal" && (
                              <span className={`bilge-level-tag level-tag-${levelStatus}`}>
                              {levelStatus === "danger" ? "危险" : "警戒"}
                            </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`pump-cell pump-${record.pumpStatus}`}>
                            <span className="pump-dot" />
                            {record.pumpStatus}
                          </span>
                        </td>
                        <td>{record.pumpRunDuration} min</td>
                        <td>
                          <span className={`status-tag ${treatmentUnfinished ? "status-processing" : "status-normal"}`}>
                            {record.treatmentResult}
                          </span>
                        </td>
                        <td className={record.warningNote ? "warning-note-cell" : ""}>
                          {record.warningNote || "--"}
                        </td>
                        <td>
                          {isAlert ? (
                            <span className="bilge-status-alert">
                              <span className="alert-icon-small" />
                              需关注
                            </span>
                          ) : (
                            <span className="bilge-status-ok">正常</span>
                          )}
                        </td>
                        <td className="time-cell">
                          {new Date(record.createdAt).toLocaleString("zh-CN")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {categoryAnomalies.length > 0 && (
            <section className="history-subsection anomaly-history-section">
              <div className="history-subsection-heading">
                <h3>异常巡检记录</h3>
                <span className="record-count">共 {categoryAnomalies.length} 条</span>
              </div>
              <div className="history-table-wrap">
                <table className="history-table anomaly-history-table">
                  <thead>
                    <tr>
                      <th>班次</th>
                      <th>设备名称</th>
                      <th>异常描述</th>
                      <th>当前状态</th>
                      <th>复查时间</th>
                      <th>时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryAnomalies.map((record) => (
                      <tr key={record.id}>
                        <td>
                          <span className="shift-badge">{getShiftLabel(record.shiftId)}</span>
                        </td>
                        <td className="device-name">{record.device}</td>
                        <td className="anomaly-text">{record.anomalyDescription}</td>
                        <td>
                          <span className={`status-tag ${getStatusClass(record.currentStatus)}`}>
                            {record.currentStatus}
                          </span>
                        </td>
                        <td className="time-cell">
                          {record.reviewTime ? new Date(record.reviewTime).toLocaleString("zh-CN") : "--"}
                        </td>
                        <td className="time-cell">
                          {new Date(record.createdAt).toLocaleString("zh-CN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </section>
      ) : (
        <section className="panel">
          <div className="heading">
            <div>
              <p>{activeCategory} · 设备记录</p>
              <h2>
                {activeDevice ? `${activeDevice} · ` : ""}
                {activeCategory}历史记录
              </h2>
            </div>
            <div className="history-stats-row">
              <span className="record-count">共 {filtered.length + filteredAnomalies.length} 条</span>
              {activeDevice && (
                <button
                  className="clear-device-filter-btn"
                  onClick={() => setActiveDevice(null)}
                >
                  清除设备筛选 ×
                </button>
              )}
            </div>
          </div>

          {deviceNames.length > 1 && (
            <div className="device-chip-filter">
              <button
                className={`device-chip${!activeDevice ? " active" : ""}`}
                onClick={() => setActiveDevice(null)}
              >
                全部设备
              </button>
              {deviceNames.map((name) => (
                <button
                  key={name}
                  className={`device-chip${activeDevice === name ? " active" : ""}`}
                  onClick={() => setActiveDevice(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          {filtered.length === 0 && filteredAnomalies.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <p>暂无{activeCategory}相关记录</p>
              <span>当前筛选条件下没有匹配的设备记录</span>
            </div>
          ) : (
            <div className="history-table-wrap">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>班次</th>
                    <th>设备名称</th>
                    <th>参数读数</th>
                    <th>异常描述</th>
                    <th>处理状态</th>
                    <th>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <span className="shift-badge">{getShiftLabel(record.shiftId)}</span>
                      </td>
                      <td className="device-name">{record.device}</td>
                      <td>{record.params || "--"}</td>
                      <td className={record.anomaly ? "anomaly-text" : ""}>
                        {record.anomaly || "--"}
                      </td>
                      <td>
                        <span className={`status-tag status-${statusClass(record.status)}`}>
                          {record.status || "--"}
                        </span>
                      </td>
                      <td className="time-cell">
                        {new Date(record.createdAt).toLocaleString("zh-CN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filteredAnomalies.length > 0 && (
            <section className="history-subsection anomaly-history-section">
              <div className="history-subsection-heading">
                <h3>异常巡检记录</h3>
                <span className="record-count">共 {filteredAnomalies.length} 条</span>
              </div>
              <div className="history-table-wrap">
                <table className="history-table anomaly-history-table">
                  <thead>
                    <tr>
                      <th>班次</th>
                      <th>设备名称</th>
                      <th>异常描述</th>
                      <th>当前状态</th>
                      <th>复查时间</th>
                      <th>时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAnomalies.map((record: AnomalyRecord) => (
                      <tr key={record.id}>
                        <td>
                          <span className="shift-badge">{getShiftLabel(record.shiftId)}</span>
                        </td>
                        <td className="device-name">{record.device}</td>
                        <td className="anomaly-text">{record.anomalyDescription}</td>
                        <td>
                          <span className={`status-tag ${getStatusClass(record.currentStatus)}`}>
                            {record.currentStatus}
                          </span>
                        </td>
                        <td className="time-cell">
                          {record.reviewTime ? new Date(record.reviewTime).toLocaleString("zh-CN") : "--"}
                        </td>
                        <td className="time-cell">
                          {new Date(record.createdAt).toLocaleString("zh-CN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </section>
      )}
    </main>
  );
}

function statusClass(status: string): string {
  if (!status) return "default";
  if (status === "正常巡检") return "normal";
  if (status === "已解决") return "resolved";
  if (status === "处理中") return "processing";
  if (status === "已安排复查") return "review";
  if (status === "已记录交班") return "handover";
  return "default";
}
