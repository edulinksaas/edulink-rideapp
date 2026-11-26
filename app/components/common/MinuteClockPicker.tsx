"use client";

import { useEffect, useRef, useState } from "react";

const minuteLabels = Array.from({ length: 12 }, (_, index) => index * 5);
const minuteTicks = Array.from({ length: 60 }, (_, index) => index);

const padMinute = (minute: number) => String(minute).padStart(2, "0");

const formatHour = (hour: number | null) => {
  if (hour === null) return "시간 미설정";
  const period = hour < 12 ? "오전" : "오후";
  return `${period} ${hour % 12 || 12}시`;
};

export function MinuteClockPicker({
  hour,
  minute,
  label,
  disabled = false,
  onChange,
}: {
  hour: number | null;
  minute: string;
  label: string;
  disabled?: boolean;
  onChange: (minute: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftMinute, setDraftMinute] = useState(Number(minute) || 0);
  const dialRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraftMinute(Number(minute) || 0);
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [minute, open]);

  const selectMinuteAtPointer = (clientX: number, clientY: number) => {
    const bounds = dialRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const x = clientX - (bounds.left + bounds.width / 2);
    const y = clientY - (bounds.top + bounds.height / 2);
    const angle = (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360;
    setDraftMinute(Math.round(angle / 6) % 60);
  };

  const moveMinute = (amount: number) => {
    setDraftMinute((current) => (current + amount + 60) % 60);
  };

  return (
    <>
      <button
        className="minute-picker-trigger"
        type="button"
        disabled={disabled || hour === null}
        onClick={() => setOpen(true)}
        aria-label={`${label} 분 설정`}
      >
        <span>{formatHour(hour)}</span>
        <strong>{padMinute(Number(minute) || 0)}분</strong>
      </button>

      {open && (
        <div
          className="minute-clock-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section className="minute-clock-dialog" role="dialog" aria-modal="true" aria-label={`${label} 분 선택`}>
            <header>
              <div>
                <small>{label} 시간</small>
                <strong>{formatHour(hour)} {padMinute(draftMinute)}분</strong>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="닫기">×</button>
            </header>

            <div
              ref={dialRef}
              className="minute-clock-dial"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                selectMinuteAtPointer(event.clientX, event.clientY);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  selectMinuteAtPointer(event.clientX, event.clientY);
                }
              }}
            >
              <svg viewBox="0 0 280 280" aria-hidden="true">
                <circle className="minute-clock-face" cx="140" cy="140" r="126" />
                {minuteTicks.map((tick) => {
                  const angle = tick * 6 * Math.PI / 180;
                  const outer = 122;
                  const inner = tick % 5 === 0 ? 110 : 116;
                  return (
                    <line
                      key={tick}
                      className={tick % 5 === 0 ? "minute-clock-tick major" : "minute-clock-tick"}
                      x1={140 + Math.sin(angle) * inner}
                      y1={140 - Math.cos(angle) * inner}
                      x2={140 + Math.sin(angle) * outer}
                      y2={140 - Math.cos(angle) * outer}
                    />
                  );
                })}
                {minuteLabels.map((value) => {
                  const angle = value * 6 * Math.PI / 180;
                  return (
                    <text
                      key={value}
                      className="minute-clock-number"
                      x={140 + Math.sin(angle) * 91}
                      y={144 - Math.cos(angle) * 91}
                      textAnchor="middle"
                    >
                      {padMinute(value)}
                    </text>
                  );
                })}
                <line
                  className="minute-clock-hand"
                  x1="140"
                  y1="140"
                  x2={140 + Math.sin(draftMinute * 6 * Math.PI / 180) * 76}
                  y2={140 - Math.cos(draftMinute * 6 * Math.PI / 180) * 76}
                />
                <circle className="minute-clock-center" cx="140" cy="140" r="7" />
                <circle
                  className="minute-clock-handle"
                  cx={140 + Math.sin(draftMinute * 6 * Math.PI / 180) * 76}
                  cy={140 - Math.cos(draftMinute * 6 * Math.PI / 180) * 76}
                  r="10"
                />
              </svg>
            </div>

            <div className="minute-clock-stepper">
              <button type="button" onClick={() => moveMinute(-1)}>−1분</button>
              <strong>{padMinute(draftMinute)}분</strong>
              <button type="button" onClick={() => moveMinute(1)}>+1분</button>
            </div>
            <footer>
              <button type="button" onClick={() => setOpen(false)}>취소</button>
              <button
                className="confirm"
                type="button"
                onClick={() => {
                  onChange(padMinute(draftMinute));
                  setOpen(false);
                }}
              >
                적용
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
