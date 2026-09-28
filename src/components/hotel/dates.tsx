import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthGrid, shiftMonth, showDate, tehranTodayIso } from "@/lib/hotel/format";
import { useI18n } from "@/lib/i18n";

export function DateField({
  label,
  value,
  onChange,
  min,
  required,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  required?: boolean;
}) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(value || min || "2026-09-28");
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const grid = monthGrid(locale, cursor);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openCalendar() {
    setCursor(value || min || tehranTodayIso());
    setOpen(true);
  }

  return (
    <div className="date-field" ref={rootRef}>
      <span className="field-label" id={`${panelId}-label`}>
        {label}
      </span>
      <button
        type="button"
        className="date-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        aria-labelledby={`${panelId}-label`}
        aria-required={required || undefined}
        onClick={() => (open ? setOpen(false) : openCalendar())}
      >
        {value ? showDate(value, locale) : t.chooseDate}
      </button>
      {open ? (
        <div className="date-pop" id={panelId} role="dialog" aria-label={label}>
          <div className="date-nav">
            <button type="button" className="icon-btn" aria-label={t.prevMonth} onClick={() => setCursor(shiftMonth(cursor, -1, locale))}>
              <ChevronLeft className="rtl-flip" size={18} aria-hidden="true" />
            </button>
            <p>{grid.title}</p>
            <button type="button" className="icon-btn" aria-label={t.nextMonth} onClick={() => setCursor(shiftMonth(cursor, 1, locale))}>
              <ChevronRight className="rtl-flip" size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="date-week" aria-hidden="true">
            {grid.weekdays.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="date-grid">
            {grid.cells.map((cell) => {
              const disabled = Boolean(min && cell.iso < min);
              return (
                <button
                  key={`${cell.iso}-${cell.outside}`}
                  type="button"
                  className="date-day"
                  data-outside={cell.outside ? "true" : "false"}
                  aria-pressed={cell.iso === value}
                  disabled={disabled}
                  onClick={() => {
                    onChange(cell.iso);
                    setOpen(false);
                  }}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
