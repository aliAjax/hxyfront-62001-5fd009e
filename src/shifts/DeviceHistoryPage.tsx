import { useState } from "react";
import { useShift } from "./ShiftContext";
import type { WatchRecord } from "./types";
import { SHIFTS } from "./types";

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

export function DeviceHistoryPage({ onBack }: { onBack: () => void }) {
  const { records } = useShift();
  const [activeCategory, setActiveCategory] = useState<DeviceCategory>("主机");

  const allRecords: WatchRecord[] = Object.values(records)
    .flat()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const filtered = allRecords.filter((r) => matchCategory(r.device, activeCategory));

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
          </button>
        ))}
        <button className="back-btn" onClick={onBack}>
          ← 返回首页
        </button>
      </div>

      <section className="panel">
        <div className="heading">
          <div>
            <p>{activeCategory} · 设备记录</p>
            <h2>{activeCategory}历史记录</h2>
          </div>
          <span className="record-count">共 {filtered.length} 条</span>
        </div>

        {filtered.length === 0 ? (
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
      </section>
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
