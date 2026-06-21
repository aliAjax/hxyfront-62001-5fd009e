import { useState, useMemo, useEffect } from "react";
import { useShift } from "./ShiftContext";
import type { RiskLevel, RiskTrigger, RiskTimelineEvent } from "./domain";
import { ENGINE_THRESHOLDS, ANOMALY_COUNT_THRESHOLDS } from "./domain";

const TRIGGER_TYPE_LABELS: Record<string, string> = {
  engine_speed: "主机转速",
  lubricating_oil: "滑油压力",
  cooling_water: "冷却水温",
  fuel_consumption: "燃油消耗",
  bilge_water: "舱底水状态",
  anomaly_pending: "待处理异常",
  anomaly_count: "异常数量",
};

const TIMELINE_TYPE_LABELS: Record<string, string> = {
  anomaly: "异常记录",
  engine: "机舱参数",
  bilge: "舱底水",
  assessment: "风险评估",
};

function getRiskLevelClass(level: RiskLevel): string {
  return `risk-level-${level}`;
}

function getRiskLevelBadgeClass(level: RiskLevel): string {
  return `risk-badge-${level}`;
}

function formatDateTime(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RiskMeter({ level, score }: { level: RiskLevel; score: number }) {
  const maxScore = 30;
  const percent = Math.min(100, Math.round((score / maxScore) * 100));
  const segments = [
    { key: "safe", threshold: 10, color: "#10b981", label: "安全" },
    { key: "low", threshold: 30, color: "#84cc16", label: "低风险" },
    { key: "medium", threshold: 50, color: "#f59e0b", label: "中风险" },
    { key: "high", threshold: 75, color: "#ef4444", label: "高风险" },
    { key: "critical", threshold: 100, color: "#991b1b", label: "严重" },
  ];

  return (
    <div className="risk-meter-container">
      <div className="risk-meter-scale">
        {segments.map((seg) => (
          <div
            key={seg.key}
            className="risk-meter-segment"
            style={{
              width: `${seg.threshold - (segments.indexOf(seg) > 0 ? segments[segments.indexOf(seg) - 1].threshold : 0)}%`,
              background: seg.color,
            }}
          />
        ))}
        <div
          className="risk-meter-indicator"
          style={{ left: `${percent}%` }}
        >
          <div className="risk-meter-pointer" />
        </div>
      </div>
      <div className="risk-meter-labels">
        {segments.map((seg) => (
          <span key={seg.key} className="risk-meter-label">
            {seg.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function TriggerCard({ trigger, onLinkClick }: { trigger: RiskTrigger; onLinkClick: (ids: string[], type: "anomaly" | "record") => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`risk-trigger-card ${getRiskLevelClass(trigger.level)}`}>
      <div className="risk-trigger-header" onClick={() => setExpanded(!expanded)}>
        <div className="risk-trigger-left">
          <span className={`risk-level-badge ${getRiskLevelBadgeClass(trigger.level)}`}>
            {({ safe: "安全", low: "低", medium: "中", high: "高", critical: "严重" } as Record<RiskLevel, string>)[trigger.level]}
          </span>
          <div className="risk-trigger-type">
            {TRIGGER_TYPE_LABELS[trigger.type] || trigger.type}
          </div>
        </div>
        <div className="risk-trigger-title">
          {trigger.title}
          <span className="expand-arrow">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>
      {expanded && (
        <div className="risk-trigger-detail">
          <p className="risk-trigger-desc">{trigger.description}</p>
          {trigger.value && trigger.threshold && (
            <div className="risk-trigger-values">
              <div className="value-item">
                <span className="value-label">当前值</span>
                <span className="value-content risk-highlight">{trigger.value}</span>
              </div>
              <div className="value-item">
                <span className="value-label">阈值范围</span>
                <span className="value-content">{trigger.threshold}</span>
              </div>
            </div>
          )}
          {trigger.timestamp && (
            <div className="risk-trigger-time">
              发生时间：{formatDateTime(trigger.timestamp)}
            </div>
          )}
          {trigger.linkedAnomalyIds && trigger.linkedAnomalyIds.length > 0 && (
            <button
              className="risk-link-btn"
              onClick={() => onLinkClick(trigger.linkedAnomalyIds!, "anomaly")}
            >
              查看关联异常 ({trigger.linkedAnomalyIds.length}项) →
            </button>
          )}
          {trigger.linkedRecordIds && trigger.linkedRecordIds.length > 0 && (
            <button
              className="risk-link-btn"
              onClick={() => onLinkClick(trigger.linkedRecordIds!, "record")}
            >
              查看关联记录 ({trigger.linkedRecordIds.length}项) →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TimelineEventItem({ event, onItemClick }: { event: RiskTimelineEvent; onItemClick: (id: string, type: string) => void }) {
  return (
    <div
      className={`risk-timeline-item ${getRiskLevelClass(event.level)}`}
      onClick={() => event.linkedRecordId && onItemClick(event.linkedRecordId, event.type)}
    >
      <div className={`risk-timeline-dot risk-dot-${event.level}`} />
      <div className="risk-timeline-content">
        <div className="risk-timeline-header">
          <span className={`risk-level-mini-badge ${getRiskLevelBadgeClass(event.level)}`}>
            {({ safe: "安全", low: "低", medium: "中", high: "高", critical: "严重" } as Record<RiskLevel, string>)[event.level]}
          </span>
          <span className="risk-timeline-type">{TIMELINE_TYPE_LABELS[event.type] || event.type}</span>
          <span className="risk-timeline-time">{formatDateTime(event.timestamp)}</span>
        </div>
        <h4 className="risk-timeline-title">{event.title}</h4>
        <p className="risk-timeline-desc">{event.description}</p>
        {event.linkedRecordId && (
          <span className="risk-timeline-link">点击查看详情 →</span>
        )}
      </div>
    </div>
  );
}

export function RiskAssessmentPanel() {
  const {
    currentShift,
    currentEngineRoomRecords,
    currentBilgeWaterRecords,
    allAnomalyRecords,
    latestRiskAssessment,
    currentRiskAssessments,
    calculateRisk,
    computeRiskOnTheFly,
    riskLevelLabels,
    riskLevelOrder,
  } = useShift();

  const [saved, setSaved] = useState(false);
  const [showTriggers, setShowTriggers] = useState(true);
  const [showTimeline, setShowTimeline] = useState(true);
  const [showRecommendation, setShowRecommendation] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<{ ids: string[]; type: "anomaly" | "record" } | null>(null);

  const liveAssessment = useMemo(() => computeRiskOnTheFly(), [
    computeRiskOnTheFly,
    currentEngineRoomRecords,
    currentBilgeWaterRecords,
    allAnomalyRecords,
  ]);

  const displayAssessment = latestRiskAssessment || liveAssessment;

  const sortedTriggers = useMemo(() => {
    if (!displayAssessment) return [];
    const levelPriority: Record<RiskLevel, number> = { critical: 0, high: 1, medium: 2, low: 3, safe: 4 };
    return [...displayAssessment.triggers].sort(
      (a, b) => levelPriority[a.level] - levelPriority[b.level]
    );
  }, [displayAssessment]);

  const triggerStats = useMemo(() => {
    const stats: Record<RiskLevel, number> = { safe: 0, low: 0, medium: 0, high: 0, critical: 0 };
    sortedTriggers.forEach((t) => {
      stats[t.level] = (stats[t.level] || 0) + 1;
    });
    return stats;
  }, [sortedTriggers]);

  const hasNewData = useMemo(() => {
    if (!displayAssessment || !displayAssessment.dataSnapshot) return false;
    if (!latestRiskAssessment) return currentEngineRoomRecords.length + currentBilgeWaterRecords.length + allAnomalyRecords.filter((r) => r.shiftId === currentShift.id).length > 0;
    const snap = displayAssessment.dataSnapshot;
    const currentAnomalyCount = allAnomalyRecords.filter((r) => !r.deletedAt && r.shiftId === currentShift.id).length;
    return snap.anomalyIds.length !== currentAnomalyCount;
  }, [displayAssessment, latestRiskAssessment, currentEngineRoomRecords, currentBilgeWaterRecords, allAnomalyRecords, currentShift.id]);

  useEffect(() => {
    if (highlightedIds) {
      const timer = setTimeout(() => setHighlightedIds(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightedIds]);

  const handleCalculate = () => {
    calculateRisk();
    setSaved(true);
    setToastMessage("风险评估已保存");
    setTimeout(() => setSaved(false), 2000);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleLinkClick = (ids: string[], type: "anomaly" | "record") => {
    setHighlightedIds({ ids, type });
    const element = document.getElementById(type === "anomaly" ? "anomaly-timeline-section" : "history-records-section");
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const handleTimelineItemClick = (id: string, type: string) => {
    setHighlightedIds({ ids: [id], type: type as "anomaly" | "record" });
    const sectionId = type === "anomaly" ? "anomaly-timeline-section" : type === "engine" ? "engine-room-section" : type === "bilge" ? "bilge-water-section" : null;
    if (sectionId) {
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  };

  if (!displayAssessment) {
    return (
      <section className="panel risk-panel" id="risk-assessment-section">
        {toastMessage && <div className="risk-toast">{toastMessage}</div>}
        <div className="heading">
          <div>
            <p>{currentShift.label} · 风险评估</p>
            <h2>轮机值班风险评估</h2>
          </div>
          <button className="primary" onClick={handleCalculate}>
            {saved ? "已保存 ✓" : "开始评估"}
          </button>
        </div>
        <div className="risk-empty-state">
          <div className="risk-empty-icon">⚓</div>
          <h3>暂无评估数据</h3>
          <p>请先录入机舱参数、舱底水状态或异常巡检记录，然后点击「开始评估」进行风险计算。</p>
          <div className="risk-empty-tips">
            <div className="tip-item">
              <span className="tip-icon">📊</span>
              <div>
                <strong>机舱参数</strong>
                <p>主机转速、滑油压力、冷却水温、燃油消耗</p>
              </div>
            </div>
            <div className="tip-item">
              <span className="tip-icon">💧</span>
              <div>
                <strong>舱底水状态</strong>
                <p>液位高度、泵运行状态、处理结果</p>
              </div>
            </div>
            <div className="tip-item">
              <span className="tip-icon">⚠️</span>
              <div>
                <strong>异常巡检</strong>
                <p>设备异常记录及其处理状态</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`panel risk-panel ${getRiskLevelClass(displayAssessment.overallLevel)}-panel`} id="risk-assessment-section">
      {toastMessage && <div className="risk-toast">{toastMessage}</div>}

      <div className="heading">
        <div>
          <p>{currentShift.label} · 风险评估</p>
          <h2>轮机值班风险评估</h2>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {currentRiskAssessments.length > 0 && (
            <span className="risk-history-count">历史 {currentRiskAssessments.length} 次</span>
          )}
          {hasNewData && <span className="risk-dirty-indicator">数据已更新</span>}
          <button className="primary" onClick={handleCalculate}>
            {saved ? "已保存 ✓" : liveAssessment && !latestRiskAssessment ? "保存评估" : "重新评估"}
          </button>
        </div>
      </div>

      <div className={`risk-summary-banner ${getRiskLevelClass(displayAssessment.overallLevel)}`}>
        <div className="risk-summary-left">
          <div className={`risk-level-display ${getRiskLevelBadgeClass(displayAssessment.overallLevel)}`}>
            {riskLevelLabels[displayAssessment.overallLevel]}
          </div>
          <div className="risk-summary-info">
            <div className="risk-score-row">
              <span className="risk-score-label">风险评分</span>
              <span className="risk-score-value">{displayAssessment.score}</span>
              <span className="risk-score-hint">分（满分参考30分）</span>
            </div>
            <div className="risk-assessment-time">
              {latestRiskAssessment
                ? `评估时间：${formatDateTime(latestRiskAssessment.calculatedAt)}`
                : `实时计算 · ${formatDateTime(displayAssessment.calculatedAt)}`
              }
              {!latestRiskAssessment && <span className="risk-unsaved-tag">（未保存）</span>}
            </div>
          </div>
        </div>
        <RiskMeter level={displayAssessment.overallLevel} score={displayAssessment.score} />
      </div>

      <div className="risk-stats-bar">
        {riskLevelOrder.slice().reverse().map((level) => (
          <div key={level} className={`risk-stat-item ${triggerStats[level] > 0 ? "has-value" : ""}`}>
            <span className={`risk-stat-badge ${getRiskLevelBadgeClass(level)}`}>
              {riskLevelLabels[level]}
            </span>
            <span className="risk-stat-count">{triggerStats[level] || 0}</span>
            <span className="risk-stat-label">项</span>
          </div>
        ))}
      </div>

      <div className="risk-section-header" onClick={() => setShowTriggers(!showTriggers)}>
        <h3>
          风险触发原因
          <span className="section-count">（{sortedTriggers.length}项）</span>
        </h3>
        <span className="expand-arrow">{showTriggers ? "▲" : "▼"}</span>
      </div>
      {showTriggers && (
        sortedTriggers.length === 0 ? (
          <div className="risk-no-triggers">
            <span className="risk-safe-icon">✓</span>
            <p>所有监测指标均在正常范围内，未触发任何风险项。</p>
          </div>
        ) : (
          <div className="risk-triggers-list">
            {sortedTriggers.map((trigger, idx) => (
              <TriggerCard key={idx} trigger={trigger} onLinkClick={handleLinkClick} />
            ))}
          </div>
        )
      )}

      <div className="risk-section-header" onClick={() => setShowTimeline(!showTimeline)}>
        <h3>
          异常时间线
          <span className="section-count">（{displayAssessment.timeline.length}条）</span>
        </h3>
        <span className="expand-arrow">{showTimeline ? "▲" : "▼"}</span>
      </div>
      {showTimeline && (
        displayAssessment.timeline.length === 0 ? (
          <div className="risk-no-triggers">
            <span className="risk-safe-icon">📋</span>
            <p>本班次暂无异常事件记录。</p>
          </div>
        ) : (
          <div className="risk-timeline-container">
            {displayAssessment.timeline.slice(0, 20).map((event) => (
              <TimelineEventItem
                key={event.id}
                event={event}
                onItemClick={handleTimelineItemClick}
              />
            ))}
            {displayAssessment.timeline.length > 20 && (
              <div className="risk-timeline-more">
                还有 {displayAssessment.timeline.length - 20} 条更早的记录…
              </div>
            )}
          </div>
        )
      )}

      <div className="risk-section-header" onClick={() => setShowRecommendation(!showRecommendation)}>
        <h3>
          交接班建议
          <span className="risk-linkage-tag">联动摘要</span>
        </h3>
        <span className="expand-arrow">{showRecommendation ? "▲" : "▼"}</span>
      </div>
      {showRecommendation && (
        <div className="risk-recommendation-box">
          <pre className="risk-recommendation-text">
            {displayAssessment.handoverRecommendation}
          </pre>
          <div className="risk-recommendation-footer">
            <span className="risk-schema-note">
              数据版本：{displayAssessment.schemaVersion}
              {displayAssessment.schemaVersion !== "2.1.0" && " · 已自动迁移兼容"}
            </span>
            <button
              className="secondary-btn"
              onClick={() => {
                navigator.clipboard?.writeText(displayAssessment.handoverRecommendation);
                setToastMessage("建议内容已复制");
                setTimeout(() => setToastMessage(null), 2000);
              }}
            >
              复制建议
            </button>
          </div>
        </div>
      )}

      <div className="risk-thresholds-info">
        <details>
          <summary>查看风险评估规则与阈值参考</summary>
          <div className="thresholds-grid">
            <div className="threshold-group">
              <h4>主机转速 (rpm)</h4>
              <p><span className="th-warn">预警</span>：{ENGINE_THRESHOLDS.speed.warning[0]}-{ENGINE_THRESHOLDS.speed.warning[1]}</p>
              <p><span className="th-danger">危险</span>：{ENGINE_THRESHOLDS.speed.danger[0]}-{ENGINE_THRESHOLDS.speed.danger[1]}</p>
            </div>
            <div className="threshold-group">
              <h4>滑油压力 (MPa)</h4>
              <p><span className="th-warn">预警</span>：{ENGINE_THRESHOLDS.oilPressure.warning[0]}-{ENGINE_THRESHOLDS.oilPressure.warning[1]}</p>
              <p><span className="th-danger">危险</span>：{ENGINE_THRESHOLDS.oilPressure.danger[0]}-{ENGINE_THRESHOLDS.oilPressure.danger[1]}</p>
            </div>
            <div className="threshold-group">
              <h4>冷却水温 (℃)</h4>
              <p><span className="th-warn">预警</span>：{ENGINE_THRESHOLDS.coolingTemp.warning[0]}-{ENGINE_THRESHOLDS.coolingTemp.warning[1]}</p>
              <p><span className="th-danger">危险</span>：{ENGINE_THRESHOLDS.coolingTemp.danger[0]}-{ENGINE_THRESHOLDS.coolingTemp.danger[1]}</p>
            </div>
            <div className="threshold-group">
              <h4>燃油消耗 (L/h)</h4>
              <p><span className="th-warn">预警</span>：{ENGINE_THRESHOLDS.fuelConsumption.warning[0]}-{ENGINE_THRESHOLDS.fuelConsumption.warning[1]}</p>
              <p><span className="th-danger">危险</span>：{ENGINE_THRESHOLDS.fuelConsumption.danger[0]}-{ENGINE_THRESHOLDS.fuelConsumption.danger[1]}</p>
            </div>
            <div className="threshold-group">
              <h4>舱底水液位 (%)</h4>
              <p><span className="th-warn">警戒</span>：≥ 80</p>
              <p><span className="th-danger">危险</span>：≥ 90</p>
            </div>
            <div className="threshold-group">
              <h4>未关闭异常数量</h4>
              <p><span className="th-warn">中风险</span>：≥ {ANOMALY_COUNT_THRESHOLDS.medium}</p>
              <p><span className="th-warn">高风险</span>：≥ {ANOMALY_COUNT_THRESHOLDS.high}</p>
              <p><span className="th-danger">严重</span>：≥ {ANOMALY_COUNT_THRESHOLDS.critical}</p>
            </div>
          </div>
        </details>
      </div>

      {highlightedIds && (
        <div className={`risk-highlight-toast ${highlightedIds.type}`}>
          {highlightedIds.type === "anomaly" ? "异常" : "记录"} {highlightedIds.ids.length > 1 ? `（${highlightedIds.ids.length}项）` : ""} 已定位
        </div>
      )}
    </section>
  );
}
