import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  type Shift,
  type WatchRecord,
  type EngineRoomRecord,
  type AnomalyRecord,
  type AnomalyStatus,
  type BilgeWaterRecord,
  type HandoverSummary,
  type ExportData,
  type ImportStrategy,
  type RiskAssessment,
  type RiskLevel,
  type Vessel,
  SHIFTS,
  getPreviousShiftId,
  generateIdempotencyKey,
  computeDataHash,
  downloadExportFile,
  RISK_LEVEL_LABELS,
  RISK_LEVEL_SCORES,
  RISK_LEVEL_ORDER,
  getAnomalyOriginShiftLabel,
  getAnomalyCurrentShiftLabel,
  getAnomalyCloseShiftLabel,
  getHandoverPathLabels,
  formatHandoverPath,
  getAnomalyLifecycleStatus,
} from "./domain";
import { getRepository } from "./repository";
import {
  selectVesselShiftMap,
  selectVesselShiftObject,
  selectActiveRecords,
  selectLatestRecord,
  selectLatestRiskAssessment,
  selectAllActiveRecords,
  selectCurrentShiftActiveRecords,
  selectHandoverSummary,
  selectCarriedOverAnomalies,
  type ShiftMap,
  type ShiftObject,
} from "./shiftSelectors";
import {
  generateAutoSummary,
  isDataDirty as isDataDirtyPure,
  computeRiskOnTheFly,
  type ShiftDataForSummary,
  type ShiftDataForDirtyCheck,
} from "./shiftDerived";

interface ShiftContextValue {
  vessels: Vessel[];
  currentVessel: Vessel | null;
  setCurrentVesselId: (id: string) => void;
  addVessel: (vessel: Omit<Vessel, "id" | "createdAt" | "updatedAt">) => Vessel;
  updateVessel: (id: string, patch: Partial<Vessel>) => Vessel | null;
  deleteVessel: (id: string) => boolean;
  shifts: Shift[];
  currentShift: Shift;
  setCurrentShiftId: (id: string) => void;
  records: Record<string, WatchRecord[]>;
  currentRecords: WatchRecord[];
  addRecord: (record: Omit<WatchRecord, "id" | "shiftId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "vesselId" | "fleetId" | "deletedAt" | "idempotencyKey" | "isEdited" | "editedAt" | "editedBy" | "editHistory"> & { idempotencyKey?: string }) => { record: WatchRecord; created: boolean };
  removeRecord: (id: string) => void;
  updateRecord: (id: string, patch: Partial<WatchRecord>) => WatchRecord | null;
  deleteRecord: (id: string) => void;
  engineRoomRecords: Record<string, EngineRoomRecord[]>;
  currentEngineRoomRecords: EngineRoomRecord[];
  latestEngineRoomRecord: EngineRoomRecord | null;
  addEngineRoomRecord: (record: Omit<EngineRoomRecord, "id" | "shiftId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "vesselId" | "fleetId" | "deletedAt" | "idempotencyKey" | "isEdited" | "editedAt" | "editedBy" | "editHistory"> & { idempotencyKey?: string }) => { record: EngineRoomRecord; created: boolean };
  updateEngineRoomRecord: (id: string, patch: Partial<EngineRoomRecord>) => EngineRoomRecord | null;
  deleteEngineRoomRecord: (id: string) => void;
  anomalyRecords: Record<string, AnomalyRecord[]>;
  allAnomalyRecords: AnomalyRecord[];
  addAnomalyRecord: (record: Omit<AnomalyRecord, "id" | "shiftId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "vesselId" | "fleetId" | "deletedAt" | "idempotencyKey" | "initialStatus" | "currentStatus" | "statusHistory" | "carryOverFromShiftId" | "isCarriedOver" | "originShiftId" | "handoverPath" | "closedAtShiftId" | "closedAt" | "closedBy"> & { status: AnomalyStatus; idempotencyKey?: string }) => { record: AnomalyRecord; created: boolean };
  updateAnomalyStatus: (recordId: string, newStatus: AnomalyStatus, note: string, operator: string) => void;
  updateAnomalyRecord: (id: string, patch: Partial<AnomalyRecord>) => AnomalyRecord | null;
  deleteAnomalyRecord: (id: string) => void;
  bilgeWaterRecords: Record<string, BilgeWaterRecord[]>;
  currentBilgeWaterRecords: BilgeWaterRecord[];
  latestBilgeWaterRecord: BilgeWaterRecord | null;
  allBilgeWaterRecords: BilgeWaterRecord[];
  addBilgeWaterRecord: (record: Omit<BilgeWaterRecord, "id" | "shiftId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "vesselId" | "fleetId" | "deletedAt" | "idempotencyKey" | "isEdited" | "editedAt" | "editedBy" | "editHistory"> & { idempotencyKey?: string }) => { record: BilgeWaterRecord; created: boolean };
  updateBilgeWaterRecord: (id: string, patch: Partial<BilgeWaterRecord>) => BilgeWaterRecord | null;
  deleteBilgeWaterRecord: (id: string) => void;
  handoverSummaries: Record<string, HandoverSummary>;
  currentHandoverSummary: HandoverSummary | null;
  previousShiftSummary: HandoverSummary | null;
  saveHandover: (manualNote: string, isDraft: boolean) => void;
  exportData: () => void;
  exportDataForVessel: (vesselId?: string) => void;
  exportAllData: () => void;
  importData: (data: ExportData, strategy: ImportStrategy) => void;
  getAllData: () => ExportData;
  carryOverAnomaliesToShift: (anomalyIds: string[], targetShiftId: string) => AnomalyRecord[];
  carriedOverAnomalies: AnomalyRecord[];
  generateAutoSummary: (shiftId?: string) => string;
  isDataDirty: (shiftId?: string) => boolean;
  lastSubmissionKey: string | null;
  riskAssessments: Record<string, RiskAssessment[]>;
  currentRiskAssessments: RiskAssessment[];
  latestRiskAssessment: RiskAssessment | null;
  allRiskAssessments: RiskAssessment[];
  calculateRisk: (shiftId?: string) => RiskAssessment;
  computeRiskOnTheFly: (shiftId?: string) => RiskAssessment | null;
  riskLevelLabels: Record<RiskLevel, string>;
  riskLevelScores: Record<RiskLevel, number>;
  riskLevelOrder: RiskLevel[];
  getAnomalyOriginShiftLabel: (record: AnomalyRecord) => string;
  getAnomalyCurrentShiftLabel: (record: AnomalyRecord) => string;
  getAnomalyCloseShiftLabel: (record: AnomalyRecord) => string | null;
  getHandoverPathLabels: (record: AnomalyRecord) => string[];
  formatHandoverPath: (record: AnomalyRecord) => string;
  getAnomalyLifecycleStatus: (record: AnomalyRecord) => "open" | "carried" | "closed" | "reopened";
}

const ShiftContext = createContext<ShiftContextValue | null>(null);

export function ShiftProvider({ children }: { children: ReactNode }) {
  const repository = useMemo(() => getRepository(), []);
  const initialState = useMemo(() => repository.getState(), [repository]);

  const [vessels, setVessels] = useState<Vessel[]>(initialState.vessels);
  const [currentVesselId, setCurrentVesselIdState] = useState<string>(initialState.currentVesselId);
  const [currentShiftId, setCurrentShiftIdState] = useState(initialState.currentShiftId);
  const [records, setRecords] = useState(initialState.records);
  const [engineRoomRecords, setEngineRoomRecords] = useState(initialState.engineRoomRecords);
  const [anomalyRecords, setAnomalyRecords] = useState(initialState.anomalyRecords);
  const [bilgeWaterRecords, setBilgeWaterRecords] = useState(initialState.bilgeWaterRecords);
  const [handoverSummaries, setHandoverSummaries] = useState(initialState.handoverSummaries);
  const [riskAssessments, setRiskAssessments] = useState(initialState.riskAssessments);
  const [lastSubmissionKey, setLastSubmissionKey] = useState<string | null>(null);

  const prevShiftIdRef = useRef(currentShiftId);

  const refreshState = useCallback(() => {
    const state = repository.getState();
    setVessels(state.vessels);
    setCurrentVesselIdState(state.currentVesselId);
    setCurrentShiftIdState(state.currentShiftId);
    setRecords(state.records);
    setEngineRoomRecords(state.engineRoomRecords);
    setAnomalyRecords(state.anomalyRecords);
    setBilgeWaterRecords(state.bilgeWaterRecords);
    setHandoverSummaries(state.handoverSummaries);
    setRiskAssessments(state.riskAssessments);
  }, [repository]);

  useEffect(() => {
    const handlers = [
      repository.on("records:changed", refreshState),
      repository.on("engineRoom:changed", refreshState),
      repository.on("anomalies:changed", refreshState),
      repository.on("bilge:changed", refreshState),
      repository.on("handover:changed", refreshState),
      repository.on("risk:changed", refreshState),
      repository.on("shift:changed", refreshState),
      repository.on("vessel:changed", refreshState),
      repository.on("vessels:changed", refreshState),
    ];
    return () => {
      handlers.forEach((off) => off());
    };
  }, [repository, refreshState]);

  const currentVessel = useMemo(
    () => vessels.find((v) => v.id === currentVesselId) ?? vessels[0] ?? null,
    [vessels, currentVesselId]
  );

  const flatRecords = useMemo(
    () => selectVesselShiftMap(records, currentVesselId),
    [records, currentVesselId]
  );
  const flatEngineRoomRecords = useMemo(
    () => selectVesselShiftMap(engineRoomRecords, currentVesselId),
    [engineRoomRecords, currentVesselId]
  );
  const flatAnomalyRecords = useMemo(
    () => selectVesselShiftMap(anomalyRecords, currentVesselId),
    [anomalyRecords, currentVesselId]
  );
  const flatBilgeWaterRecords = useMemo(
    () => selectVesselShiftMap(bilgeWaterRecords, currentVesselId),
    [bilgeWaterRecords, currentVesselId]
  );
  const flatHandoverSummaries = useMemo(
    () => selectVesselShiftObject(handoverSummaries, currentVesselId),
    [handoverSummaries, currentVesselId]
  );
  const flatRiskAssessments = useMemo(
    () => selectVesselShiftMap(riskAssessments, currentVesselId),
    [riskAssessments, currentVesselId]
  );

  const setCurrentVesselId = useCallback(
    (id: string) => {
      repository.setCurrentVesselId(id);
    },
    [repository]
  );

  const addVessel = useCallback(
    (vessel: Omit<Vessel, "id" | "createdAt" | "updatedAt">): Vessel => {
      return repository.addVessel(vessel);
    },
    [repository]
  );

  const updateVessel = useCallback(
    (id: string, patch: Partial<Vessel>): Vessel | null => {
      return repository.updateVessel(id, patch);
    },
    [repository]
  );

  const deleteVessel = useCallback(
    (id: string): boolean => {
      return repository.deleteVessel(id);
    },
    [repository]
  );

  const currentShift = useMemo(
    () => SHIFTS.find((s) => s.id === currentShiftId) ?? SHIFTS[0],
    [currentShiftId]
  );

  const setCurrentShiftId = useCallback(
    (id: string) => {
      repository.setCurrentShiftId(id);
    },
    [repository]
  );

  const currentRecords = useMemo(
    () => selectActiveRecords(selectVesselShiftMap(records, currentVesselId)[currentShiftId] ?? []),
    [records, currentVesselId, currentShiftId]
  );

  const currentEngineRoomRecords = useMemo(
    () => selectActiveRecords(selectVesselShiftMap(engineRoomRecords, currentVesselId)[currentShiftId] ?? []),
    [engineRoomRecords, currentVesselId, currentShiftId]
  );

  const currentBilgeWaterRecords = useMemo(
    () => selectActiveRecords(selectVesselShiftMap(bilgeWaterRecords, currentVesselId)[currentShiftId] ?? []),
    [bilgeWaterRecords, currentVesselId, currentShiftId]
  );

  const allEngineRoomRecords = useMemo(
    () => selectAllActiveRecords(flatEngineRoomRecords),
    [flatEngineRoomRecords]
  );

  const latestEngineRoomRecord = useMemo(
    () => selectLatestRecord(allEngineRoomRecords),
    [allEngineRoomRecords]
  );

  const allBilgeWaterRecords = useMemo(
    () => selectAllActiveRecords(flatBilgeWaterRecords),
    [flatBilgeWaterRecords]
  );

  const latestBilgeWaterRecord = useMemo(
    () => selectLatestRecord(allBilgeWaterRecords),
    [allBilgeWaterRecords]
  );

  const allAnomalyRecords = useMemo(
    () => selectAllActiveRecords(flatAnomalyRecords),
    [flatAnomalyRecords]
  );

  const currentHandoverSummary = useMemo(
    () => selectHandoverSummary(flatHandoverSummaries, currentShiftId),
    [flatHandoverSummaries, currentShiftId]
  );

  const previousShiftSummary = useMemo(() => {
    const prevId = getPreviousShiftId(currentShiftId);
    if (!prevId) return null;
    return selectHandoverSummary(flatHandoverSummaries, prevId);
  }, [flatHandoverSummaries, currentShiftId]);

  const carriedOverAnomalies = useMemo(() => {
    return repository.listCarriedOverAnomalies(currentShiftId);
  }, [repository, currentShiftId, anomalyRecords]);

  const addRecord = useCallback(
    (input: Omit<WatchRecord, "id" | "shiftId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "vesselId" | "fleetId" | "deletedAt" | "idempotencyKey" | "isEdited" | "editedAt" | "editedBy" | "editHistory"> & { idempotencyKey?: string }) => {
      const key = input.idempotencyKey ?? generateIdempotencyKey();
      setLastSubmissionKey(key);
      const result = repository.addRecord({ ...input, shiftId: currentShiftId, idempotencyKey: key });
      if (!result.created) {
        console.warn("重复提交检测：该记录已存在");
      }
      return result;
    },
    [repository, currentShiftId]
  );

  const removeRecord = useCallback(
    (id: string) => {
      repository.deleteRecord(id, currentShift.label);
    },
    [repository, currentShift.label]
  );

  const updateRecord = useCallback(
    (id: string, patch: Partial<WatchRecord>) => {
      return repository.updateRecord(id, patch, currentShift.label);
    },
    [repository, currentShift.label]
  );

  const deleteRecord = useCallback(
    (id: string) => {
      repository.deleteRecord(id, currentShift.label);
    },
    [repository, currentShift.label]
  );

  const addEngineRoomRecord = useCallback(
    (input: Omit<EngineRoomRecord, "id" | "shiftId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "vesselId" | "fleetId" | "deletedAt" | "idempotencyKey" | "isEdited" | "editedAt" | "editedBy" | "editHistory"> & { idempotencyKey?: string }) => {
      const key = input.idempotencyKey ?? generateIdempotencyKey();
      setLastSubmissionKey(key);
      const result = repository.addEngineRoomRecord({ ...input, shiftId: currentShiftId, idempotencyKey: key });
      if (!result.created) {
        console.warn("重复提交检测：该记录已存在");
      }
      return result;
    },
    [repository, currentShiftId]
  );

  const updateEngineRoomRecord = useCallback(
    (id: string, patch: Partial<EngineRoomRecord>) => {
      return repository.updateEngineRoomRecord(id, patch, currentShift.label);
    },
    [repository, currentShift.label]
  );

  const deleteEngineRoomRecord = useCallback(
    (id: string) => {
      repository.deleteEngineRoomRecord(id, currentShift.label);
    },
    [repository, currentShift.label]
  );

  const addBilgeWaterRecord = useCallback(
    (input: Omit<BilgeWaterRecord, "id" | "shiftId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "vesselId" | "fleetId" | "deletedAt" | "idempotencyKey" | "isEdited" | "editedAt" | "editedBy" | "editHistory"> & { idempotencyKey?: string }) => {
      const key = input.idempotencyKey ?? generateIdempotencyKey();
      setLastSubmissionKey(key);
      const result = repository.addBilgeWaterRecord({ ...input, shiftId: currentShiftId, idempotencyKey: key });
      if (!result.created) {
        console.warn("重复提交检测：该记录已存在");
      }
      return result;
    },
    [repository, currentShiftId]
  );

  const updateBilgeWaterRecord = useCallback(
    (id: string, patch: Partial<BilgeWaterRecord>) => {
      return repository.updateBilgeWaterRecord(id, patch, currentShift.label);
    },
    [repository, currentShift.label]
  );

  const deleteBilgeWaterRecord = useCallback(
    (id: string) => {
      repository.deleteBilgeWaterRecord(id, currentShift.label);
    },
    [repository, currentShift.label]
  );

  const addAnomalyRecord = useCallback(
    (input: Omit<AnomalyRecord, "id" | "shiftId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "vesselId" | "fleetId" | "deletedAt" | "idempotencyKey" | "initialStatus" | "currentStatus" | "statusHistory" | "carryOverFromShiftId" | "isCarriedOver" | "originShiftId" | "handoverPath" | "closedAtShiftId" | "closedAt" | "closedBy"> & { status: AnomalyStatus; idempotencyKey?: string }) => {
      const key = input.idempotencyKey ?? generateIdempotencyKey();
      setLastSubmissionKey(key);
      const result = repository.addAnomalyRecord({ ...input, shiftId: currentShiftId, idempotencyKey: key });
      if (!result.created) {
        console.warn("重复提交检测：该记录已存在");
      }
      return result;
    },
    [repository, currentShiftId]
  );

  const updateAnomalyStatus = useCallback(
    (recordId: string, newStatus: AnomalyStatus, note: string, operator: string) => {
      repository.updateAnomalyStatus(recordId, newStatus, note, operator);
    },
    [repository]
  );

  const updateAnomalyRecord = useCallback(
    (id: string, patch: Partial<AnomalyRecord>) => {
      return repository.updateAnomalyRecord(id, patch, currentShift.label);
    },
    [repository, currentShift.label]
  );

  const deleteAnomalyRecord = useCallback(
    (id: string) => {
      repository.deleteAnomalyRecord(id, currentShift.label);
    },
    [repository, currentShift.label]
  );

  const carryOverAnomaliesToShift = useCallback(
    (anomalyIds: string[], targetShiftId: string) => {
      return repository.carryOverAnomaliesToShift(anomalyIds, targetShiftId, currentShift.label);
    },
    [repository, currentShift.label]
  );

  const generateAutoSummaryCallback = useCallback(
    (shiftId?: string): string => {
      const targetShift = shiftId ?? currentShiftId;
      const data: ShiftDataForSummary = {
        engineRoomRecords: flatEngineRoomRecords,
        bilgeWaterRecords: flatBilgeWaterRecords,
        anomalyRecords: flatAnomalyRecords,
        records: flatRecords,
      };
      return generateAutoSummary(targetShift, data);
    },
    [currentShiftId, flatEngineRoomRecords, flatBilgeWaterRecords, flatAnomalyRecords, flatRecords]
  );

  const isDataDirtyCallback = useCallback(
    (shiftId?: string): boolean => {
      const targetShift = shiftId ?? currentShiftId;
      const summary = flatHandoverSummaries[targetShift];
      const shiftData: ShiftDataForDirtyCheck = {
        records: selectActiveRecords(flatRecords[targetShift] ?? []),
        engineRoomRecords: selectActiveRecords(flatEngineRoomRecords[targetShift] ?? []),
        anomalyRecords: selectActiveRecords(flatAnomalyRecords[targetShift] ?? []),
        bilgeWaterRecords: selectActiveRecords(flatBilgeWaterRecords[targetShift] ?? []),
      };
      return isDataDirtyPure(shiftData, summary && !summary.deletedAt ? summary : null);
    },
    [currentShiftId, flatHandoverSummaries, flatRecords, flatEngineRoomRecords, flatAnomalyRecords, flatBilgeWaterRecords]
  );

  const saveHandover = useCallback(
    (manualNote: string, isDraft: boolean) => {
      const targetShift = currentShiftId;
      const autoSummary = generateAutoSummaryCallback(targetShift);
      const shiftData = {
        records: selectActiveRecords(flatRecords[targetShift] ?? []),
        engineRoomRecords: selectActiveRecords(flatEngineRoomRecords[targetShift] ?? []),
        anomalyRecords: selectActiveRecords(flatAnomalyRecords[targetShift] ?? []),
        bilgeWaterRecords: selectActiveRecords(flatBilgeWaterRecords[targetShift] ?? []),
      };
      const dataHash = computeDataHash(shiftData);
      repository.saveHandoverSummary(
        targetShift,
        { autoSummary, manualNote, isDraft, dataHash },
        currentShift.label
      );
    },
    [repository, currentShiftId, currentShift.label, generateAutoSummaryCallback, flatRecords, flatEngineRoomRecords, flatAnomalyRecords, flatBilgeWaterRecords]
  );

  const getAllData = useCallback((): ExportData => {
    return repository.getExportData();
  }, [repository]);

  const exportAllData = useCallback(() => {
    const data = repository.getExportData();
    downloadExportFile(data);
  }, [repository]);

  const exportDataForVessel = useCallback(
    (vesselId?: string) => {
      const targetVesselId = vesselId ?? currentVesselId;
      const vessel = vessels.find((v) => v.id === targetVesselId);
      const data = repository.getExportDataForVessel(targetVesselId);
      downloadExportFile(data, vessel?.name);
    },
    [repository, currentVesselId, vessels]
  );

  const exportData = useCallback(() => {
    exportDataForVessel();
  }, [exportDataForVessel]);

  const importData = useCallback(
    (data: ExportData, strategy: ImportStrategy) => {
      repository.applyImport(data, strategy);
    },
    [repository]
  );

  useEffect(() => {
    const prevId = prevShiftIdRef.current;
    if (prevId !== currentShiftId) {
      const prevAnomalies = selectActiveRecords(flatAnomalyRecords[prevId] ?? []).filter(
        (r) => r.currentStatus !== "已关闭"
      );
      if (prevAnomalies.length > 0) {
        console.warn(`检测到上一班次(${prevId})有 ${prevAnomalies.length} 个未关闭异常，可调用 carryOverAnomaliesToShift 进行迁移`);
      }
      prevShiftIdRef.current = currentShiftId;
    }
  }, [currentShiftId, flatAnomalyRecords]);

  const currentRiskAssessments = useMemo(
    () => selectActiveRecords(flatRiskAssessments[currentShiftId] ?? []),
    [flatRiskAssessments, currentShiftId]
  );

  const allRiskAssessments = useMemo(
    () => selectAllActiveRecords(flatRiskAssessments),
    [flatRiskAssessments]
  );

  const latestRiskAssessment = useMemo(() => {
    return selectLatestRiskAssessment(currentRiskAssessments);
  }, [currentRiskAssessments]);

  const calculateRisk = useCallback(
    (shiftId?: string): RiskAssessment => {
      return repository.calculateAndSaveRiskAssessment(shiftId ?? currentShiftId);
    },
    [repository, currentShiftId]
  );

  const computeRiskOnTheFlyCallback = useCallback(
    (shiftId?: string): RiskAssessment | null => {
      const targetShift = shiftId ?? currentShiftId;
      return computeRiskOnTheFly(targetShift, {
        engineRoomRecords: selectActiveRecords(flatEngineRoomRecords[targetShift] ?? []),
        bilgeWaterRecords: selectActiveRecords(flatBilgeWaterRecords[targetShift] ?? []),
        anomalyRecords: selectActiveRecords(flatAnomalyRecords[targetShift] ?? []),
      });
    },
    [currentShiftId, flatEngineRoomRecords, flatBilgeWaterRecords, flatAnomalyRecords]
  );

  return (
    <ShiftContext.Provider
      value={{
        vessels,
        currentVessel,
        setCurrentVesselId,
        addVessel,
        updateVessel,
        deleteVessel,
        shifts: SHIFTS,
        currentShift,
        setCurrentShiftId,
        records: flatRecords,
        currentRecords,
        addRecord,
        removeRecord,
        updateRecord,
        deleteRecord,
        engineRoomRecords: flatEngineRoomRecords,
        currentEngineRoomRecords,
        latestEngineRoomRecord,
        addEngineRoomRecord,
        updateEngineRoomRecord,
        deleteEngineRoomRecord,
        anomalyRecords: flatAnomalyRecords,
        allAnomalyRecords,
        addAnomalyRecord,
        updateAnomalyStatus,
        updateAnomalyRecord,
        deleteAnomalyRecord,
        bilgeWaterRecords: flatBilgeWaterRecords,
        currentBilgeWaterRecords,
        latestBilgeWaterRecord,
        allBilgeWaterRecords,
        addBilgeWaterRecord,
        updateBilgeWaterRecord,
        deleteBilgeWaterRecord,
        handoverSummaries: flatHandoverSummaries,
        currentHandoverSummary,
        previousShiftSummary,
        saveHandover,
        exportData,
        exportDataForVessel,
        exportAllData,
        importData,
        getAllData,
        carryOverAnomaliesToShift,
        carriedOverAnomalies,
        generateAutoSummary: generateAutoSummaryCallback,
        isDataDirty: isDataDirtyCallback,
        lastSubmissionKey,
        riskAssessments: flatRiskAssessments,
        currentRiskAssessments,
        latestRiskAssessment,
        allRiskAssessments,
        calculateRisk,
        computeRiskOnTheFly: computeRiskOnTheFlyCallback,
        riskLevelLabels: RISK_LEVEL_LABELS,
        riskLevelScores: RISK_LEVEL_SCORES,
        riskLevelOrder: RISK_LEVEL_ORDER,
        getAnomalyOriginShiftLabel,
        getAnomalyCurrentShiftLabel,
        getAnomalyCloseShiftLabel,
        getHandoverPathLabels,
        formatHandoverPath,
        getAnomalyLifecycleStatus,
      }}
    >
      {children}
    </ShiftContext.Provider>
  );
}

export function useShift(): ShiftContextValue {
  const ctx = useContext(ShiftContext);
  if (!ctx) throw new Error("useShift must be used within ShiftProvider");
  return ctx;
}
