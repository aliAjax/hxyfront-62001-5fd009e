import { useState, useMemo, useEffect } from "react";
import { useShift } from "./ShiftContext";
import type { AnomalyRecord, WatchRecord, DeviceCategory, BilgeWaterRecord } from "./types";
import {
  SHIFTS,
  DEVICE_CATEGORIES,
  CATEGORY_KEYWORDS,
  getStatusClass,
  getBilgeLevelStatus,
  isBilgeTreatmentUnfinished,
  matchCategory,
} from "./types";

interface FilterCriteria {
  category?: DeviceCategory;
  device?: string;
  shiftId?: string;
  startDate?: string;
  endDate?: string;
}

function matchDeviceName(device: string, search: string): boolean {
  if (!search) return true;
  return device.toLowerCase().includes(search.toLowerCase());
}

function isInDateRange(createdAt: string, startDate?: string, endDate?: string): boolean {
  const recordDate = new Date(createdAt);
  if (startDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    if (recordDate < start) return false;
  }
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    if (recordDate > end) return false;
  }
  return true;
}

function filterRecordsByCriteria<T extends { shiftId: string; createdAt: string; device?: string }>(
  records: T[],
  criteria: FilterCriteria
): T[] {
  return records.filter((r) => {
    if (criteria.category) {
      if (r.device) {
        if (!matchCategory(r.device, criteria.category)) return false;
      } else {
        if (criteria.category !== "舱底水") return false;
      }
    }
    if (criteria.device && r.device && !matchDeviceName(r.device, criteria.device)) return false;
    if (criteria.device && !r.device) return false;
    if (criteria.shiftId && r.shiftId !== criteria.shiftId) return false;
    if (!isInDateRange(r.createdAt, criteria.startDate, criteria.endDate)) return false;
    return true;
  });
}

function getShiftLabel(shiftId: string): string {
  const shift = SHIFTS.find((s) => s.id === shiftId);
  return shift ? shift.label : shiftId;
}

type ViewMode = "table" | "grouped";

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
  const [selectedShiftId, setSelectedShiftId] = useState<string>("");
  const [deviceSearch, setDeviceSearch] = useState<string>(initialDevice ?? "");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  const handleResetFilters = () => {
    setActiveCategory(initialCategory ?? "主机");
    setSelectedShiftId("");
    setDeviceSearch("");
    setStartDate("");
    setEndDate("");
  };

  useEffect(() => {
    if (initialCategory) {
      setActiveCategory(initialCategory);
    }
  }, [initialCategory]);

  useEffect(() => {
    if (initialDevice) {
      setDeviceSearch(initialDevice);
    }
  }, [initialDevice]);

  const allRecords: WatchRecord[] = useMemo(
    () =>
      Object.values(records)
        .flat()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [records]
  );

  const criteria: FilterCriteria = {
    category: activeCategory,
    device: deviceSearch || undefined,
    shiftId: selectedShiftId || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  };

  const sortedBilgeRecords: BilgeWaterRecord[] = useMemo(
    () =>
      [...filterRecordsByCriteria(allBilgeWaterRecords, criteria)].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [allBilgeWaterRecords, criteria]
  );

  const alertBilgeCount = useMemo(
    () =>
      sortedBilgeRecords.filter(
        (r) => getBilgeLevelStatus(r.liquidLevel) !== "normal" || isBilgeTreatmentUnfinished(r.treatmentResult)
      ).length,
    [sortedBilgeRecords]
  );

  const allBilgeAlertCount = useMemo(
    () =>
      allBilgeWaterRecords.filter(
        (r) => getBilgeLevelStatus(r.liquidLevel) !== "normal" || isBilgeTreatmentUnfinished(r.treatmentResult)
      ).length,
    [allBilgeWaterRecords]
  );

  const filtered = useMemo(() => filterRecordsByCriteria(allRecords, criteria), [allRecords, criteria]);
  const filteredAnomalies = useMemo(
    () =>
      filterRecordsByCriteria(allAnomalyRecords, criteria).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [allAnomalyRecords, criteria]
  );

  const deviceNames = useMemo(() => {
    const names = new Set<string>();
    allRecords.forEach((r) => names.add(r.device));
    allAnomalyRecords.forEach((r) => names.add(r.device));
    return Array.from(names).sort();
  }, [allRecords, allAnomalyRecords]);

  const groupedRecords = useMemo(() => {
    const groups: Record<string, { watch: WatchRecord[]; anomalies: AnomalyRecord[]; bilge: BilgeWaterRecord[] }> = {};
    SHIFTS.forEach((s) => {
      groups[s.id] = { watch: [], anomalies: [], bilge: [] };
    });
    filtered.forEach((r) => {
      if (!groups[r.shiftId]) groups[r.shiftId] = { watch: [], anomalies: [], bilge: [] };
      groups[r.shiftId].watch.push(r);
    });
    filteredAnomalies.forEach((r) => {
      if (!groups[r.shiftId]) groups[r.shiftId] = { watch: [], anomalies: [], bilge: [] };
      groups[r.shiftId].anomalies.push(r);
    });
    if (activeCategory === "舱底水") {
      sortedBilgeRecords.forEach((r) => {
        if (!groups[r.shiftId]) groups[r.shiftId] = { watch: [], anomalies: [], bilge: [] };
        groups[r.shiftId].bilge.push(r);
      });
    }
    return groups;
  }, [filtered, filteredAnomalies, sortedBilgeRecords, activeCategory]);

  const renderWatchTable = (records: WatchRecord[]) => (
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
          {records.map((record) => (
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
  );

  const renderAnomalyTable = (records: AnomalyRecord[]) => (
    <section className="history-subsection anomaly-history-section">
      <div className="history-subsection-heading">
        <h3>异常巡检记录</h3>
        <span className="record-count">共 {records.length} 条</span>
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
            {records.map((record) => (
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
  );

  const renderBilgeTable = (records: BilgeWaterRecord[]) => (
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
          {records.map((record) => {
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
  );

  const hasAnyRecords =
    filtered.length > 0 || filteredAnomalies.length > 0 || sortedBilgeRecords.length > 0;

  const emptyIcon = activeCategory === "舱底水" ? "💧" : "📋";

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
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
            {cat === "舱底水" && allBilgeAlertCount > 0 && (
              <span className="tab-alert-badge">{allBilgeAlertCount}</span>
            )}
          </button>
        ))}
        <button className="back-btn" onClick={onBack}>
          ← 返回首页
        </button>
      </div>

      <div className="history-filter-row">
        <select
          className="shift-filter-select"
          value={selectedShiftId}
          onChange={(e) => setSelectedShiftId(e.target.value)}
        >
          <option value="">全部班次</option>
          {SHIFTS.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>

        <input
          type="text"
          className="device-search-input"
          placeholder="搜索设备名称..."
          value={deviceSearch}
          onChange={(e) => setDeviceSearch(e.target.value)}
          list="device-names-list"
        />
        <datalist id="device-names-list">
          {deviceNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        <div className="date-range-filter">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <span>至</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <button
          className="reset-filter-btn"
          onClick={handleResetFilters}
        >
          ↺ 重置筛选
        </button>

        <div className="view-toggle">
          <button
            className={`view-toggle-btn${viewMode === "table" ? " active" : ""}`}
            onClick={() => setViewMode("table")}
          >
            表格视图
          </button>
          <button
            className={`view-toggle-btn${viewMode === "grouped" ? " active" : ""}`}
            onClick={() => setViewMode("grouped")}
          >
            按班次分组
          </button>
        </div>
      </div>

      {activeCategory === "舱底水" ? (
        <section className="panel bilge-history-panel">
          <div className="heading">
            <div>
              <p>舱底水 · 监控与异常记录</p>
              <h2>舱底水历史记录</h2>
            </div>
            <div className="history-stats-row">
              <span className="record-count">共 {sortedBilgeRecords.length + filteredAnomalies.length} 条</span>
              {alertBilgeCount > 0 && (
                <span className="bilge-alert-count">
                  <span className="alert-dot-blink" />
                  {alertBilgeCount} 条需关注
                </span>
              )}
            </div>
          </div>

          {viewMode === "table" ? (
            !hasAnyRecords ? (
              <div className="empty-state">
                <div className="empty-icon">{emptyIcon}</div>
                <p>暂无舱底水相关记录</p>
                <span>返回首页录入舱底水状态记录</span>
              </div>
            ) : (
              <>
                {sortedBilgeRecords.length > 0 && renderBilgeTable(sortedBilgeRecords)}
                {filteredAnomalies.length > 0 && renderAnomalyTable(filteredAnomalies)}
              </>
            )
          ) : (
            <div className="grouped-view">
              {!hasAnyRecords ? (
                <div className="empty-state">
                  <div className="empty-icon">{emptyIcon}</div>
                  <p>暂无舱底水相关记录</p>
                  <span>返回首页录入舱底水状态记录</span>
                </div>
              ) : (
                SHIFTS.map((shift) => {
                  const group = groupedRecords[shift.id];
                  const groupTotal = group.watch.length + group.anomalies.length + group.bilge.length;
                  if (groupTotal === 0) return null;
                  return (
                    <div key={shift.id} className="shift-group">
                      <div className="shift-group-header">
                        <h3>
                          <span className="shift-badge">{shift.label}</span>
                        </h3>
                        <div className="shift-group-stats">
                          <span>舱底水记录: {group.bilge.length} 条</span>
                          {group.anomalies.length > 0 && (
                            <span>异常记录: {group.anomalies.length} 条</span>
                          )}
                          <span className="record-count">共 {groupTotal} 条</span>
                        </div>
                      </div>
                      {group.bilge.length > 0 && renderBilgeTable(group.bilge)}
                      {group.anomalies.length > 0 && renderAnomalyTable(group.anomalies)}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </section>
      ) : (
        <section className="panel">
          <div className="heading">
            <div>
              <p>{activeCategory} · 设备记录</p>
              <h2>
                {deviceSearch ? `${deviceSearch} · ` : ""}
                {activeCategory}历史记录
              </h2>
            </div>
            <div className="history-stats-row">
              <span className="record-count">共 {filtered.length + filteredAnomalies.length} 条</span>
              {deviceSearch && (
                <button
                  className="clear-device-filter-btn"
                  onClick={() => setDeviceSearch("")}
                >
                  清除设备筛选 ×
                </button>
              )}
            </div>
          </div>

          {viewMode === "table" ? (
            !hasAnyRecords ? (
              <div className="empty-state">
                <div className="empty-icon">{emptyIcon}</div>
                <p>暂无{activeCategory}相关记录</p>
                <span>当前筛选条件下没有匹配的设备记录</span>
              </div>
            ) : (
              <>
                {filtered.length > 0 && renderWatchTable(filtered)}
                {filteredAnomalies.length > 0 && renderAnomalyTable(filteredAnomalies)}
              </>
            )
          ) : (
            <div className="grouped-view">
              {!hasAnyRecords ? (
                <div className="empty-state">
                  <div className="empty-icon">{emptyIcon}</div>
                  <p>暂无{activeCategory}相关记录</p>
                  <span>当前筛选条件下没有匹配的设备记录</span>
                </div>
              ) : (
                SHIFTS.map((shift) => {
                  const group = groupedRecords[shift.id];
                  const groupTotal = group.watch.length + group.anomalies.length;
                  if (groupTotal === 0) return null;
                  return (
                    <div key={shift.id} className="shift-group">
                      <div className="shift-group-header">
                        <h3>
                          <span className="shift-badge">{shift.label}</span>
                        </h3>
                        <div className="shift-group-stats">
                          <span>巡检记录: {group.watch.length} 条</span>
                          {group.anomalies.length > 0 && (
                            <span>异常记录: {group.anomalies.length} 条</span>
                          )}
                          <span className="record-count">共 {groupTotal} 条</span>
                        </div>
                      </div>
                      {group.watch.length > 0 && renderWatchTable(group.watch)}
                      {group.anomalies.length > 0 && renderAnomalyTable(group.anomalies)}
                    </div>
                  );
                })
              )}
            </div>
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
