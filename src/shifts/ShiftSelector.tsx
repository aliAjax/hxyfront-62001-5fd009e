import { useShift } from "./ShiftContext";

export function ShiftSelector() {
  const { shifts, currentShift, setCurrentShiftId } = useShift();

  return (
    <div className="shift-selector">
      <span className="shift-label">值班班次</span>
      <div className="shift-tabs">
        {shifts.map((shift) => (
          <button
            key={shift.id}
            className={`shift-tab${shift.id === currentShift.id ? " active" : ""}`}
            onClick={() => setCurrentShiftId(shift.id)}
          >
            {shift.label}
          </button>
        ))}
      </div>
    </div>
  );
}
