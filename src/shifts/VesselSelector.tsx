import { useState, useCallback } from "react";
import { useShift } from "./ShiftContext";
import type { Vessel } from "./domain";

interface VesselFormData {
  name: string;
  imoNumber: string;
  mmsi: string;
  fleetId: string;
}

const emptyForm: VesselFormData = {
  name: "",
  imoNumber: "",
  mmsi: "",
  fleetId: "",
};

export function VesselSelector() {
  const {
    vessels,
    currentVessel,
    setCurrentVesselId,
    addVessel,
    updateVessel,
    deleteVessel,
  } = useShift();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingVessel, setEditingVessel] = useState<Vessel | null>(null);
  const [deletingVessel, setDeletingVessel] = useState<Vessel | null>(null);
  const [formData, setFormData] = useState<VesselFormData>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSelectVessel = useCallback(
    (vesselId: string) => {
      if (vesselId !== currentVessel?.id) {
        setCurrentVesselId(vesselId);
      }
      setDropdownOpen(false);
    },
    [currentVessel?.id, setCurrentVesselId]
  );

  const openAddDialog = useCallback(() => {
    setFormData(emptyForm);
    setFormError(null);
    setShowAddDialog(true);
    setDropdownOpen(false);
  }, []);

  const openEditDialog = useCallback(
    (vessel: Vessel) => {
      setEditingVessel(vessel);
      setFormData({
        name: vessel.name,
        imoNumber: vessel.imoNumber ?? "",
        mmsi: vessel.mmsi ?? "",
        fleetId: vessel.fleetId ?? "",
      });
      setFormError(null);
      setShowEditDialog(true);
      setDropdownOpen(false);
    },
    []
  );

  const openDeleteDialog = useCallback(
    (vessel: Vessel) => {
      setDeletingVessel(vessel);
      setShowDeleteDialog(true);
      setDropdownOpen(false);
    },
    []
  );

  const closeAllDialogs = useCallback(() => {
    setShowAddDialog(false);
    setShowEditDialog(false);
    setShowDeleteDialog(false);
    setEditingVessel(null);
    setDeletingVessel(null);
    setFormData(emptyForm);
    setFormError(null);
  }, []);

  const validateForm = useCallback((): boolean => {
    if (!formData.name.trim()) {
      setFormError("船舶名称不能为空");
      return false;
    }
    const duplicateName = vessels.some(
      (v) =>
        v.name.trim() === formData.name.trim() &&
        v.id !== editingVessel?.id
    );
    if (duplicateName) {
      setFormError("已存在相同名称的船舶");
      return false;
    }
    return true;
  }, [formData.name, vessels, editingVessel?.id]);

  const handleAddSubmit = useCallback(() => {
    if (!validateForm()) return;
    addVessel({
      name: formData.name.trim(),
      imoNumber: formData.imoNumber.trim() || undefined,
      mmsi: formData.mmsi.trim() || undefined,
      fleetId: formData.fleetId.trim() || null,
    });
    closeAllDialogs();
  }, [addVessel, formData, validateForm, closeAllDialogs]);

  const handleEditSubmit = useCallback(() => {
    if (!editingVessel || !validateForm()) return;
    updateVessel(editingVessel.id, {
      name: formData.name.trim(),
      imoNumber: formData.imoNumber.trim() || undefined,
      mmsi: formData.mmsi.trim() || undefined,
      fleetId: formData.fleetId.trim() || null,
    });
    closeAllDialogs();
  }, [editingVessel, updateVessel, formData, validateForm, closeAllDialogs]);

  const handleDeleteConfirm = useCallback(() => {
    if (!deletingVessel) return;
    deleteVessel(deletingVessel.id);
    closeAllDialogs();
  }, [deletingVessel, deleteVessel, closeAllDialogs]);

  const renderForm = () => (
    <>
      <div className="form-row">
        <label>
          船舶名称 <span className="required">*</span>
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => {
            setFormData({ ...formData, name: e.target.value });
            setFormError(null);
          }}
          placeholder="例如：远洋一号"
          autoFocus
        />
      </div>
      <div className="form-row">
        <label>IMO 编号</label>
        <input
          type="text"
          value={formData.imoNumber}
          onChange={(e) => setFormData({ ...formData, imoNumber: e.target.value })}
          placeholder="可选，7位数字"
        />
      </div>
      <div className="form-row">
        <label>MMSI</label>
        <input
          type="text"
          value={formData.mmsi}
          onChange={(e) => setFormData({ ...formData, mmsi: e.target.value })}
          placeholder="可选，9位数字"
        />
      </div>
      <div className="form-row">
        <label>船队编号</label>
        <input
          type="text"
          value={formData.fleetId}
          onChange={(e) => setFormData({ ...formData, fleetId: e.target.value })}
          placeholder="可选，船队标识"
        />
      </div>
      {formError && <div className="form-error">{formError}</div>}
    </>
  );

  return (
    <>
      <div className="vessel-selector">
        <span className="vessel-label">当前船舶</span>
        <div className="vessel-dropdown">
          <button
            className="vessel-dropdown-btn"
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <span className="vessel-name">
              {currentVessel?.name ?? "加载中..."}
              {currentVessel?.isDefault && (
                <span className="vessel-default-tag">默认</span>
              )}
            </span>
            {currentVessel?.imoNumber && (
              <span className="vessel-sub">IMO: {currentVessel.imoNumber}</span>
            )}
            <span className={`dropdown-arrow${dropdownOpen ? " open" : ""}`}>▼</span>
          </button>

          {dropdownOpen && (
            <div className="vessel-dropdown-menu">
              <div className="vessel-list">
                {vessels.map((vessel) => (
                  <div
                    key={vessel.id}
                    className={`vessel-item${
                      vessel.id === currentVessel?.id ? " active" : ""
                    }`}
                  >
                    <div
                      className="vessel-item-main"
                      onClick={() => handleSelectVessel(vessel.id)}
                    >
                      <span className="vessel-item-name">
                        {vessel.name}
                        {vessel.isDefault && (
                          <span className="vessel-default-tag">默认</span>
                        )}
                      </span>
                      {vessel.imoNumber && (
                        <span className="vessel-item-sub">IMO: {vessel.imoNumber}</span>
                      )}
                    </div>
                    <div className="vessel-item-actions">
                      <button
                        className="vessel-action-btn edit"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditDialog(vessel);
                        }}
                        title="编辑"
                      >
                        ✎
                      </button>
                      {!vessel.isDefault && (
                        <button
                          className="vessel-action-btn delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteDialog(vessel);
                          }}
                          title="删除"
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="vessel-dropdown-divider" />
              <button className="vessel-add-btn" onClick={openAddDialog}>
                + 添加新船舶
              </button>
            </div>
          )}
        </div>
      </div>

      {showAddDialog && (
        <div className="modal-overlay" onClick={closeAllDialogs}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>添加新船舶</h3>
              <button className="modal-close" onClick={closeAllDialogs}>
                ×
              </button>
            </div>
            <div className="modal-body">{renderForm()}</div>
            <div className="modal-footer">
              <button onClick={closeAllDialogs}>取消</button>
              <button className="primary" onClick={handleAddSubmit}>
                添加
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditDialog && (
        <div className="modal-overlay" onClick={closeAllDialogs}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>编辑船舶信息</h3>
              <button className="modal-close" onClick={closeAllDialogs}>
                ×
              </button>
            </div>
            <div className="modal-body">{renderForm()}</div>
            <div className="modal-footer">
              <button onClick={closeAllDialogs}>取消</button>
              <button className="primary" onClick={handleEditSubmit}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteDialog && deletingVessel && (
        <div className="modal-overlay" onClick={closeAllDialogs}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>删除船舶</h3>
              <button className="modal-close" onClick={closeAllDialogs}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="delete-warning">
                <p>
                  确定要删除船舶 <strong>「{deletingVessel.name}」</strong> 吗？
                </p>
                <p className="danger-text">
                  ⚠ 该操作将永久删除该船舶下的所有班次、记录、异常、交接摘要和风险评估数据，且不可恢复！
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={closeAllDialogs}>取消</button>
              <button className="danger-btn" onClick={handleDeleteConfirm}>
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
