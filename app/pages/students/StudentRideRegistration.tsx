"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../src/lib/supabase";
import { MinuteClockPicker } from "../common/MinuteClockPicker";
import type { ClassOption } from "../../types/class";
import type { VehicleOption } from "../../types/vehicle";
import type { VehicleRunOption } from "../../types/vehicleRun";
import type { StudentRideRegistration as RideRegistration } from "../../types/student";

type ManagerOption = { id: string; name: string; phone: string };
type Direction = "pickup" | "dropoff";
type RideDraft = Omit<RideRegistration, "day" | "direction" | "useType"> & {
  useType: "" | "vehicle" | "individual";
};

const DAY_NUMBERS: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
const emptyRide = (): RideDraft => ({ useType: "", time: "", place: "", runId: "", vehicleId: "", vehicleName: "", handoffGuardian: "", specialNote: "" });
const timeToMinutes = (time: string) => {
  const [hour, minute] = time.split(":").map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : -1;
};
const normalizeTime = (time: string) => time?.slice(0, 5) ?? "";
const minutesToTime = (minutes: number) => {
  const safeMinutes = Math.min(Math.max(minutes, 0), 1439);
  return `${String(Math.floor(safeMinutes / 60)).padStart(2, "0")}:${String(safeMinutes % 60).padStart(2, "0")}`;
};

export function StudentRideRegistration({
  centerId,
  days,
  selectedClasses,
  runs,
  vehicles,
  managers,
  onChange,
}: {
  centerId: string;
  days: string[];
  selectedClasses: ClassOption[];
  runs: VehicleRunOption[];
  vehicles: VehicleOption[];
  managers: ManagerOption[];
  onChange: (rides: RideRegistration[], complete: boolean) => void;
}) {
  const [activeDay, setActiveDay] = useState(days[0] ?? "");
  const [drafts, setDrafts] = useState<Record<string, Record<Direction, RideDraft>>>({});
  const [previewRows, setPreviewRows] = useState<Array<{ id: string; time: string; direction: Direction; name: string; place: string }>>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewRunId, setPreviewRunId] = useState("");
  const [previewDirection, setPreviewDirection] = useState<Direction | null>(null);

  const defaultTime = (day: string, direction: Direction) => {
    const lessons = selectedClasses
      .filter((item) => item.days.includes(day))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    const base = direction === "pickup"
      ? lessons[0]?.startTime
      : lessons.map((item) => item.endTime).sort().at(-1);
    if (!base) return "";
    const [hour, minute] = base.split(":").map(Number);
    return direction === "pickup"
      ? `${String((hour + 23) % 24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
      : `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  };
  const getRideWindow = (day: string, direction: Direction) => {
    const lessons = selectedClasses
      .filter((item) => item.days.includes(day))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (!lessons.length) return null;
    const firstStart = timeToMinutes(lessons[0].startTime);
    const lastEnd = Math.max(...lessons.map((item) => timeToMinutes(item.endTime)));
    return direction === "pickup"
      ? { start: Math.max(firstStart - 60, 0), end: firstStart }
      : { start: lastEnd, end: Math.min(lastEnd + 60, 1439) };
  };
  const isRunInRideWindow = (run: VehicleRunOption, day: string, direction: Direction) => {
    const window = getRideWindow(day, direction);
    if (!window || run.status !== "active" || !run.days.includes(DAY_NUMBERS[day])) return false;
    const runStart = timeToMinutes(run.startTime);
    const runEnd = timeToMinutes(run.endTime);
    // 경계 시각에 닿기만 하는 이전/다음 회차는 제외한다.
    // 예: 15:00 수업의 등원 창(14:00~15:00)에는 14:00~15:00 회차만,
    // 16:00 종료 수업의 하원 창(16:00~17:00)에는 16:00~17:00 회차만 표시한다.
    return runStart < window.end && runEnd > window.start;
  };
  const isRideTimeInRun = (run: VehicleRunOption, day: string, direction: Direction, rideTime: string) => {
    const window = getRideWindow(day, direction);
    const rideMinute = timeToMinutes(rideTime);
    return Boolean(window)
      && rideMinute >= window!.start
      && rideMinute <= window!.end
      && rideMinute >= timeToMinutes(run.startTime)
      && rideMinute <= timeToMinutes(run.endTime);
  };

  useEffect(() => {
    if (!days.includes(activeDay)) setActiveDay(days[0] ?? "");
    setDrafts((current) => {
      const next: Record<string, Record<Direction, RideDraft>> = {};
      days.forEach((day) => {
        next[day] = current[day] ?? {
          pickup: { ...emptyRide(), time: defaultTime(day, "pickup") },
          dropoff: { ...emptyRide(), time: defaultTime(day, "dropoff") },
        };
      });
      return next;
    });
  }, [days.join("|"), selectedClasses.map((item) => item.id).join("|")]);

  useEffect(() => {
    const rides = days.flatMap((day) => (["pickup", "dropoff"] as Direction[]).map((direction) => ({
      day,
      direction,
      ...(drafts[day]?.[direction] ?? emptyRide()),
    })));
    const complete = days.length > 0 && rides.length === days.length * 2 && rides.every((ride) =>
      ride.useType === "individual"
        ? true
        : ride.useType === "vehicle" && Boolean(
          ride.time && ride.place.trim() && ride.runId && ride.vehicleId
          && runs.some((run) => run.id === ride.runId
            && isRunInRideWindow(run, ride.day, ride.direction)
            && isRideTimeInRun(run, ride.day, ride.direction, ride.time)),
        ),
    );
    onChange(rides.filter((ride): ride is RideRegistration => Boolean(ride.useType)), complete);
  }, [days, drafts, onChange, runs.map((run) => `${run.id}:${run.startTime}:${run.endTime}:${run.status}`).join("|"), selectedClasses.map((item) => `${item.id}:${item.startTime}:${item.endTime}`).join("|")]);

  const current = drafts[activeDay];
  const updateRide = (direction: Direction, values: Partial<RideDraft>) => {
    setDrafts((items) => ({
      ...items,
      [activeDay]: {
        ...(items[activeDay] ?? { pickup: emptyRide(), dropoff: emptyRide() }),
        [direction]: { ...(items[activeDay]?.[direction] ?? emptyRide()), ...values },
      },
    }));
  };
  const moveDay = (amount: number) => {
    const index = Math.max(days.indexOf(activeDay), 0);
    setActiveDay(days[(index + amount + days.length) % days.length]);
  };
  const availableRuns = (direction: Direction) => {
    const ride = current?.[direction];
    const rideMinute = timeToMinutes(ride?.time ?? "");
    return runs
      .filter((run) => isRunInRideWindow(run, activeDay, direction))
      .map((run) => ({ ...run, recommended: rideMinute >= timeToMinutes(run.startTime) && rideMinute <= timeToMinutes(run.endTime) }))
      .sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.startTime.localeCompare(b.startTime));
  };
  const confirmRun = () => {
    if (!previewDirection) return;
    const run = runs.find((item) => item.id === previewRunId);
    if (!run) return;
    const vehicleName = vehicles.find((item) => item.id === run.vehicleId)?.name ?? "";
    const direction = previewDirection;
    const window = getRideWindow(activeDay, direction);
    const ride = current?.[direction];
    const runStart = timeToMinutes(run.startTime);
    const runEnd = timeToMinutes(run.endTime);
    const currentMinute = timeToMinutes(ride?.time ?? "");
    const allowedStart = Math.max(window?.start ?? runStart, runStart);
    const allowedEnd = Math.min(window?.end ?? runEnd, runEnd);
    const adjustedMinute = currentMinute >= allowedStart && currentMinute <= allowedEnd ? currentMinute : allowedStart;
    updateRide(direction, { runId: run.id, vehicleId: run.vehicleId, vehicleName, time: minutesToTime(adjustedMinute) });
    setPreviewRunId("");
    setPreviewDirection(null);
  };
  const openRunPreview = (direction: Direction, run: VehicleRunOption) => {
    setPreviewRows([]);
    setPreviewDirection(direction);
    setPreviewRunId(run.id);
  };
  const closeRunPreview = () => {
    setPreviewRunId("");
    setPreviewDirection(null);
  };
  const selectedPreviewRun = useMemo(() => runs.find((run) => run.id === previewRunId), [previewRunId, runs]);
  const previewVehicle = vehicles.find((vehicle) => vehicle.id === selectedPreviewRun?.vehicleId);
  const previewDriver = managers.find((manager) => manager.id === selectedPreviewRun?.driverMemberId);
  const previewCompanion = managers.find((manager) => manager.id === selectedPreviewRun?.companionMemberId);
  const pendingPreviewRide = previewDirection ? current?.[previewDirection] : null;
  const previewScheduleRows = useMemo(() => [
    ...previewRows.map((row) => ({ ...row, pending: false })),
    ...(previewDirection && pendingPreviewRide?.time ? [{
      id: "pending-student",
      time: pendingPreviewRide.time,
      direction: previewDirection,
      name: "신규 학생",
      place: pendingPreviewRide.place || "장소 입력 전",
      pending: true,
    }] : []),
  ].sort((a, b) => a.time.localeCompare(b.time)), [pendingPreviewRide?.place, pendingPreviewRide?.time, previewDirection, previewRows]);

  useEffect(() => { closeRunPreview(); }, [activeDay]);

  useEffect(() => {
    if (!selectedPreviewRun) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeRunPreview(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedPreviewRun]);

  useEffect(() => {
    if (!centerId || !selectedPreviewRun?.id || !activeDay) { setPreviewRows([]); return; }
    let active = true;
    setPreviewLoading(true);
    void supabase.from("ride_schedules")
      .select("id,ride_time,direction,place,students(name)")
      .eq("center_id", centerId)
      .eq("run_id", selectedPreviewRun.id)
      .eq("weekday", DAY_NUMBERS[activeDay])
      .eq("is_active", true)
      .order("ride_time")
      .then(({ data }) => {
        if (!active) return;
        setPreviewRows((data ?? []).map((row) => {
          const student = Array.isArray(row.students) ? row.students[0] : row.students;
          return { id: row.id, time: normalizeTime(row.ride_time), direction: row.direction as Direction, name: student?.name ?? "학생", place: row.place ?? "장소 미등록" };
        }));
        setPreviewLoading(false);
      });
    return () => { active = false; };
  }, [activeDay, centerId, selectedPreviewRun?.id]);

  if (!days.length || !current) return <p className="ride-registration-guide">수업 요일과 클래스를 먼저 선택해주세요.</p>;

  return (
    <div className="ride-registration-flow">
      <header className="ride-day-navigator">
        <button type="button" onClick={() => moveDay(-1)} aria-label="이전 요일">‹</button>
        <div><strong>{activeDay}요일 승·하원</strong><span>{days.indexOf(activeDay) + 1} / {days.length}</span></div>
        <button type="button" onClick={() => moveDay(1)} aria-label="다음 요일">›</button>
      </header>
      <div className="ride-direction-grid">
        {(["pickup", "dropoff"] as Direction[]).map((direction) => {
          const ride = current[direction];
          const label = direction === "pickup" ? "등원" : "하원";
          const matchingRuns = availableRuns(direction);
          const rideWindow = getRideWindow(activeDay, direction);
          const selectedRun = runs.find((run) => run.id === ride.runId);
          const selectedVehicle = vehicles.find((vehicle) => vehicle.id === selectedRun?.vehicleId);
          return (
            <article className="ride-registration-card" key={direction}>
              <header><span>{direction === "pickup" ? "1" : "2"}</span><div><strong>{label} 정보</strong><small>필수 입력</small></div></header>
              <fieldset className="ride-method-choice">
                <legend>{label} 방법</legend>
                <button type="button" className={ride.useType === "individual" ? "active" : ""} onClick={() => updateRide(direction, { useType: "individual", runId: "", vehicleId: "", vehicleName: "", place: "" })}>개별 {label}</button>
                <button type="button" className={ride.useType === "vehicle" ? "active" : ""} onClick={() => updateRide(direction, { useType: "vehicle", handoffGuardian: "" })}>차량 이용</button>
              </fieldset>
              {!ride.useType ? (
                <p className="ride-method-required">개별 {label} 또는 차량 이용을 선택해주세요.</p>
              ) : ride.useType === "individual" ? (
                <div className="ride-input-grid">
                  <label><span>인계 보호자 <small>선택</small></span><input value={ride.handoffGuardian ?? ""} onChange={(event) => updateRide(direction, { handoffGuardian: event.target.value })} placeholder="선택 입력 · 예: 어머니, 아버지" /></label>
                  <label><span>특이사항 <small>선택</small></span><textarea value={ride.specialNote ?? ""} onChange={(event) => updateRide(direction, { specialNote: event.target.value })} rows={3} placeholder="인계 시 참고할 내용을 입력해주세요" /></label>
                </div>
              ) : (
                <div className="ride-input-grid">
                  <div className="ride-time-field"><span>{label} 시간</span><MinuteClockPicker hour={ride.time ? Number(ride.time.split(":")[0]) : null} minute={ride.time?.split(":")[1] ?? "00"} label={label} onChange={(minute) => updateRide(direction, { time: `${ride.time?.split(":")[0] ?? "00"}:${minute}` })} /></div>
                  <label><span>{label} 장소</span><input value={ride.place} onChange={(event) => updateRide(direction, { place: event.target.value })} placeholder={`${label} 장소를 입력해주세요`} required /></label>
                  <div className="run-recommendations">
                    <strong>운행 회차 선택 {rideWindow && <small>({minutesToTime(rideWindow.start)}~{minutesToTime(rideWindow.end)})</small>}</strong>
                    {!matchingRuns.length && <p>수업 시간과 맞는 운행 회차가 없습니다. 센터 관리에서 회차를 추가하거나 승하원 방법을 확인해주세요.</p>}
                    {matchingRuns.map((run) => {
                      const vehicle = vehicles.find((item) => item.id === run.vehicleId);
                      const driver = managers.find((item) => item.id === run.driverMemberId);
                      const companion = managers.find((item) => item.id === run.companionMemberId);
                      return <button type="button" key={run.id} className={ride.runId === run.id ? "active" : ""} onClick={() => openRunPreview(direction, run)}><span>{run.recommended && <b>추천</b>}{run.name}</span><strong>{run.startTime}~{run.endTime}</strong><small>{vehicle?.name ?? "차량 미등록"} · 기사 {driver?.name ?? "미배정"} · 동승자 {companion?.name ?? "없음"}</small></button>;
                    })}
                  </div>
                  {selectedRun && <p className="selected-run-note">선택: {selectedRun.name} · {selectedVehicle?.name ?? "차량 미등록"}</p>}
                  {selectedRun && !isRideTimeInRun(selectedRun, activeDay, direction, ride.time) && <p className="run-time-warning">선택한 시간이 회차 운행 범위를 벗어났습니다. 시간을 다시 선택해주세요.</p>}
                  <label><span>특이사항</span><textarea value={ride.specialNote ?? ""} onChange={(event) => updateRide(direction, { specialNote: event.target.value })} rows={2} placeholder="기사·동승자가 확인할 내용을 입력해주세요" /></label>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {selectedPreviewRun && previewDirection && (
        <div className="run-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeRunPreview(); }}>
          <section className="run-preview-modal" role="dialog" aria-modal="true" aria-labelledby="run-preview-title">
            <header className="run-preview-heading">
              <div><small>{activeDay}요일 · {previewDirection === "pickup" ? "등원" : "하원"} 회차</small><h2 id="run-preview-title">{selectedPreviewRun.name}</h2></div>
              <button type="button" onClick={closeRunPreview} aria-label="회차 스케줄 닫기">×</button>
            </header>
            <div className="run-preview-summary">
              <div><span>운행 시간</span><strong>{selectedPreviewRun.startTime}~{selectedPreviewRun.endTime}</strong></div>
              <div><span>차량</span><strong>{previewVehicle?.name ?? "미등록"}{previewVehicle?.number ? ` · ${previewVehicle.number}` : ""}</strong></div>
              <div><span>기사</span><strong>{previewDriver ? `${previewDriver.name} · ${previewDriver.phone || "연락처 없음"}` : "미배정"}</strong></div>
              <div><span>동승자</span><strong>{previewCompanion ? `${previewCompanion.name} · ${previewCompanion.phone || "연락처 없음"}` : "없음"}</strong></div>
            </div>
            <div className="run-preview-list">
              <header><strong>현재 차량 스케줄</strong><span>기존 {previewRows.length}건{previewVehicle?.capacity ? ` · 정원 ${previewVehicle.capacity}명` : ""}</span></header>
              {previewLoading ? <p>스케줄을 불러오는 중입니다.</p> : previewScheduleRows.map((row) => <article key={row.id} className={row.pending ? "pending" : ""}><time>{row.time}</time><b className={row.direction}>{row.direction === "pickup" ? "등원" : "하원"}</b><strong>{row.name}{row.pending && <em>등록 예정</em>}</strong><span>{row.place}</span></article>)}
            </div>
            <footer className="run-preview-actions">
              <button type="button" onClick={closeRunPreview}>취소</button>
              <button type="button" className="primary" onClick={confirmRun}>이 회차 선택</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
