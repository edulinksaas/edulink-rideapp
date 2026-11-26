"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../src/lib/supabase";
import { Icon } from "../../components/common/Icon";
import type { View } from "../../types/navigation";
import type { ClassOption } from "../../types/class";
import type { VehicleOption } from "../../types/vehicle";
import type { ClassroomOption } from "../../types/classroom";
import type { VehicleRun } from "../../types/vehicleRun";

export function CenterManagementPage({
  navigate,
}: {
  navigate: (view: View) => void;
}) {
  const managementItems = [
    { icon: "센", title: "센터 기본 정보", description: "센터 이름, 주소와 강의실을 관리합니다.", view: "center-settings" as View },
    { icon: "반", title: "클래스 관리", description: "클래스의 요일, 시간, 강의실과 사용 상태를 관리합니다.", view: "class-management" as View },
    { icon: "차", title: "차량 관리", description: "운행 차량과 차량 기본 정보를 등록합니다.", view: "vehicle-register" as View },
    { icon: "회", title: "운행 회차 관리", description: "차량의 실제 운행 단위와 기사·동승자를 관리합니다.", view: "vehicle-run-management" as View },
    { icon: "배", title: "기존 일정 회차 재배정", description: "회차가 없는 기존 승하원 일정을 확인하고 일괄 배정합니다.", view: "vehicle-run-reassignment" as View },
    { icon: "권", title: "회원 및 권한 관리", description: "담당자를 초대하고 운영 권한을 설정합니다.", view: "manager-register" as View },
  ];
  return <main className="settings-page">
    <section className="settings-head"><span>센터 운영</span><h1>센터 관리</h1><p>센터에서 함께 사용하는 클래스·강의실·차량·회원 정보를 관리합니다.</p></section>
    <section className="settings-card-grid" aria-label="센터 관리 메뉴">{managementItems.map((item) => <button key={item.title} type="button" onClick={() => navigate(item.view)}><span className="settings-card-icon" aria-hidden="true">{item.icon}</span><span className="settings-card-copy"><strong>{item.title}</strong><small>{item.description}</small></span><b aria-hidden="true">›</b></button>)}</section>
  </main>;
}

const RUN_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const RUN_OPERATING_DAY_KEYS: OperatingDayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function VehicleRunManagementPage({ centerId, vehicles, managers, operatingHours, back }: {
  centerId: string;
  vehicles: VehicleOption[];
  managers: RegisteredManager[];
  operatingHours: OperatingHours;
  back: () => void;
}) {
  const emptyDraft = (): Omit<VehicleRun, "id" | "centerId"> => ({
    name: "", days: [], vehicleId: "", startTime: "", endTime: "",
    driverMemberId: "", companionMemberId: "", status: "active",
  });
  const [runs, setRuns] = useState<VehicleRun[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [conflictAcknowledged, setConflictAcknowledged] = useState(false);
  const [runViewMode, setRunViewMode] = useState<"timetable" | "list">("timetable");
  const [selectedRunDay, setSelectedRunDay] = useState(1);
  const drivers = managers.filter((item) => item.status === "사용 중" && item.roles.includes("차량 기사"));
  const companions = managers.filter((item) => item.status === "사용 중" && item.roles.includes("동승자"));
  const loadRuns = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("vehicle_runs")
      .select("id,center_id,name,days,vehicle_id,scheduled_start,scheduled_end,driver_member_id,companion_member_id,status")
      .eq("center_id", centerId).order("scheduled_start");
    if (error) setMessage(`회차 조회 실패: ${error.message}`);
    else setRuns((data ?? []).map((row) => ({
      id: row.id, centerId: row.center_id, name: row.name, days: row.days ?? [], vehicleId: row.vehicle_id,
      startTime: row.scheduled_start?.slice(0, 5) ?? "", endTime: row.scheduled_end?.slice(0, 5) ?? "",
      driverMemberId: row.driver_member_id ?? "", companionMemberId: row.companion_member_id ?? "",
      status: row.status === "inactive" ? "inactive" : "active",
    })));
    setLoading(false);
  };
  useEffect(() => { if (centerId) void loadRuns(); }, [centerId]);
  const conflictingRuns = runs.filter((run) => run.id !== editingId && run.status === "active" && draft.status === "active"
    && run.days.some((day) => draft.days.includes(day))
    && draft.startTime < run.endTime && draft.endTime > run.startTime
    && (run.vehicleId === draft.vehicleId
      || (!!draft.driverMemberId && run.driverMemberId === draft.driverMemberId)
      || (!!draft.companionMemberId && run.companionMemberId === draft.companionMemberId)));
  const getConflictReasons = (run: VehicleRun) => [
    run.vehicleId === draft.vehicleId ? "차량" : "",
    draft.driverMemberId && run.driverMemberId === draft.driverMemberId ? "기사" : "",
    draft.companionMemberId && run.companionMemberId === draft.companionMemberId ? "동승자" : "",
  ].filter(Boolean).join("·");
  const updateDraft = (next: Omit<VehicleRun, "id" | "centerId">) => {
    setDraft(next);
    setConflictAcknowledged(false);
  };
  const saveRun = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setMessage("");
    if (!draft.days.length) { setMessage("운행 요일을 1개 이상 선택해주세요."); return; }
    if (draft.endTime <= draft.startTime) { setMessage("종료 시간은 시작 시간보다 늦어야 합니다."); return; }
    if (conflictingRuns.length && !conflictAcknowledged) {
      setConflictAcknowledged(true);
      setMessage("중복 경고를 확인했습니다. 그대로 저장하려면 저장 버튼을 한 번 더 눌러주세요.");
      return;
    }
    const values = { center_id: centerId, name: draft.name.trim(), days: draft.days, vehicle_id: draft.vehicleId,
      scheduled_start: draft.startTime, scheduled_end: draft.endTime, driver_member_id: draft.driverMemberId || null,
      companion_member_id: draft.companionMemberId || null, status: draft.status, updated_at: new Date().toISOString() };
    const { error } = editingId
      ? await supabase.from("vehicle_runs").update(values).eq("id", editingId).eq("center_id", centerId)
      : await supabase.from("vehicle_runs").insert(values);
    if (error) { setMessage(error.message); return; }
    setDraft(emptyDraft()); setEditingId(""); setConflictAcknowledged(false); setMessage("운행 회차를 저장했습니다."); await loadRuns();
  };
  const edit = (run: VehicleRun) => { setEditingId(run.id); setConflictAcknowledged(false); setDraft({ name: run.name, days: run.days, vehicleId: run.vehicleId, startTime: run.startTime, endTime: run.endTime, driverMemberId: run.driverMemberId ?? "", companionMemberId: run.companionMemberId ?? "", status: run.status }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const selectedDayRuns = runs.filter((run) => run.days.includes(selectedRunDay));
  const activeSelectedDayRuns = selectedDayRuns.filter((run) => run.status === "active");
  const runTimeToMinutes = (time: string) => {
    const [hour, minute] = time.split(":").map(Number);
    return hour * 60 + minute;
  };
  const selectedOperatingHours = operatingHours[RUN_OPERATING_DAY_KEYS[selectedRunDay]];
  const timetableSlots = (() => {
    if (!selectedOperatingHours?.isOpen) return [];
    const start = runTimeToMinutes(selectedOperatingHours.start);
    const end = runTimeToMinutes(selectedOperatingHours.end);
    const formatTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    const boundaries = new Set<number>([start, end]);
    for (let minute = start; minute < end; minute += 60) boundaries.add(minute);
    selectedDayRuns.forEach((run) => {
      const runStart = Math.max(start, runTimeToMinutes(run.startTime));
      const runEnd = Math.min(end, runTimeToMinutes(run.endTime));
      const duration = runEnd - runStart;
      const needsHalfHourSlots = duration % 60 !== 0 || (runStart - start) % 60 !== 0;
      if (!needsHalfHourSlots) return;
      boundaries.add(runStart);
      boundaries.add(runEnd);
      for (let minute = runStart + 30; minute < runEnd; minute += 30) boundaries.add(minute);
    });
    const sortedBoundaries = Array.from(boundaries).filter((minute) => minute >= start && minute <= end).sort((a, b) => a - b);
    return sortedBoundaries.slice(0, -1).map((slotStart, index) => ({
      startTime: formatTime(slotStart),
      endTime: formatTime(sortedBoundaries[index + 1]),
    }));
  })();
  const hasRunConflict = (target: VehicleRun) => activeSelectedDayRuns.some((other) => other.id !== target.id
    && target.startTime < other.endTime && target.endTime > other.startTime
    && (target.vehicleId === other.vehicleId
      || (!!target.driverMemberId && target.driverMemberId === other.driverMemberId)
      || (!!target.companionMemberId && target.companionMemberId === other.companionMemberId)));
  const prepareRunFromTimetable = (vehicleId = "", startTime = "", endTime = "") => {
    const selectedCloseTime = selectedOperatingHours?.end || "";
    const suggestedEndTime = startTime
      ? (() => {
          const closeMinute = runTimeToMinutes(selectedCloseTime);
          const startMinute = runTimeToMinutes(startTime);
          const endMinute = Math.min(startMinute + 60, closeMinute);
          return `${String(Math.floor(endMinute / 60)).padStart(2, "0")}:${String(endMinute % 60).padStart(2, "0")}`;
        })()
      : endTime;
    setEditingId("");
    setConflictAcknowledged(false);
    setDraft({ ...emptyDraft(), days: [selectedRunDay], vehicleId, startTime, endTime: suggestedEndTime });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return <main className="setting-register-page vehicle-run-management-page">
    <button className="back" type="button" onClick={back}><Icon name="back" />센터 관리로</button>
    <section className="setting-register-head"><span>센터 운영</span><h1>운행 회차 관리</h1><p>차량이 실제로 연속 운행하는 단위입니다. 한 회차에 등원과 하원이 함께 포함될 수 있습니다.</p></section>
    <form className="setting-register-form vehicle-run-form" onSubmit={saveRun}>
      <label><span>회차 이름</span><input required value={draft.name} onChange={(event) => updateDraft({ ...draft, name: event.target.value })} placeholder="예: 평일 1회차" /></label>
      <fieldset><legend>반복 요일</legend><div className="run-day-options">{RUN_WEEKDAYS.map((label, day) => <button type="button" key={label} className={draft.days.includes(day) ? "active" : ""} onClick={() => updateDraft({ ...draft, days: draft.days.includes(day) ? draft.days.filter((item) => item !== day) : [...draft.days, day].sort() })}>{label}</button>)}</div></fieldset>
      <label><span>차량</span><select required value={draft.vehicleId} onChange={(event) => updateDraft({ ...draft, vehicleId: event.target.value })}><option value="">차량 선택</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name} · {vehicle.number}</option>)}</select></label>
      <div className="vehicle-run-time-row"><label><span>시작 시간</span><input type="time" required value={draft.startTime} onChange={(event) => updateDraft({ ...draft, startTime: event.target.value })} /></label><label><span>종료 시간</span><input type="time" required value={draft.endTime} onChange={(event) => updateDraft({ ...draft, endTime: event.target.value })} /></label></div>
      <label><span>기사</span><select value={draft.driverMemberId} onChange={(event) => updateDraft({ ...draft, driverMemberId: event.target.value })}><option value="">미배정</option>{drivers.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.phone}</option>)}</select></label>
      <label><span>동승자</span><select value={draft.companionMemberId} onChange={(event) => updateDraft({ ...draft, companionMemberId: event.target.value })}><option value="">없음</option>{companions.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.phone}</option>)}</select></label>
      {!!conflictingRuns.length && <section className="vehicle-run-conflict-panel" role="alert"><strong>중복 가능성이 있는 회차</strong>{conflictingRuns.map((run) => <p key={run.id}>{run.name} · {run.startTime}~{run.endTime} · {getConflictReasons(run)} 중복</p>)}<small>운영상 필요한 중복이라면 경고 확인 후 저장할 수 있습니다.</small></section>}
      {message && <p className="auth-message" role="status">{message}</p>}
      <button type="submit">{conflictingRuns.length && conflictAcknowledged ? "경고 확인 후 저장" : editingId ? "회차 수정 저장" : "운행 회차 추가"}</button>
      {editingId && <button type="button" className="ghost-button" onClick={() => { setEditingId(""); setDraft(emptyDraft()); setConflictAcknowledged(false); }}>수정 취소</button>}
    </form>
    <section className="vehicle-run-schedule-section">
      <div className="vehicle-run-view-head"><div><h2>등록된 운행 회차</h2><p>요일별 차량 운행을 시간표로 확인할 수 있습니다.</p></div><div className="vehicle-run-view-toggle"><button type="button" className={runViewMode === "timetable" ? "active" : ""} onClick={() => setRunViewMode("timetable")}>시간표 보기</button><button type="button" className={runViewMode === "list" ? "active" : ""} onClick={() => setRunViewMode("list")}>목록 보기</button></div></div>
      {loading ? <p>불러오는 중...</p> : runViewMode === "timetable" ? <>
        <div className="vehicle-run-day-tabs" aria-label="운행 요일 선택">{RUN_WEEKDAYS.map((label, day) => <button type="button" key={label} className={selectedRunDay === day ? "active" : ""} onClick={() => setSelectedRunDay(day)}>{label}요일</button>)}</div>
        <div className="vehicle-run-operating-summary"><span>센터 운영 시간</span><strong>{selectedOperatingHours?.isOpen ? `${selectedOperatingHours.start} ~ ${selectedOperatingHours.end}` : "휴무일"}</strong></div>
        {!vehicles.length ? <p className="empty-state">등록된 차량이 없습니다.</p> : !selectedOperatingHours?.isOpen ? <section className="vehicle-run-empty"><p>{RUN_WEEKDAYS[selectedRunDay]}요일은 센터 휴무일로 설정되어 있습니다.</p><small>센터 설정에서 운영 여부와 시간을 변경할 수 있습니다.</small></section> : <>
          <div className="vehicle-run-matrix-scroll"><div className="vehicle-run-matrix" style={{ gridTemplateColumns: `116px repeat(${vehicles.length}, minmax(210px, 1fr))` }}>
            <div className="matrix-head time">운행 시간</div>{vehicles.map((vehicle) => <div className="matrix-head" key={vehicle.id}><strong>{vehicle.name}</strong><small>{vehicle.number || "차량 번호 미등록"}</small></div>)}
            {timetableSlots.map((slot) => <div className="matrix-row" key={`${slot.startTime}-${slot.endTime}`} style={{ gridColumn: `1 / span ${vehicles.length + 1}`, gridTemplateColumns: `116px repeat(${vehicles.length}, minmax(210px, 1fr))` }}>
              <div className="matrix-time"><strong>{slot.startTime}</strong><span>~ {slot.endTime}</span></div>
              {vehicles.map((vehicle) => {
                const slotStartMinute = runTimeToMinutes(slot.startTime); const slotEndMinute = runTimeToMinutes(slot.endTime);
                const overlappingRuns = selectedDayRuns.filter((run) => run.vehicleId === vehicle.id && runTimeToMinutes(run.startTime) < slotEndMinute && runTimeToMinutes(run.endTime) > slotStartMinute);
                const startingRuns = overlappingRuns.filter((run) => runTimeToMinutes(run.startTime) >= slotStartMinute);
                return <div className="matrix-cell" key={vehicle.id}>{startingRuns.length ? startingRuns.map((run) => {
                  const driver = managers.find((item) => item.id === run.driverMemberId); const companion = managers.find((item) => item.id === run.companionMemberId); const conflict = hasRunConflict(run);
                  return <button type="button" key={run.id} className={`matrix-run-card ${run.status === "inactive" ? "inactive" : ""} ${conflict ? "conflict" : ""}`} onClick={() => edit(run)}><div><strong>{run.name}</strong>{conflict && <b>중복</b>}</div><small>기사 {driver?.name ?? "미배정"} · 동승자 {companion?.name ?? "없음"}</small><span>{run.status === "active" ? "사용 중" : "사용 중지"} · 수정 ›</span></button>;
                }) : overlappingRuns.length ? <button type="button" className="matrix-run-continuation" onClick={() => edit(overlappingRuns[0])}>↳ {overlappingRuns[0].name} 운행 중</button> : <button type="button" className="matrix-empty-button" onClick={() => prepareRunFromTimetable(vehicle.id, slot.startTime, slot.endTime)}>+ 회차 추가</button>}</div>;
              })}
            </div>)}
          </div></div>
          <div className="vehicle-run-mobile-cards">{vehicles.map((vehicle) => {
            const vehicleRuns = selectedDayRuns.filter((run) => run.vehicleId === vehicle.id).sort((a, b) => runTimeToMinutes(a.startTime) - runTimeToMinutes(b.startTime));
            return <section key={vehicle.id}><header><div><strong>{vehicle.name}</strong><small>{vehicle.number || "차량 번호 미등록"}</small></div><button type="button" onClick={() => prepareRunFromTimetable(vehicle.id)}>+ 추가</button></header>{vehicleRuns.length ? vehicleRuns.map((run) => {
              const driver = managers.find((item) => item.id === run.driverMemberId); const companion = managers.find((item) => item.id === run.companionMemberId); const conflict = hasRunConflict(run);
              return <button type="button" key={run.id} className={`mobile-run-card ${run.status === "inactive" ? "inactive" : ""} ${conflict ? "conflict" : ""}`} onClick={() => edit(run)}><span>{run.startTime} ~ {run.endTime}</span><strong>{run.name}</strong><small>기사 {driver?.name ?? "미배정"} · 동승자 {companion?.name ?? "없음"}</small>{conflict && <b>중복</b>}</button>;
            }) : <p>등록된 회차가 없습니다.</p>}</section>;
          })}</div>
        </>}
        {selectedOperatingHours?.isOpen && <div className="vehicle-run-add-row"><small>센터 운영 시간 안의 빈 칸을 누르면 해당 차량의 회차를 추가할 수 있습니다.</small><button type="button" onClick={() => prepareRunFromTimetable()}>+ 운행 회차 추가</button></div>}
      </> : <section className="vehicle-run-list">{runs.map((run) => {
      const vehicle = vehicles.find((item) => item.id === run.vehicleId); const driver = managers.find((item) => item.id === run.driverMemberId); const companion = managers.find((item) => item.id === run.companionMemberId);
      return <article key={run.id} className={run.status === "inactive" ? "inactive" : ""}><div><span>{run.days.map((day) => RUN_WEEKDAYS[day]).join("·")}</span><h3>{run.name}</h3><p>{run.startTime} ~ {run.endTime} · {vehicle?.name ?? "차량 미등록"}</p><small>기사 {driver?.name ?? "미배정"} · 동승자 {companion?.name ?? "없음"}</small></div><div className="vehicle-run-actions"><b>{run.status === "active" ? "사용 중" : "사용 중지"}</b><button type="button" onClick={() => edit(run)}>수정</button><button type="button" onClick={async () => { await supabase.from("vehicle_runs").update({ status: run.status === "active" ? "inactive" : "active", updated_at: new Date().toISOString() }).eq("id", run.id); await loadRuns(); }}>{run.status === "active" ? "사용 중지" : "다시 사용"}</button></div></article>;
    })}</section>}
    </section>
  </main>;
}

type UnassignedRideSchedule = {
  id: string;
  weekday: number;
  direction: "pickup" | "dropoff";
  rideTime: string;
  place: string;
  vehicleId: string;
  vehicleName: string;
  studentName: string;
};

const timeToMinutes = (time: string) => {
  const [hour, minute] = time.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
};

export function VehicleRunReassignmentPage({ centerId, vehicles, back }: {
  centerId: string;
  vehicles: VehicleOption[];
  back: () => void;
}) {
  const [runs, setRuns] = useState<VehicleRun[]>([]);
  const [schedules, setSchedules] = useState<UnassignedRideSchedule[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dayFilter, setDayFilter] = useState("all");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const candidatesFor = (schedule: UnassignedRideSchedule) => runs.filter((run) =>
    run.status === "active" && run.vehicleId === schedule.vehicleId && run.days.includes(schedule.weekday));

  const recommendationFor = (schedule: UnassignedRideSchedule, sourceRuns = runs) => {
    const rideMinute = timeToMinutes(schedule.rideTime);
    const candidates = sourceRuns.filter((run) => run.status === "active" && run.vehicleId === schedule.vehicleId && run.days.includes(schedule.weekday));
    const scored = candidates.map((run) => {
      const start = timeToMinutes(run.startTime); const end = timeToMinutes(run.endTime);
      const distance = rideMinute < start ? start - rideMinute : rideMinute > end ? rideMinute - end : 0;
      return { run, distance };
    }).sort((a, b) => a.distance - b.distance || a.run.startTime.localeCompare(b.run.startTime));
    if (!scored.length || scored[0].distance > 60) return { run: undefined, label: "추천 없음", ambiguous: true };
    const bestDistance = scored[0].distance;
    const tied = scored.filter((item) => item.distance === bestDistance);
    return { run: scored[0].run, label: bestDistance === 0 ? tied.length > 1 ? "후보 중복 · 확인 필요" : "시간 범위 일치" : `운행 시간과 ${bestDistance}분 차이 · 확인 필요`, ambiguous: tied.length > 1 || bestDistance > 0 };
  };

  const loadUnassigned = async () => {
    setLoading(true); setMessage("");
    const [runResult, scheduleResult] = await Promise.all([
      supabase.from("vehicle_runs").select("id,center_id,name,days,vehicle_id,scheduled_start,scheduled_end,driver_member_id,companion_member_id,status").eq("center_id", centerId).order("scheduled_start"),
      supabase.from("ride_schedules").select("id,weekday,direction,ride_time,place,vehicle_id,vehicle_name,students(name)").eq("center_id", centerId).eq("is_active", true).is("run_id", null).not("vehicle_id", "is", null).order("weekday").order("ride_time"),
    ]);
    if (runResult.error || scheduleResult.error) {
      setMessage(`조회 실패: ${runResult.error?.message ?? scheduleResult.error?.message}`); setLoading(false); return;
    }
    const nextRuns: VehicleRun[] = (runResult.data ?? []).map((row) => ({ id: row.id, centerId: row.center_id, name: row.name, days: row.days ?? [], vehicleId: row.vehicle_id, startTime: row.scheduled_start?.slice(0, 5) ?? "", endTime: row.scheduled_end?.slice(0, 5) ?? "", driverMemberId: row.driver_member_id ?? undefined, companionMemberId: row.companion_member_id ?? undefined, status: row.status === "inactive" ? "inactive" : "active" }));
    const nextSchedules: UnassignedRideSchedule[] = (scheduleResult.data ?? []).map((row) => {
      const student = Array.isArray(row.students) ? row.students[0] : row.students;
      return { id: row.id, weekday: row.weekday, direction: row.direction === "dropoff" ? "dropoff" : "pickup", rideTime: row.ride_time?.slice(0, 5) ?? "", place: row.place ?? "", vehicleId: row.vehicle_id ?? "", vehicleName: row.vehicle_name ?? "차량 미등록", studentName: student?.name ?? "이름 미등록" };
    });
    const suggested = Object.fromEntries(nextSchedules.flatMap((schedule) => {
      const rideMinute = timeToMinutes(schedule.rideTime);
      const scored = nextRuns.filter((run) => run.status === "active" && run.vehicleId === schedule.vehicleId && run.days.includes(schedule.weekday)).map((run) => {
        const start = timeToMinutes(run.startTime); const end = timeToMinutes(run.endTime);
        return { run, distance: rideMinute < start ? start - rideMinute : rideMinute > end ? rideMinute - end : 0 };
      }).sort((a, b) => a.distance - b.distance || a.run.startTime.localeCompare(b.run.startTime));
      return scored[0] && scored[0].distance <= 60 ? [[schedule.id, scored[0].run.id]] : [];
    }));
    setRuns(nextRuns); setSchedules(nextSchedules); setAssignments(suggested); setSelectedIds([]); setLoading(false);
  };

  useEffect(() => { if (centerId) void loadUnassigned(); }, [centerId]);
  const filteredSchedules = schedules.filter((schedule) => (dayFilter === "all" || schedule.weekday === Number(dayFilter)) && (vehicleFilter === "all" || schedule.vehicleId === vehicleFilter));
  const selectableVisibleIds = filteredSchedules.filter((schedule) => assignments[schedule.id]).map((schedule) => schedule.id);
  const allVisibleSelected = selectableVisibleIds.length > 0 && selectableVisibleIds.every((id) => selectedIds.includes(id));

  const saveAssignments = async () => {
    const targets = selectedIds.filter((id) => assignments[id]);
    if (!targets.length) { setMessage("배정할 일정을 선택해주세요."); return; }
    setSaving(true); setMessage("");
    const byRun = new Map<string, string[]>();
    targets.forEach((id) => byRun.set(assignments[id], [...(byRun.get(assignments[id]) ?? []), id]));
    for (const [runId, ids] of byRun) {
      const { error } = await supabase.from("ride_schedules").update({ run_id: runId, updated_at: new Date().toISOString() }).eq("center_id", centerId).in("id", ids).is("run_id", null);
      if (error) { setMessage(`배정 실패: ${error.message}`); setSaving(false); return; }
    }
    setSaving(false); await loadUnassigned(); setMessage(`${targets.length}개 일정을 운행 회차에 배정했습니다.`);
  };

  return <main className="setting-register-page run-reassignment-page">
    <button className="back" type="button" onClick={back}><Icon name="back" />센터 관리로</button>
    <section className="setting-register-head"><span>기존 데이터 정리</span><h1>기존 일정 회차 재배정</h1><p>추천 결과를 확인한 일정만 선택해 저장합니다. 애매한 일정은 미배정 상태로 남겨둘 수 있습니다.</p></section>
    <section className="run-reassignment-toolbar">
      <label><span>요일</span><select value={dayFilter} onChange={(event) => setDayFilter(event.target.value)}><option value="all">전체 요일</option>{RUN_WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}요일</option>)}</select></label>
      <label><span>차량</span><select value={vehicleFilter} onChange={(event) => setVehicleFilter(event.target.value)}><option value="all">전체 차량</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name} · {vehicle.number}</option>)}</select></label>
      <div><strong>미배정 {filteredSchedules.length}건</strong><button type="button" onClick={() => setSelectedIds((current) => allVisibleSelected ? current.filter((id) => !selectableVisibleIds.includes(id)) : [...new Set([...current, ...selectableVisibleIds])])}>{allVisibleSelected ? "화면 선택 해제" : "추천 일정 전체 선택"}</button></div>
    </section>
    {loading && <section className="detail-empty-state">미배정 일정을 불러오고 있습니다.</section>}
    {!loading && !filteredSchedules.length && <section className="detail-empty-state"><strong>재배정할 일정이 없습니다.</strong><p>모든 차량 일정에 운행 회차가 연결되어 있습니다.</p></section>}
    <section className="run-reassignment-list">{filteredSchedules.map((schedule) => {
      const recommendation = recommendationFor(schedule); const selectedRunId = assignments[schedule.id] ?? ""; const candidates = candidatesFor(schedule);
      return <article key={schedule.id} className={selectedIds.includes(schedule.id) ? "selected" : ""}>
        <label className="reassignment-check"><input type="checkbox" checked={selectedIds.includes(schedule.id)} disabled={!selectedRunId} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, schedule.id] : current.filter((id) => id !== schedule.id))} /><span /></label>
        <div className="reassignment-schedule"><div><b>{RUN_WEEKDAYS[schedule.weekday]}요일</b><span className={schedule.direction}>{schedule.direction === "pickup" ? "등원" : "하원"}</span></div><h3>{schedule.rideTime} · {schedule.studentName}</h3><p>{schedule.vehicleName} · {schedule.place || "장소 미등록"}</p></div>
        <div className="reassignment-choice"><small className={recommendation.ambiguous ? "warning" : "matched"}>{recommendation.label}</small><select value={selectedRunId} onChange={(event) => { setAssignments((current) => ({ ...current, [schedule.id]: event.target.value })); if (!event.target.value) setSelectedIds((current) => current.filter((id) => id !== schedule.id)); }}><option value="">회차 미배정 유지</option>{candidates.map((run) => <option key={run.id} value={run.id}>{run.startTime}~{run.endTime} · {run.name}</option>)}</select></div>
      </article>;
    })}</section>
    {message && <p className="auth-message" role="status">{message}</p>}
    {!!filteredSchedules.length && <div className="run-reassignment-save"><span>{selectedIds.length}건 선택됨</span><button type="button" disabled={saving || !selectedIds.length} onClick={() => void saveAssignments()}>{saving ? "배정 저장 중..." : "선택 일정 회차 배정"}</button></div>}
  </main>;
}

export function SettingsPage({
  centerId,
  centerName,
  managers,
  onAccountDeleted,
}: {
  centerId: string;
  centerName: string;
  managers: RegisteredManager[];
  onAccountDeleted: () => Promise<void>;
}) {
  const [showWithdrawal, setShowWithdrawal] = useState(false);
  if (showWithdrawal) {
    return <AccountWithdrawalPage centerId={centerId} centerName={centerName} managers={managers} back={() => setShowWithdrawal(false)} onDeleted={onAccountDeleted} />;
  }
  return (
    <main className="settings-page">
      <section className="settings-head">
        <span>개인 설정</span>
        <h1>설정</h1>
        <p>내 계정과 알림, 서비스 이용 정보를 관리합니다.</p>
      </section>
      <section className="settings-card-grid" aria-label="등록 설정">
        <article className="settings-info-card"><span className="settings-card-icon" aria-hidden="true">내</span><span className="settings-card-copy"><strong>내 계정</strong><small>로그인 계정과 센터 소속 정보가 연결되어 있습니다.</small></span></article>
        <article className="settings-info-card"><span className="settings-card-icon" aria-hidden="true">알</span><span className="settings-card-copy"><strong>알림 설정</strong><small>학부모 공지 기능과 함께 알림 수신 설정을 추가할 예정입니다.</small></span></article>
        <button className="danger-setting-card" type="button" onClick={() => setShowWithdrawal(true)}>
          <span className="settings-card-icon" aria-hidden="true">탈</span>
          <span className="settings-card-copy">
            <strong>회원 탈퇴</strong>
            <small>계정과 센터 소속 정보를 영구적으로 삭제합니다.</small>
          </span>
          <b aria-hidden="true">›</b>
        </button>
      </section>
    </main>
  );
}

function AccountWithdrawalPage({
  centerId,
  centerName,
  managers,
  back,
  onDeleted,
}: {
  centerId: string;
  centerName: string;
  managers: RegisteredManager[];
  back: () => void;
  onDeleted: () => Promise<void>;
}) {
  const [withdrawalType, setWithdrawalType] = useState<"member" | "transfer" | "close">("member");
  const [isOwner, setIsOwner] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [newOwnerMemberId, setNewOwnerMemberId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [centerConfirmation, setCenterConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const operatorOptions = managers.filter((manager) =>
    manager.userId !== currentUserId && manager.status === "사용 중" && manager.roles.includes("운영자"),
  );
  const canSubmit = Boolean(
    password &&
    confirmation === "회원탈퇴" &&
    (!isOwner || (withdrawalType === "transfer" && newOwnerMemberId) || (withdrawalType === "close" && centerConfirmation === centerName)),
  );

  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data }) => {
      const userId = data.user?.id ?? "";
      setCurrentUserId(userId);
      if (!userId || !centerId) return;
      const { data: center } = await supabase.from("centers").select("created_by").eq("id", centerId).maybeSingle();
      const owner = center?.created_by === userId;
      setIsOwner(owner);
      setWithdrawalType(owner ? "transfer" : "member");
    });
  }, [centerId]);

  return (
    <main className="setting-register-page">
      <button className="back" type="button" onClick={back}><Icon name="back" />설정으로</button>
      <section className="setting-register-head">
        <span>계정 관리</span>
        <h1>회원 탈퇴</h1>
        <p>탈퇴하면 계정과 센터 소속 정보가 삭제되며 복구할 수 없습니다.</p>
      </section>
      <form className="setting-register-form" onSubmit={async (event) => {
        event.preventDefault();
        if (!canSubmit) return;
        setSubmitting(true);
        setMessage("");
        try {
          const { data: userData, error: userError } = await supabase.auth.getUser();
          const email = userData.user?.email;
          if (userError || !email) throw new Error("로그인 계정을 확인하지 못했습니다.");
          const { error: passwordError } = await supabase.auth.signInWithPassword({ email, password });
          if (passwordError) throw new Error("비밀번호가 올바르지 않습니다.");
          const rpcName = isOwner
            ? withdrawalType === "transfer"
              ? "transfer_center_and_delete_my_account"
              : "close_center_and_delete_my_account"
            : "delete_my_account";
          const rpcArgs = isOwner
            ? withdrawalType === "transfer"
              ? { p_center_id: centerId, p_new_owner_member_id: newOwnerMemberId }
              : { p_center_id: centerId, p_center_name: centerConfirmation }
            : undefined;
          const { error: deleteError } = await supabase.rpc(rpcName, rpcArgs);
          if (deleteError) throw new Error(deleteError.message);
          await onDeleted();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "회원 탈퇴를 처리하지 못했습니다.");
        } finally {
          setSubmitting(false);
        }
      }}>
        {isOwner && <fieldset className="manager-role-fieldset">
          <legend>센터 처리 방법</legend>
          <label>
            <input type="radio" name="withdrawalType" checked={withdrawalType === "transfer"} onChange={() => { setWithdrawalType("transfer"); setMessage(""); }} />
            <span>센터 소유권 이전 후 탈퇴</span>
          </label>
          <label>
            <input type="radio" name="withdrawalType" checked={withdrawalType === "close"} onChange={() => { setWithdrawalType("close"); setMessage(""); }} />
            <span>센터 폐쇄 후 탈퇴</span>
          </label>
        </fieldset>}
        {isOwner && withdrawalType === "transfer" && <label>
          <span>새 센터 소유자</span>
          <select value={newOwnerMemberId} onChange={(event) => setNewOwnerMemberId(event.target.value)} required>
            <option value="" disabled>활성 운영자를 선택해주세요</option>
            {operatorOptions.map((manager) => <option key={manager.id} value={manager.id}>{manager.name} · {manager.phone}</option>)}
          </select>
          {!operatorOptions.length && <small>소유권을 이전할 다른 활성 운영자가 없습니다. 먼저 담당자 및 권한 관리에서 운영자를 등록해주세요.</small>}
        </label>}
        {isOwner && withdrawalType === "close" && <div className="auth-message error" role="note">
          센터를 폐쇄하면 학생·클래스·차량·운행 스케줄을 포함한 센터 데이터가 모두 삭제되며 복구할 수 없습니다.
        </div>}
        {isOwner && withdrawalType === "close" && <label>
          <span>센터명 확인</span>
          <input value={centerConfirmation} onChange={(event) => setCenterConfirmation(event.target.value)} placeholder={centerName} required />
          <small>계속하려면 ‘{centerName}’을 정확히 입력해주세요.</small>
        </label>}
        <label>
          <span>현재 비밀번호</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        </label>
        <label>
          <span>확인 문구</span>
          <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="회원탈퇴 입력" required />
          <small>계속하려면 ‘회원탈퇴’를 정확히 입력해주세요.</small>
        </label>
        {message && <p className="auth-message error" role="alert">{message}</p>}
        <button type="submit" disabled={!canSubmit || submitting}>{submitting ? "탈퇴 처리 중..." : isOwner && withdrawalType === "close" ? "센터 폐쇄 후 회원 탈퇴" : isOwner ? "소유권 이전 후 회원 탈퇴" : "회원 탈퇴"}</button>
      </form>
    </main>
  );
}

const DURATION_OPTIONS = [40, 50, 60, 90, 119, 120];

function addMinutes(time: string, minutes: number) {
  if (!time) return "";
  const [hour, minute] = time.split(":").map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function getDurationMinutes(startTime: string, endTime: string, fallback: number) {
  if (!startTime || !endTime) return fallback;
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const duration = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  return duration > 0 ? duration : fallback;
}

function formatKoreanTime(time: string) {
  if (!time) return "미선택";
  const [hourText, minute = "00"] = time.split(":");
  const hour = Number(hourText);
  return `${hour >= 12 ? "오후" : "오전"} ${hour % 12 || 12}:${minute}`;
}

function getHourlyTimes(start: string, end: string) {
  if (!start || !end || end <= start) return [];
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  const startTotal = Math.ceil((startHour * 60 + startMinute) / 60) * 60;
  const endTotal = endHour * 60 + endMinute;
  return Array.from({ length: Math.max(0, Math.ceil((endTotal - startTotal) / 60)) }, (_, index) => {
    const total = startTotal + index * 60;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:00`;
  }).filter((time) => time < end);
}

function ClassTimeFields({ startTime, setStartTime, durationMinutes, setDurationMinutes, endTime, setEndTime, manualEnd, setManualEnd, durationOptions, quickStartTimes }: {
  startTime: string;
  setStartTime: (value: string) => void;
  durationMinutes: number;
  setDurationMinutes: (value: number) => void;
  endTime: string;
  setEndTime: (value: string) => void;
  manualEnd: boolean;
  setManualEnd: (value: boolean) => void;
  durationOptions: number[];
  quickStartTimes: string[];
}) {
  const isCustomDuration = !durationOptions.includes(durationMinutes);
  useEffect(() => {
    const calculatedEndTime = addMinutes(startTime, durationMinutes);
    if (!manualEnd && calculatedEndTime && calculatedEndTime !== endTime) setEndTime(calculatedEndTime);
  }, [startTime, durationMinutes, manualEnd, endTime, setEndTime]);
  return <section className="class-time-fields">
    <fieldset><legend>빠른 선택</legend>
      {quickStartTimes.length ? <div className="quick-time-row">{quickStartTimes.map((time) => <button key={time} type="button" className={startTime === time ? "active" : ""} onClick={() => setStartTime(time)}>{formatKoreanTime(time)}</button>)}</div> : <small className="time-guide">먼저 운영 중인 수업 요일을 선택해주세요.</small>}
    </fieldset>
    <fieldset><legend>수업 시간</legend><div className="time-choice-buttons">
      {durationOptions.map((minutes) => <button key={minutes} type="button" className={durationMinutes === minutes ? "active" : ""} onClick={() => setDurationMinutes(minutes)}>{minutes}분</button>)}
      <button type="button" className={isCustomDuration ? "active" : ""} onClick={() => { if (!isCustomDuration) setDurationMinutes(70); }}>직접 입력</button>
    </div>{isCustomDuration && <label className="direct-time"><span>수업 시간(분)</span><input type="number" min="1" max="720" value={durationMinutes} onChange={(event) => setDurationMinutes(Math.max(1, Number(event.target.value)))} required /></label>}</fieldset>
    <fieldset className="start-time-field"><legend>시작 시간</legend><OperatingTimePicker label="시작 시간" value={startTime} onChange={setStartTime} /></fieldset>
    <div className="calculated-time"><span>{manualEnd ? "직접 설정한 수업 시간" : "예상 수업 시간"}</span><strong>{formatKoreanTime(startTime)} ~ {formatKoreanTime(endTime)}</strong><button type="button" onClick={() => setManualEnd(!manualEnd)}>{manualEnd ? "자동 계산 사용" : "종료 시간 직접 수정"}</button></div>
    {manualEnd && <div className="manual-end-time"><OperatingTimePicker label="종료 시간" value={endTime} onChange={setEndTime} /></div>}
    <style jsx>{`
      .class-time-fields { display: grid; gap: 15px; }
      fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
      legend, label > span, .calculated-time > span { margin-bottom: 8px; color: #344054; font-size: 12px; font-weight: 800; }
      .time-choice-buttons { display: flex; flex-wrap: wrap; gap: 7px; }
      .time-choice-buttons button { min-height: 40px; padding: 0 13px; border: 1px solid #d8dde2; border-radius: 9px; background: #fff; color: #344054; font-weight: 800; cursor: pointer; }
      .time-choice-buttons button.active { border-color: #202328; background: #202328; color: #fff; }
      .quick-time-row { display: flex; flex-wrap: wrap; gap: 7px; }
      .quick-time-row button { min-height: 36px; padding: 0 11px; border: 1px solid #d8dde2; border-radius: 8px; background: #fff; color: #475467; font-size: 12px; font-weight: 800; cursor: pointer; }
      .quick-time-row button.active { border-color: #202328; background: #202328; color: #fff; }
      .time-guide { display: block; margin-top: 8px; color: #667085; font-size: 11px; }
      .direct-time, .manual-end-time { display: grid; gap: 7px; margin-top: 10px; }
      .direct-time input, .manual-end-time input { width: 100%; height: 43px; padding: 0 12px; border: 1px solid #d8dde2; border-radius: 9px; box-sizing: border-box; font: inherit; }
      .calculated-time { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 5px 12px; padding: 15px 16px; border-radius: 12px; background: #f5f7f9; }
      .calculated-time > span { grid-column: 1 / -1; margin: 0; }
      .calculated-time strong { font-size: 19px; }
      .calculated-time button { border: 0; background: transparent; color: #475467; font-weight: 800; text-decoration: underline; cursor: pointer; }
      @media (max-width: 600px) { .time-choice-buttons { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 3px; } .time-choice-buttons button { flex: 0 0 auto; } .quick-time-row { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 3px; } .quick-time-row button { flex: 0 0 auto; font-size: 10px; } .calculated-time { grid-template-columns: 1fr; } .calculated-time > span { grid-column: auto; } .calculated-time strong { font-size: 15px; } .calculated-time button { justify-self: start; padding: 6px 0 0; } }
    `}</style>
  </section>;
}

export function ClassManagementPage({
  classes,
  classrooms,
  defaultClassDurationMinutes,
  classDurationOptions,
  operatingHours,
  back,
  onCreate,
  onUpdate,
}: {
  classes: ClassOption[];
  classrooms: ClassroomOption[];
  defaultClassDurationMinutes: number;
  classDurationOptions: number[];
  operatingHours: OperatingHours;
  back: () => void;
  onCreate: (classItem: Omit<ClassOption, "id" | "status">) => Promise<void>;
  onUpdate: (classItem: ClassOption) => Promise<void>;
}) {
  const [days, setDays] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassOption | null>(null);
  const [startTime, setStartTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(defaultClassDurationMinutes);
  const [endTime, setEndTime] = useState("");
  const [manualEnd, setManualEnd] = useState(false);
  const [editDurationMinutes, setEditDurationMinutes] = useState(defaultClassDurationMinutes);
  const [editManualEnd, setEditManualEnd] = useState(false);
  const [classroomId, setClassroomId] = useState("");
  const [selectedTimetableDay, setSelectedTimetableDay] = useState(() => {
    const currentDay = new Date().getDay();
    return currentDay >= 1 && currentDay <= 6 ? ["일", "월", "화", "수", "목", "금", "토"][currentDay] : "월";
  });
  const dayKeyByLabel = Object.fromEntries(OPERATING_DAYS.map(({ key, label }) => [label, key])) as Record<string, OperatingDayKey>;
  const getQuickStartTimes = (selectedDays: string[]) => {
    const selectedKey = dayKeyByLabel[selectedDays[0]] ?? OPERATING_DAYS.find(({ key }) => operatingHours[key].isOpen)?.key;
    return selectedKey ? getHourlyTimes(operatingHours[selectedKey].start, operatingHours[selectedKey].end) : [];
  };
  const getInvalidOperatingDay = (selectedDays: string[], nextStartTime: string, nextEndTime: string) => selectedDays.find((day) => {
    const key = dayKeyByLabel[day];
    const schedule = key ? operatingHours[key] : undefined;
    return !schedule?.isOpen || nextStartTime < schedule.start || nextEndTime > schedule.end;
  });
  const toggleDay = (day: string) =>
    setDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day]);
  const timetableDays = OPERATING_DAYS.filter(({ key }) => key !== "sun");
  const getClassesForDay = (day: string) => classes
    .filter((classItem) => classItem.days.includes(day))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const selectedDayClasses = getClassesForDay(selectedTimetableDay);

  return (
    <main className="setting-register-page">
      <button className="back" type="button" onClick={back}><Icon name="back" />설정으로</button>
      <section className="setting-register-head">
        <span>수업 정보</span><h1>클래스 관리</h1>
        <p>학생 등록 전에 소속 클래스의 요일과 시간을 등록해주세요.</p>
      </section>
      <form className="setting-register-form class-management-form" onSubmit={async (event) => {
        event.preventDefault();
        if (!days.length) { setMessage("수업 요일을 한 개 이상 선택해주세요."); return; }
        if (!startTime || !endTime || durationMinutes < 1) { setMessage("수업 시간을 확인해주세요."); return; }
        if (endTime <= startTime) { setMessage("종료 시간은 시작 시간보다 늦어야 합니다."); return; }
        const invalidOperatingDay = getInvalidOperatingDay(days, startTime, endTime);
        if (invalidOperatingDay) { setMessage(`${invalidOperatingDay}요일 센터 운영 시간 안에서 수업 시간을 선택해주세요.`); return; }
        const form = new FormData(event.currentTarget);
        setSubmitting(true); setMessage("");
        try {
          const classroom = classrooms.find((room) => room.id === classroomId);
          await onCreate({
            name: String(form.get("name") ?? "").trim(), days,
            startTime, endTime,
            venue: classroom?.name ?? "",
            classroomId: classroom?.id,
          });
          event.currentTarget.reset(); setDays([]); setStartTime(""); setDurationMinutes(defaultClassDurationMinutes); setEndTime(""); setManualEnd(false); setClassroomId(""); setMessage("클래스가 등록되었습니다.");
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "클래스를 등록하지 못했습니다.");
        } finally { setSubmitting(false); }
      }}>
        <section className="class-basic-grid">
          <label><span>클래스 이름</span><input name="name" required placeholder="예: 5시 클래스" /></label>
          <fieldset className="class-day-field"><legend>수업 요일</legend><div className="class-day-buttons">
            {OPERATING_DAYS.map(({ key, label }) => <button key={key} type="button" disabled={!operatingHours[key].isOpen} title={!operatingHours[key].isOpen ? "센터 휴무일입니다." : `${operatingHours[key].start}~${operatingHours[key].end}`} className={days.includes(label) ? "active" : ""} onClick={() => toggleDay(label)}>{label}</button>)}
          </div></fieldset>
          <label><span>수업 장소</span><select name="classroomId" value={classroomId} onChange={(event) => setClassroomId(event.target.value)}>
            <option value="">강의실을 선택해주세요</option>
            {classrooms.filter((room) => room.status === "active").map((room) => <option key={room.id} value={room.id}>{room.name} · 최대 {room.capacity}명</option>)}
          </select></label>
        </section>
        <ClassTimeFields startTime={startTime} setStartTime={setStartTime} durationMinutes={durationMinutes} setDurationMinutes={setDurationMinutes} endTime={endTime} setEndTime={setEndTime} manualEnd={manualEnd} setManualEnd={setManualEnd} durationOptions={classDurationOptions} quickStartTimes={getQuickStartTimes(days)} />
        <div className="class-registration-summary"><span>등록 내용</span><strong>{days.length ? days.join("·") : "요일 미선택"} | {formatKoreanTime(startTime)}~{formatKoreanTime(endTime)} | {classrooms.find((room) => room.id === classroomId)?.name ?? "강의실 미지정"}</strong></div>
        <button type="submit" disabled={submitting}>{submitting ? "등록 중..." : "클래스 등록"}</button>
        {message && <p className="auth-message" role="status">{message}</p>}
      </form>
      <section className="manager-account-section">
        <div className="manager-section-title"><span><h2>등록된 클래스</h2><p>{selectedTimetableDay}요일 {selectedDayClasses.length}개 · 전체 {classes.length}개</p></span></div>
        {!classes.length ? <p className="empty-state">등록된 클래스가 없습니다.</p> : <>
          <section className="class-weekly-timetable" aria-label="월요일부터 토요일까지 전체 클래스 시간표">
            <nav className="class-timetable-day-tabs" aria-label="클래스 시간표 요일 선택">{timetableDays.map(({ key, label }) => <button type="button" key={key} className={selectedTimetableDay === label ? "active" : ""} onClick={() => setSelectedTimetableDay(label)}>{label}요일</button>)}</nav>
          </section>
          {!selectedDayClasses.length ? <p className="empty-state">{selectedTimetableDay}요일에 등록된 클래스가 없습니다.</p> : <div className="class-card-list">
          {selectedDayClasses.map((item) => <article key={item.id} className={`class-management-card ${item.status === "inactive" ? "inactive" : ""} ${editingClass?.id === item.id ? "editing" : ""}`}>
            {editingClass?.id === item.id ? <div className="class-edit-panel">
              <label><span>클래스 이름</span><input value={editingClass.name} onChange={(event) => setEditingClass({ ...editingClass, name: event.target.value })} /></label>
              <fieldset className="class-day-field"><legend>수업 요일</legend><div className="class-day-buttons">{OPERATING_DAYS.map(({ key, label }) => <button key={key} type="button" disabled={!operatingHours[key].isOpen} title={!operatingHours[key].isOpen ? "센터 휴무일입니다." : `${operatingHours[key].start}~${operatingHours[key].end}`} className={editingClass.days.includes(label) ? "active" : ""} onClick={() => setEditingClass({ ...editingClass, days: editingClass.days.includes(label) ? editingClass.days.filter((item) => item !== label) : [...editingClass.days, label] })}>{label}</button>)}</div></fieldset>
              <ClassTimeFields startTime={editingClass.startTime} setStartTime={(value) => setEditingClass({ ...editingClass, startTime: value })} durationMinutes={editDurationMinutes} setDurationMinutes={setEditDurationMinutes} endTime={editingClass.endTime} setEndTime={(value) => setEditingClass({ ...editingClass, endTime: value })} manualEnd={editManualEnd} setManualEnd={setEditManualEnd} durationOptions={classDurationOptions} quickStartTimes={getQuickStartTimes(editingClass.days)} />
              <label><span>수업 장소</span><select value={editingClass.classroomId ?? ""} onChange={(event) => { const room = classrooms.find((item) => item.id === event.target.value); setEditingClass({ ...editingClass, classroomId: room?.id, venue: room?.name ?? "" }); }}><option value="">강의실 미지정</option>{classrooms.filter((room) => room.status === "active" || room.id === editingClass.classroomId).map((room) => <option key={room.id} value={room.id}>{room.name} · 최대 {room.capacity}명</option>)}</select></label>
              <div className="class-edit-actions"><button type="button" onClick={async () => { if (!editingClass.name.trim() || !editingClass.days.length) { setMessage("클래스 이름과 수업 요일을 확인해주세요."); return; } if (!editingClass.startTime || !editingClass.endTime || editingClass.endTime <= editingClass.startTime) { setMessage("수업 시작·종료 시간을 확인해주세요."); return; } const invalidOperatingDay = getInvalidOperatingDay(editingClass.days, editingClass.startTime, editingClass.endTime); if (invalidOperatingDay) { setMessage(`${invalidOperatingDay}요일 센터 운영 시간 안에서 수업 시간을 선택해주세요.`); return; } setSubmitting(true); try { await onUpdate(editingClass); setEditingClass(null); setMessage("클래스 정보가 수정되었습니다."); } catch (error) { setMessage(error instanceof Error ? error.message : "클래스를 수정하지 못했습니다."); } finally { setSubmitting(false); } }}>저장</button><button type="button" className="light" onClick={() => setEditingClass(null)}>취소</button></div>
            </div> : <><span><strong>{item.name}</strong><small>{item.days.join("·")} · {item.startTime}~{item.endTime}{item.venue ? ` · ${item.venue}` : ""} · {item.status === "inactive" ? "사용 중지" : "사용 중"}</small></span><div className="class-row-actions"><button type="button" onClick={() => { setEditingClass({ ...item }); setEditDurationMinutes(getDurationMinutes(item.startTime, item.endTime, defaultClassDurationMinutes)); setEditManualEnd(false); }}>수정</button><button type="button" className="light" onClick={async () => { try { await onUpdate({ ...item, status: item.status === "inactive" ? "active" : "inactive" }); setMessage(item.status === "inactive" ? "클래스를 다시 사용합니다." : "클래스가 비활성화되었습니다."); } catch (error) { setMessage(error instanceof Error ? error.message : "상태를 변경하지 못했습니다."); } }}>{item.status === "inactive" ? "다시 사용" : "사용 중지"}</button></div></>}
          </article>)}
          </div>}
        </>}
      </section>
      <style jsx>{`
        .class-management-form { width: min(1120px, calc(100% - 48px)); grid-template-columns: minmax(0, 1fr) !important; align-items: stretch; }
        .class-management-form > * { min-width: 0; }
        .class-card-list { display: grid; gap: 12px; margin-top: 16px; }
        .class-basic-grid { width: 100%; display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.35fr) minmax(0, 1fr); align-items: end; gap: 14px; }
        .class-basic-grid > label { min-width: 0; }
        .class-basic-grid > label > span, .class-basic-grid .class-day-field > legend { min-height: 18px; display: flex; align-items: center; margin: 0 0 8px; padding: 0; font-size: 12px; font-weight: 800; line-height: 18px; }
        .class-basic-grid .class-day-field { min-width: 0; margin: 0; padding: 0; border: 0; }
        .class-basic-grid .class-day-buttons { display: flex; flex-wrap: nowrap; gap: 6px; }
        .class-basic-grid .class-day-buttons button { width: 36px; min-width: 36px; height: 43px; padding: 0; border-radius: 8px; font-size: 12px; }
        .class-basic-grid select { width: 100%; }
        .class-registration-summary { display: grid; gap: 6px; padding: 14px 16px; border: 1px solid #e1e5e9; border-radius: 11px; background: #f8f9fa; }
        .class-registration-summary span { color: #667085; font-size: 11px; font-weight: 800; }
        .class-registration-summary strong { color: #202328; font-size: 14px; }
        .class-weekly-timetable { margin-top: 16px; }
        .class-timetable-day-tabs { display: flex; gap: 7px; margin-bottom: 12px; overflow-x: auto; padding-bottom: 2px; }
        .class-timetable-day-tabs button { flex: 0 0 auto; min-width: 64px; height: 38px; padding: 0 13px; border: 1px solid #dce1e5; border-radius: 999px; background: #fff; color: #626c75; font-size: 11px; font-weight: 900; cursor: pointer; }
        .class-timetable-day-tabs button.active { border-color: #202328; background: #202328; color: #fff; }
        .class-management-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 18px; min-width: 0; padding: 18px 20px; border: 1px solid #e1e5e9; border-radius: 14px; background: #fff; box-shadow: 0 3px 10px rgba(32,35,40,.04); }
        .class-management-card.inactive { background: #f6f7f8; opacity: .68; }
        .class-management-card.editing { grid-template-columns: 1fr; opacity: 1; }
        .class-management-card > span { min-width: 0; display: grid; gap: 6px; }
        .class-management-card > span strong { overflow: hidden; color: #202328; font-size: 17px; text-overflow: ellipsis; white-space: nowrap; }
        .class-management-card > span small { color: #667085; font-size: 13px; line-height: 1.5; }
        .class-row-actions, .class-edit-actions { display: flex; justify-content: flex-end; gap: 7px; flex: 0 0 auto; }
        .class-row-actions button, .class-edit-actions button { min-height: 38px; padding: 0 13px; border: 0; border-radius: 8px; background: #202328; color: #fff; font-weight: 800; cursor: pointer; }
        button.light { border: 1px solid #d8dde2; background: #fff; color: #202328; }
        .class-edit-panel { width: 100%; display: grid; gap: 14px; padding: 8px 0; }
        .class-edit-panel label { display: grid; gap: 7px; }
        .class-edit-panel label > span { font-size: 12px; font-weight: 800; }
        .class-edit-panel input, .class-edit-panel select { width: 100%; height: 43px; padding: 0 12px; border: 1px solid #d8dde2; border-radius: 9px; box-sizing: border-box; font: inherit; }
        .class-edit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .class-day-buttons button:disabled { opacity: .35; cursor: not-allowed; }
        @media (max-width: 900px) { .class-management-form { width: calc(100% - 32px); } .class-basic-grid { grid-template-columns: 1fr; align-items: stretch; } }
        @media (max-width: 600px) { .class-management-form { width: calc(100% - 28px); } .class-edit-grid { grid-template-columns: 1fr; } .class-management-card { grid-template-columns: 1fr; align-items: stretch; padding: 16px; } .class-management-card > span strong { white-space: normal; } .class-row-actions { margin-top: 4px; } .class-registration-summary span { font-size: 10px; } .class-registration-summary strong { font-size: 11px; line-height: 1.5; } .class-timetable-day-tabs button { min-width: 56px; height: 34px; padding: 0 10px; font-size: 10px; } }
      `}</style>
    </main>
  );
}

export type OperatingDay = { isOpen: boolean; start: string; end: string };
export type OperatingDayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type OperatingHours = Record<OperatingDayKey, OperatingDay> & {
  _defaults?: { weekday: { start: string; end: string }; weekend: { start: string; end: string } };
  _overrides?: OperatingDayKey[];
};
const OPERATING_DAYS: { key: OperatingDayKey; label: string }[] = [
  { key: "mon", label: "월" }, { key: "tue", label: "화" }, { key: "wed", label: "수" },
  { key: "thu", label: "목" }, { key: "fri", label: "금" }, { key: "sat", label: "토" }, { key: "sun", label: "일" },
];
const OPERATING_HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTE_OPTIONS = ["00", "10", "20", "30", "40", "50"];

function OperatingTimePicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [hourText = "09", minuteText = "00"] = value.split(":");
  const hour24 = Number(hourText);
  const period: "오전" | "오후" = hour24 >= 12 ? "오후" : "오전";
  const hour12 = hour24 % 12 || 12;
  const minute = MINUTE_OPTIONS.includes(minuteText) ? minuteText : "00";
  const update = (nextPeriod: "오전" | "오후", nextHour: number, nextMinute: string) => {
    const nextHour24 = nextHour % 12 + (nextPeriod === "오후" ? 12 : 0);
    onChange(`${String(nextHour24).padStart(2, "0")}:${nextMinute}`);
  };
  return <><div className="operating-time-picker">
    <button type="button" className={`time-display-button ${open ? "active" : ""}`} aria-expanded={open} onClick={() => setOpen((current) => !current)}><span>{label}</span><strong>{value ? `${period} ${String(hour12).padStart(2, "0")}:${minute}` : "시간 선택"}</strong><i aria-hidden="true">⌄</i></button>
    {open && <div className="time-picker-panel"><div className="period-buttons">
      {(["오전", "오후"] as const).map((item) => <button key={item} type="button" className={period === item ? "active" : ""} onClick={() => update(item, hour12, minute)}>{item}</button>)}
    </div><div className="hour-minute-row"><label><span>시</span><select value={hour12} onChange={(event) => update(period, Number(event.target.value), minute)}>{OPERATING_HOURS.map((hour) => <option key={hour} value={hour}>{hour}시</option>)}</select></label><div className="minute-buttons"><span>분</span><div>{MINUTE_OPTIONS.map((item) => <button key={item} type="button" className={minute === item ? "active" : ""} onClick={() => update(period, hour12, item)}>{item}분</button>)}</div></div></div><button type="button" className="time-picker-done" onClick={() => setOpen(false)}>선택 완료</button></div>}
  </div><style jsx>{`
    .operating-time-picker { display: grid; gap: 8px; }
    .time-display-button { width: 100%; min-height: 48px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 0 13px; border: 1px solid #d8dde2; border-radius: 9px; background: #fff; color: #202328; text-align: left; cursor: pointer; }
    .time-display-button.active { border-color: #202328; box-shadow: 0 0 0 2px rgba(32,35,40,.07); }
    .time-display-button span { color: #667085; font-size: 11px; font-weight: 800; }
    .time-display-button strong { text-align: right; font-size: 14px; }
    .time-display-button i { color: #98a2b3; font-style: normal; transition: transform .18s; }
    .time-display-button.active i { transform: rotate(180deg); }
    .time-picker-panel { display: grid; gap: 9px; padding: 11px; border: 1px solid #e1e5e9; border-radius: 10px; background: #fff; box-shadow: 0 8px 20px rgba(32,35,40,.08); }
    .hour-minute-row label > span, .minute-buttons > span { font-size: 11px; font-weight: 800; }
    .period-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
    .minute-buttons > div { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; }
    .period-buttons button, .minute-buttons button { height: 36px; border: 1px solid #d8dde2; border-radius: 8px; background: #fff; color: #667085; font-weight: 800; cursor: pointer; }
    .period-buttons button.active, .minute-buttons button.active { border-color: #202328; background: #202328; color: #fff; }
    .hour-minute-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 6px; }
    .hour-minute-row label, .minute-buttons { display: grid; gap: 5px; }
    .hour-minute-row select { width: 100%; height: 38px; padding: 0 8px; border: 1px solid #d8dde2; border-radius: 8px; background: #fff; box-sizing: border-box; font: inherit; }
    .time-picker-done { height: 36px; border: 0; border-radius: 8px; background: #202328; color: #fff; font-weight: 800; cursor: pointer; }
    @media (max-width: 700px) { .time-display-button { min-height: 42px; gap: 5px; padding: 0 8px; } .time-display-button span, .hour-minute-row label > span, .minute-buttons > span { font-size: 9px; } .time-display-button strong { font-size: 11px; } .period-buttons button, .minute-buttons button, .hour-minute-row select, .time-picker-done { font-size: 10px; } .time-picker-panel { padding: 8px; } }
  `}</style></>;
}

export function CenterSettingsPage({
  centerName,
  centerAddress,
  defaultClassDurationMinutes,
  classDurationOptions,
  operatingHours,
  classrooms,
  save,
  onCreateClassroom,
  onUpdateClassroom,
  back,
}: {
  centerName: string;
  centerAddress: string;
  defaultClassDurationMinutes: number;
  classDurationOptions: number[];
  operatingHours: OperatingHours;
  classrooms: ClassroomOption[];
  save: (name: string, address: string, defaultClassDurationMinutes: number, classDurationOptions: number[], operatingHours: OperatingHours) => void | Promise<void>;
  onCreateClassroom: (classroom: Omit<ClassroomOption, "id" | "status">) => Promise<void>;
  onUpdateClassroom: (classroom: ClassroomOption) => Promise<void>;
  back: () => void;
}) {
  const [name, setName] = useState(centerName);
  const [address, setAddress] = useState(centerAddress);
  const [classDuration, setClassDuration] = useState(defaultClassDurationMinutes);
  const [durationOptions, setDurationOptions] = useState<number[]>(() => {
    const initial = [...classDurationOptions, defaultClassDurationMinutes].filter((minutes, index, values) => Number.isInteger(minutes) && minutes > 0 && values.indexOf(minutes) === index);
    return initial.length ? initial.sort((a, b) => a - b) : [...DURATION_OPTIONS];
  });
  const [showDurationAdder, setShowDurationAdder] = useState(false);
  const [newDuration, setNewDuration] = useState("");
  const [hours, setHours] = useState<OperatingHours>(operatingHours);
  const [weekdayDefault, setWeekdayDefault] = useState(operatingHours._defaults?.weekday ?? { start: operatingHours.mon.start || "13:00", end: operatingHours.mon.end || "21:00" });
  const [weekendDefault, setWeekendDefault] = useState(operatingHours._defaults?.weekend ?? { start: operatingHours.sat.start || "10:00", end: operatingHours.sat.end || "18:00" });
  const [editingOperatingDays, setEditingOperatingDays] = useState<OperatingDayKey[]>(() => operatingHours._overrides ?? OPERATING_DAYS.filter(({ key }) => {
    const base = ["sat", "sun"].includes(key) ? operatingHours.sat : operatingHours.mon;
    return operatingHours[key].start !== base.start || operatingHours[key].end !== base.end;
  }).map(({ key }) => key));
  const [toast, setToast] = useState("");
  const [classroomName, setClassroomName] = useState("");
  const [classroomCapacity, setClassroomCapacity] = useState("");
  const [classroomSaving, setClassroomSaving] = useState(false);
  const [editingClassroom, setEditingClassroom] = useState<ClassroomOption | null>(null);
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2500);
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const invalidDay = OPERATING_DAYS.find(({ key }) => hours[key].isOpen && (!hours[key].start || !hours[key].end || hours[key].end <= hours[key].start));
    if (invalidDay) { notify(`${invalidDay.label}요일 운영 시작·종료 시간을 확인해주세요.`); return; }
    await save(name.trim(), address.trim(), classDuration, durationOptions, { ...hours, _defaults: { weekday: weekdayDefault, weekend: weekendDefault }, _overrides: editingOperatingDays });
    notify("센터 정보가 저장되어 화면에 적용되었습니다.");
  };
  const createClassroom = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const capacity = Number(classroomCapacity);
    if (!classroomName.trim() || capacity < 1) return;
    setClassroomSaving(true);
    try {
      await onCreateClassroom({ name: classroomName.trim(), capacity });
      setClassroomName(""); setClassroomCapacity(""); notify("강의실이 추가되었습니다.");
    } catch (error) { notify(error instanceof Error ? error.message : "강의실을 추가하지 못했습니다."); }
    finally { setClassroomSaving(false); }
  };
  const saveClassroom = async () => {
    if (!editingClassroom || !editingClassroom.name.trim() || editingClassroom.capacity < 1) return;
    setClassroomSaving(true);
    try { await onUpdateClassroom({ ...editingClassroom, name: editingClassroom.name.trim() }); setEditingClassroom(null); notify("강의실 정보가 수정되었습니다."); }
    catch (error) { notify(error instanceof Error ? error.message : "강의실을 수정하지 못했습니다."); }
    finally { setClassroomSaving(false); }
  };
  const addClassDuration = () => {
    const minutes = Number(newDuration);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 720) { notify("수업 시간은 1분부터 720분까지 입력할 수 있습니다."); return; }
    setDurationOptions((current) => current.includes(minutes) ? current : [...current, minutes].sort((a, b) => a - b));
    setClassDuration(minutes); setNewDuration(""); setShowDurationAdder(false);
  };
  const deleteClassDuration = () => {
    if (durationOptions.length <= 1) { notify("기본 수업 시간은 최소 1개 이상 필요합니다."); return; }
    const nextOptions = durationOptions.filter((minutes) => minutes !== classDuration);
    setDurationOptions(nextOptions);
    setClassDuration(nextOptions[0]);
    notify(`${classDuration}분 수업 시간을 삭제했습니다. 저장 버튼을 눌러 적용해주세요.`);
  };
  const updateGroupTime = (group: "weekday" | "weekend", field: "start" | "end", value: string) => {
    const keys: OperatingDayKey[] = group === "weekday" ? ["mon", "tue", "wed", "thu", "fri"] : ["sat", "sun"];
    const previous = group === "weekday" ? weekdayDefault : weekendDefault;
    const next = { ...previous, [field]: value };
    setHours((current) => {
      const updated = { ...current };
      keys.forEach((key) => {
        if (!editingOperatingDays.includes(key)) updated[key] = { ...updated[key], ...next };
      });
      return updated;
    });
    if (group === "weekday") setWeekdayDefault(next); else setWeekendDefault(next);
  };
  const resetDayToDefault = (key: OperatingDayKey) => {
    const base = ["sat", "sun"].includes(key) ? weekendDefault : weekdayDefault;
    setHours((current) => ({ ...current, [key]: { ...current[key], ...base } }));
    setEditingOperatingDays((current) => current.filter((item) => item !== key));
  };
  return (
    <main className="setting-register-page">
      <section className="setting-register-head">
        <span>센터 정보</span>
        <h1>센터 설정</h1>
        <p>센터 기본 정보를 입력하면 화면 상단에 센터 이름이 표시됩니다.</p>
      </section>
      <form className="setting-register-form center-setting-form" onSubmit={submit}>
        <section className="center-setting-block"><div className="center-info-grid"><label>
          <span>센터 이름</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="센터 이름을 입력해 주세요." required />
        </label><label>
          <span>센터 주소</span>
          <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="센터 주소를 입력해 주세요." required />
        </label></div></section>
        <section className="center-setting-block duration-setting-block">
          <div className="duration-setting-content">
            <div className="block-heading"><div><strong>기본 수업 시간</strong><small>새 클래스 등록 시 자동으로 적용되며 클래스별로 변경할 수 있습니다.</small></div></div>
            <div className="duration-buttons">
              {durationOptions.map((minutes) => <button key={minutes} type="button" className={classDuration === minutes ? "active" : ""} onClick={() => setClassDuration(minutes)}>{minutes}분</button>)}
            </div>
            {showDurationAdder && <div className="duration-adder"><label><span>추가할 수업 시간</span><input type="number" min="1" max="720" value={newDuration} onChange={(event) => setNewDuration(event.target.value)} placeholder="예: 70" /></label><button type="button" onClick={addClassDuration}>추가</button><button type="button" className="light" onClick={() => { setShowDurationAdder(false); setNewDuration(""); }}>취소</button></div>}
          </div>
          <div className="duration-actions">
            <button type="button" className="add-duration-button" onClick={() => setShowDurationAdder((current) => !current)}>+ 기본 수업 시간 추가</button>
            <button type="button" className="delete-duration-button" onClick={deleteClassDuration} disabled={durationOptions.length <= 1}>− 기본 수업 시간 삭제</button>
          </div>
        </section>
        <fieldset className="center-setting-block operating-hours-field"><legend>센터 운영 시간</legend><p>평일과 주말의 기본 시간을 설정하고, 다른 요일만 개별 수정할 수 있습니다.</p>
          <div className="operating-default-grid">
            <article><div><strong>평일 기본 운영 시간</strong><small>월요일~금요일 · 권장 시작 오후 1시</small></div><div className="operating-time-selects"><OperatingTimePicker label="시작 시간" value={weekdayDefault.start} onChange={(value) => updateGroupTime("weekday", "start", value)} /><b>~</b><OperatingTimePicker label="종료 시간" value={weekdayDefault.end} onChange={(value) => updateGroupTime("weekday", "end", value)} /></div></article>
            <article><div><strong>주말 기본 운영 시간</strong><small>토요일·일요일의 공통 운영 시간</small></div><div className="operating-time-selects"><OperatingTimePicker label="시작 시간" value={weekendDefault.start} onChange={(value) => updateGroupTime("weekend", "start", value)} /><b>~</b><OperatingTimePicker label="종료 시간" value={weekendDefault.end} onChange={(value) => updateGroupTime("weekend", "end", value)} /></div></article>
          </div>
          <div className="operating-hours-list">
            {OPERATING_DAYS.map(({ key, label }) => {
              const isEditing = editingOperatingDays.includes(key);
              const baseLabel = ["sat", "sun"].includes(key) ? "주말 기본 적용" : "평일 기본 적용";
              return <div key={key} className={`operating-hours-row ${hours[key].isOpen ? "" : "closed"}`}>
                <div className="operating-day-head"><strong>{label}요일</strong><button type="button" role="switch" aria-checked={hours[key].isOpen} className={`operation-toggle ${hours[key].isOpen ? "active" : ""}`} onClick={() => setHours((current) => ({ ...current, [key]: { ...current[key], isOpen: !current[key].isOpen } }))}><i aria-hidden="true" /><span>{hours[key].isOpen ? "운영" : "휴무"}</span></button></div>
                <div className="operating-day-summary"><span className={isEditing ? "custom" : ""}>{isEditing ? "개별 설정" : baseLabel}</span><strong>{hours[key].isOpen ? `${formatKoreanTime(hours[key].start)} ~ ${formatKoreanTime(hours[key].end)}` : "운영하지 않음"}</strong><button type="button" onClick={() => isEditing ? resetDayToDefault(key) : setEditingOperatingDays((current) => [...current, key])}>{isEditing ? "기본으로 되돌리기" : "개별 수정"}</button></div>
                {hours[key].isOpen && isEditing && <div className="operating-time-selects day-custom-time"><OperatingTimePicker label="시작 시간" value={hours[key].start} onChange={(value) => setHours((current) => ({ ...current, [key]: { ...current[key], start: value } }))} /><b>~</b><OperatingTimePicker label="종료 시간" value={hours[key].end} onChange={(value) => setHours((current) => ({ ...current, [key]: { ...current[key], end: value } }))} /></div>}
              </div>;
            })}
          </div>
        </fieldset>
        <button type="submit">센터 설정 저장</button>
      </form>
      <section className="classroom-management-section">
        <div className="classroom-section-heading"><div><span>공간 관리</span><h2>강의실 관리</h2><p>등록된 강의실은 클래스의 수업 장소로 연결됩니다.</p></div><strong>총 {classrooms.length}개</strong></div>
        <form className="classroom-create-form" onSubmit={createClassroom}>
          <label><span>강의실명</span><input value={classroomName} onChange={(event) => setClassroomName(event.target.value)} placeholder="예: A 강의실" required /></label>
          <label><span>수용 인원</span><input type="number" min="1" value={classroomCapacity} onChange={(event) => setClassroomCapacity(event.target.value)} placeholder="예: 12" required /></label>
          <button type="submit" disabled={classroomSaving}>{classroomSaving ? "저장 중..." : "강의실 추가"}</button>
        </form>
        {!classrooms.length ? <p className="empty-state">등록된 강의실이 없습니다.</p> : <div className="classroom-list">
          {classrooms.map((room) => <article key={room.id} className={room.status === "inactive" ? "inactive" : ""}>
            {editingClassroom?.id === room.id ? <>
              <input aria-label="강의실명 수정" value={editingClassroom.name} onChange={(event) => setEditingClassroom({ ...editingClassroom, name: event.target.value })} />
              <input aria-label="수용 인원 수정" type="number" min="1" value={editingClassroom.capacity} onChange={(event) => setEditingClassroom({ ...editingClassroom, capacity: Number(event.target.value) })} />
              <div><button type="button" onClick={() => void saveClassroom()} disabled={classroomSaving}>저장</button><button type="button" className="light" onClick={() => setEditingClassroom(null)}>취소</button></div>
            </> : <>
              <div><strong>{room.name}</strong><span>최대 {room.capacity}명 · {room.status === "active" ? "사용 중" : "사용 중지"}</span></div>
              <div><button type="button" className="light" onClick={() => setEditingClassroom({ ...room })}>수정</button><button type="button" className="light" onClick={() => void onUpdateClassroom({ ...room, status: room.status === "active" ? "inactive" : "active" })}>{room.status === "active" ? "사용 중지" : "다시 사용"}</button></div>
            </>}
          </article>)}
        </div>}
      </section>
      {toast && <div className="toast-message" role="status">✓ {toast}</div>}
      <style jsx>{`
        .center-setting-form { width: min(1180px, calc(100% - 48px)); margin-left: auto; margin-right: auto; display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
        .center-setting-block { min-width: 0; margin: 0; padding: 20px; border: 1px solid #e1e5e9; border-radius: 15px; background: #fff; box-sizing: border-box; }
        .center-info-grid { display: grid; grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr); gap: 12px; }
        .center-info-grid label { display: grid; gap: 7px; }
        .center-info-grid label > span { font-size: 12px; font-weight: 800; }
        .block-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 15px; }
        .block-heading > div { display: grid; gap: 5px; }
        .block-heading strong { font-size: 14px; }
        .block-heading small { color: #667085; font-size: 12px; }
        .duration-setting-block { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 24px; }
        .duration-setting-content { min-width: 0; display: grid; gap: 13px; }
        .duration-setting-content .block-heading { margin: 0; }
        .duration-actions { display: grid; gap: 8px; min-width: 178px; }
        .add-duration-button { min-height: 38px; padding: 0 12px; border: 1px solid #202328; border-radius: 9px; background: #fff; color: #202328; font-weight: 800; cursor: pointer; }
        .delete-duration-button { min-height: 38px; padding: 0 12px; border: 1px solid #f0c8c8; border-radius: 9px; background: #fff7f7; color: #b42318; font-weight: 800; cursor: pointer; }
        .delete-duration-button:disabled { border-color: #e4e7ec; background: #f5f6f7; color: #98a2b3; cursor: not-allowed; }
        .duration-buttons { display: flex; flex-wrap: wrap; gap: 7px; }
        .duration-buttons button { min-width: 64px; height: 40px; padding: 0 12px; border: 1px solid #d8dde2; border-radius: 9px; background: #fff; color: #475467; font-weight: 800; cursor: pointer; }
        .duration-buttons button.active { border-color: #202328; background: #202328; color: #fff; }
        .duration-adder { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: end; gap: 8px; margin-top: 14px; padding: 13px; border-radius: 11px; background: #f6f7f8; }
        .duration-adder label { display: grid; gap: 6px; }
        .duration-adder label span { font-size: 11px; font-weight: 800; }
        .duration-adder input { width: 100%; height: 40px; padding: 0 10px; border: 1px solid #d8dde2; border-radius: 8px; box-sizing: border-box; font: inherit; }
        .duration-adder button { height: 40px; padding: 0 13px; border: 0; border-radius: 8px; background: #202328; color: #fff; font-weight: 800; cursor: pointer; }
        .duration-adder button.light { border: 1px solid #d8dde2; background: #fff; color: #202328; }
        .operating-hours-field { min-width: 0; }
        .operating-hours-field > legend { font-size: 13px; font-weight: 800; }
        .operating-hours-field > p { margin: 5px 0 12px; color: #667085; font-size: 12px; }
        .operating-default-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
        .operating-default-grid article { min-width: 0; padding: 14px; border: 1px solid #d8dde2; border-radius: 12px; background: #fff; }
        .operating-default-grid article > div:first-child { display: grid; gap: 4px; margin-bottom: 12px; }
        .operating-default-grid article strong { font-size: 13px; }
        .operating-default-grid article small { color: #667085; font-size: 11px; }
        .operating-hours-list { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
        .operating-hours-row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; padding: 14px; border: 1px solid #e1e5e9; border-radius: 11px; background: #f8f9fa; }
        .operating-hours-row.closed { background: #f3f4f5; }
        .operating-day-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .operating-day-head > strong { color: #202328; font-size: 14px; }
        .operating-day-summary { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; }
        .operating-day-summary > span { padding: 5px 8px; border-radius: 20px; background: #eef1f4; color: #667085; font-size: 10px; font-weight: 800; }
        .operating-day-summary > span.custom { background: #fff2cc; color: #8a6100; }
        .operating-day-summary > strong { font-size: 13px; }
        .operating-day-summary > button { border: 0; background: transparent; color: #475467; font-size: 11px; font-weight: 800; text-decoration: underline; cursor: pointer; }
        .operation-toggle { display: flex; align-items: center; gap: 7px; padding: 0; border: 0; background: transparent; color: #98a2b3; font-weight: 800; cursor: pointer; }
        .operation-toggle i { position: relative; width: 38px; height: 22px; border-radius: 20px; background: #cfd4da; transition: .18s; }
        .operation-toggle i::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.18); transition: .18s; }
        .operation-toggle.active { color: #202328; }
        .operation-toggle.active i { background: #202328; }
        .operation-toggle.active i::after { transform: translateX(16px); }
        .operating-time-selects { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: start; gap: 10px; min-width: 0; padding-top: 12px; border-top: 1px solid #e1e5e9; }
        .operating-default-grid .operating-time-selects { padding-top: 0; border-top: 0; }
        .operating-time-selects > b { align-self: center; color: #667085; }
        .classroom-management-section { width: min(760px, calc(100% - 48px)); margin: 32px auto 0; padding: 26px; border: 1px solid #e2e6ea; border-radius: 18px; background: #fff; box-sizing: border-box; }
        .classroom-section-heading { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
        .classroom-section-heading span { color: #667085; font-size: 12px; font-weight: 800; }
        .classroom-section-heading h2 { margin: 5px 0; font-size: 23px; }
        .classroom-section-heading p { margin: 0; color: #667085; font-size: 13px; }
        .classroom-section-heading > strong { align-self: flex-start; padding: 7px 10px; border-radius: 20px; background: #f1f3f5; font-size: 12px; }
        .classroom-create-form { display: grid; grid-template-columns: minmax(0, 1fr) 140px 130px; align-items: end; gap: 10px; padding: 16px; border-radius: 14px; background: #f7f8f9; }
        .classroom-create-form label { display: grid; gap: 7px; }
        .classroom-create-form span { font-size: 12px; font-weight: 800; }
        .classroom-create-form input, .classroom-list input { min-width: 0; height: 43px; padding: 0 12px; border: 1px solid #d8dde2; border-radius: 9px; box-sizing: border-box; font: inherit; }
        .classroom-create-form button, .classroom-list button { height: 43px; padding: 0 14px; border: 0; border-radius: 9px; background: #202328; color: #fff; font-weight: 800; cursor: pointer; }
        .classroom-list { display: grid; gap: 9px; margin-top: 16px; }
        .classroom-list article { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 15px 16px; border: 1px solid #e3e7eb; border-radius: 12px; }
        .classroom-list article.inactive { opacity: .58; background: #f5f5f5; }
        .classroom-list article > div:first-child { display: grid; gap: 4px; }
        .classroom-list article span { color: #667085; font-size: 12px; }
        .classroom-list article > div:last-child { display: flex; gap: 7px; }
        .classroom-list button.light { border: 1px solid #d8dde2; background: #fff; color: #202328; }
        .classroom-list article:has(input) { grid-template-columns: minmax(0, 1fr) 120px auto; }
        @media (max-width: 700px) {
          .center-setting-form { width: calc(100% - 28px); gap: 11px; }
          .center-setting-block { padding: 14px; font-size: 12px; }
          .center-info-grid { grid-template-columns: 1fr; gap: 10px; }
          .center-info-grid label > span, .operating-hours-field > legend { font-size: 11px; }
          .center-info-grid input { font-size: 12px; }
          .duration-setting-block { grid-template-columns: 1fr; gap: 12px; }
          .duration-actions { min-width: 0; }
          .block-heading strong { font-size: 12px; }
          .block-heading small, .operating-hours-field > p { font-size: 10px; }
          .add-duration-button, .delete-duration-button, .duration-buttons button, .duration-adder button { font-size: 11px; }
          .duration-buttons { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 3px; }
          .duration-buttons button { flex: 0 0 auto; }
          .duration-adder { grid-template-columns: 1fr 1fr; }
          .duration-adder label { grid-column: 1 / -1; }
          .operating-hours-list { grid-template-columns: minmax(0, 1fr); }
          .operating-default-grid { grid-template-columns: 1fr; }
          .operating-hours-row { grid-template-columns: minmax(0, 1fr); gap: 8px; padding: 10px; }
          .operating-day-head { gap: 5px; }
          .operating-day-head > strong, .operation-toggle { font-size: 10px; }
          .operation-toggle { gap: 4px; }
          .operation-toggle i { width: 30px; height: 18px; }
          .operation-toggle i::after { top: 3px; left: 3px; width: 12px; height: 12px; }
          .operation-toggle.active i::after { transform: translateX(12px); }
          .operating-time-selects { gap: 5px; padding-top: 8px; }
          .operating-day-summary { grid-template-columns: auto minmax(0, 1fr); }
          .operating-day-summary > button { grid-column: 1 / -1; justify-self: start; padding: 2px 0; }
          .classroom-management-section { width: calc(100% - 28px); padding: 20px 16px; }
          .classroom-create-form { grid-template-columns: 1fr; }
          .classroom-list article, .classroom-list article:has(input) { grid-template-columns: 1fr; }
        }
      `}</style>
    </main>
  );
}

export type SettingRegistrationView = "vehicle-register" | "driver-register";

export type RegisteredManager = {
  id: string;
  userId?: string;
  name: string;
  phone: string;
  roles: string[];
  username?: string;
  status?: "권한 설정 대기" | "사용 중" | "비활성";
};

export function ManagerManagementPage({
  centerId,
  registeredManagers,
  onUpdateManager,
}: {
  centerId: string;
  registeredManagers: RegisteredManager[];
  onUpdateManager: (manager: RegisteredManager) => Promise<void>;
}) {
  const [inviteLink, setInviteLink] = useState("");
  const [selectedId, setSelectedId] = useState(registeredManagers[0]?.id ?? "");
  const [toast, setToast] = useState("");
  const selected = registeredManagers.find((manager) => manager.id === selectedId);
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2500);
  };
  const createInvite = async () => {
    const { data, error } = await supabase.rpc("create_center_invitation", {
      p_center_id: centerId,
      p_email: null,
    });
    if (error || !data) {
      notify(error?.message ?? "초대 링크를 만들지 못했습니다.");
      return;
    }
    setInviteLink(`${window.location.origin}/?invite=${data}`);
    notify("새 초대 링크가 생성되었습니다.");
  };
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      notify("초대 링크가 복사되었습니다.");
    } catch {
      notify("링크를 길게 눌러 복사해 주세요.");
    }
  };
  const toggleRole = async (role: string) => {
    if (!selected) return;
    const roles = selected.roles.includes(role)
      ? selected.roles.filter((item) => item !== role)
      : [...selected.roles, role];
    await onUpdateManager({ ...selected, roles, status: roles.length ? "사용 중" : "권한 설정 대기" });
  };
  return (
    <main className="setting-register-page manager-management-page">
      <section className="setting-register-head">
        <span>계정 및 권한</span>
        <h1>담당자 및 권한 관리</h1>
        <p>담당자가 직접 가입한 뒤 센터 운영자가 필요한 권한을 설정합니다.</p>
      </section>

      <section className="manager-invite-card">
        <div><b>1</b><span><strong>담당자 초대</strong><small>초대 링크를 카톡이나 문자로 전달하세요.</small></span></div>
        {!inviteLink ? (
          <button type="button" onClick={() => void createInvite()}>초대 링크 생성</button>
        ) : (
          <div className="invite-link-result">
            <input aria-label="담당자 초대 링크" value={inviteLink} readOnly />
            <button type="button" onClick={copyInvite}>링크 복사</button>
            <button className="light" type="button" onClick={() => void createInvite()}>새로 발급</button>
          </div>
        )}
        <p>링크를 받은 담당자는 별도의 가입 페이지에서 이름·연락처·아이디·비밀번호를 직접 입력합니다.</p>
      </section>

      <section className="manager-account-section">
        <div className="manager-section-title"><b>2</b><span><h2>가입 계정 및 권한 설정</h2><p>가입을 완료한 담당자에게 권한을 부여합니다.</p></span></div>
        <div className="manager-account-layout">
          <div className="manager-account-list" aria-label="가입한 담당자 목록">
            {!registeredManagers.length && <p className="empty-state">가입한 담당자가 없습니다.</p>}
            {registeredManagers.map((manager) => {
              const status = manager.status ?? (manager.roles.length ? "사용 중" : "권한 설정 대기");
              return <button type="button" key={manager.id} className={selectedId === manager.id ? "selected" : ""} onClick={() => setSelectedId(manager.id)}>
                <span><strong>{manager.name}</strong><small>{manager.username ? `@${manager.username}` : manager.phone}</small></span>
                <em className={status === "권한 설정 대기" ? "pending" : ""}>{status}</em>
              </button>;
            })}
          </div>
          {selected && <article className="manager-permission-panel">
            <header><span><strong>{selected.name}</strong><small>{selected.phone}</small></span><em>{selected.roles.length}개 권한</em></header>
            <fieldset className="manager-role-fieldset">
              <legend>담당 권한 <small>중복 선택 가능</small></legend>
              <div className="manager-role-options">
                {["운영자", "담당 선생님", "동승자", "차량 기사"].map((role) => {
                  const active = selected.roles.includes(role);
                  return <button key={role} type="button" className={active ? "selected" : ""} aria-pressed={active} onClick={() => toggleRole(role)}><span aria-hidden="true">{active ? "✓" : ""}</span>{role}</button>;
                })}
              </div>
            </fieldset>
            {selected.roles.includes("운영자") && <p className="operator-warning">운영자는 센터 설정과 담당자 권한을 변경할 수 있습니다.</p>}
          </article>}
        </div>
      </section>
      {toast && <div className="toast-message" role="status">✓ {toast}</div>}
    </main>
  );
}
export function SettingRegistrationPage({
  view,
  back,
  vehicles,
  onRegisterVehicle,
}: {
  view: SettingRegistrationView;
  back: () => void;
  vehicles: VehicleOption[];
  onRegisterVehicle: (vehicle: Omit<VehicleOption, "id">) => Promise<void>;
}) {
  const [toast, setToast] = useState("");
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const content = {
    "vehicle-register": {
      label: "차량",
      title: "차량 등록",
      description: "운행에 사용할 차량의 기본 정보를 등록합니다.",
      fields: [
        ["차량명", "예: 1호차", "text"],
        ["차량 번호", "예: 12가 3456", "text"],
        ["차종", "예: 스타리아", "text"],
        ["승차 정원", "승차 정원을 입력해 주세요.", "number"],
      ],
    },
    "driver-register": {
      label: "기사",
      title: "기사 등록",
      description: "운행 기사님의 기본 정보와 담당 차량을 등록합니다.",
      fields: [
        ["기사님 이름", "이름을 입력해 주세요.", "text"],
        ["연락처", "010-0000-0000", "tel"],
        ["담당 차량", "예: 1호차", "text"],
        ["면허 정보", "예: 1종 대형", "text"],
      ],
    },
  } satisfies Record<
    SettingRegistrationView,
    {
      label: string;
      title: string;
      description: string;
      fields: string[][];
    }
  >;
  const selectedContent = content[view];

  useEffect(() => {
    if (!showVehicleModal) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setShowVehicleModal(false); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [showVehicleModal]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    try {
      if (view === "vehicle-register") {
        await onRegisterVehicle({
          name: String(form.get("차량명") ?? "").trim(),
          number: String(form.get("차량 번호") ?? "").trim(),
          model: String(form.get("차종") ?? "").trim(),
          capacity: Number(form.get("승차 정원") ?? 0),
        });
      }
      setToast(`${selectedContent.label} 정보가 등록되었습니다.`);
      event.currentTarget.reset();
      if (view === "vehicle-register") setShowVehicleModal(false);
    } catch (error) {
      setToast(error instanceof Error ? error.message : `${selectedContent.label} 정보를 등록하지 못했습니다.`);
    } finally {
      setSubmitting(false);
    }
    window.setTimeout(() => setToast(""), 2500);
  };

  if (view === "vehicle-register") return (
    <main className="setting-register-page vehicle-management-page">
      <button className="back" type="button" onClick={back}>
        <Icon name="back" />
        센터 관리로
      </button>
      <section className="setting-register-head vehicle-management-head">
        <div><span>차량 정보</span><h1>차량 관리</h1><p>센터에서 운행하는 차량 정보를 확인하고 등록합니다.</p></div>
        <button className="vehicle-create-trigger" type="button" onClick={() => setShowVehicleModal(true)}>+ 차량 등록</button>
      </section>

      <section className="registered-vehicle-section">
        <header><div><h2>등록된 차량</h2><p>총 {vehicles.length}대의 차량이 등록되어 있습니다.</p></div></header>
        {!vehicles.length ? <div className="vehicle-empty-state"><strong>등록된 차량이 없습니다.</strong><p>첫 차량을 등록하면 운행 회차에 배정할 수 있습니다.</p><button type="button" onClick={() => setShowVehicleModal(true)}>첫 차량 등록하기</button></div> : <div className="registered-vehicle-grid">
          {vehicles.map((vehicle) => <article className="registered-vehicle-card" key={vehicle.id}>
            <header><span aria-hidden="true">차</span><div><strong>{vehicle.name}</strong><small>{vehicle.number || "차량 번호 미등록"}</small></div></header>
            <dl><div><dt>차종</dt><dd>{vehicle.model || "미등록"}</dd></div><div><dt>승차 정원</dt><dd>{vehicle.capacity ? `${vehicle.capacity}명` : "미등록"}</dd></div></dl>
          </article>)}
        </div>}
      </section>

      {showVehicleModal && <div className="vehicle-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowVehicleModal(false); }}>
        <section className="vehicle-register-modal" role="dialog" aria-modal="true" aria-labelledby="vehicle-register-title">
          <header><div><small>차량 정보</small><h2 id="vehicle-register-title">차량 등록</h2><p>운행에 사용할 차량의 기본 정보를 입력해주세요.</p></div><button type="button" onClick={() => setShowVehicleModal(false)} aria-label="닫기">×</button></header>
          <form className="setting-register-form" onSubmit={submit}>
            {selectedContent.fields.map(([label, placeholder, type]) => <label key={label}><span>{label}</span><input name={label} type={type} placeholder={placeholder} min={type === "number" ? "1" : undefined} required /></label>)}
            <div className="vehicle-modal-actions"><button type="button" onClick={() => setShowVehicleModal(false)}>취소</button><button className="confirm" type="submit" disabled={submitting}>{submitting ? "등록 중..." : "차량 등록 완료"}</button></div>
          </form>
        </section>
      </div>}
      {toast && <div className="toast-message" role="status">✓ {toast}</div>}
      <style>{`
        .vehicle-management-page{width:min(1120px,calc(100% - 48px));margin:0 auto;padding:36px 0 110px}
        .vehicle-management-head{display:flex;align-items:flex-end;justify-content:space-between;gap:24px}
        .vehicle-management-head>div>span{display:inline-flex;padding:7px 12px;border-radius:999px;background:#eef0f2;font-size:12px;font-weight:800}
        .vehicle-create-trigger{height:46px;padding:0 20px;border:0;border-radius:11px;background:#202328;color:#fff;font-weight:800;cursor:pointer}
        .registered-vehicle-section{margin-top:28px;padding:24px;border:1px solid #dde1e5;border-radius:18px;background:#fff}
        .registered-vehicle-section>header h2{margin:0;font-size:20px}.registered-vehicle-section>header p{margin:6px 0 0;color:#767d85;font-size:13px}
        .registered-vehicle-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:20px}
        .registered-vehicle-card{min-width:0;padding:19px;border:1px solid #e0e3e6;border-radius:15px;background:#fbfbfc}
        .registered-vehicle-card>header{display:flex;align-items:center;gap:12px}.registered-vehicle-card>header>span{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:#202328;color:#fff;font-size:11px;font-weight:900}
        .registered-vehicle-card>header div{min-width:0;display:grid;gap:4px}.registered-vehicle-card>header strong{font-size:16px}.registered-vehicle-card>header small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#697078}
        .registered-vehicle-card dl{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:18px 0 0}.registered-vehicle-card dl div{padding:11px;border-radius:10px;background:#fff}.registered-vehicle-card dt{font-size:10px;color:#888f96}.registered-vehicle-card dd{margin:5px 0 0;font-size:13px;font-weight:800}
        .vehicle-empty-state{display:grid;justify-items:center;gap:8px;margin-top:20px;padding:48px 20px;border:1px dashed #cfd4d9;border-radius:14px;text-align:center}.vehicle-empty-state p{margin:0;color:#747b83;font-size:13px}.vehicle-empty-state button{margin-top:8px;padding:11px 16px;border:0;border-radius:9px;background:#202328;color:#fff;font-weight:800}
        .vehicle-modal-backdrop{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:20px;background:rgba(18,22,26,.48)}
        .vehicle-register-modal{width:min(620px,100%);max-height:calc(100vh - 40px);overflow:auto;border-radius:20px;background:#fff;box-shadow:0 24px 80px rgba(0,0,0,.22)}
        .vehicle-register-modal>header{display:flex;justify-content:space-between;gap:20px;padding:24px 26px 18px;border-bottom:1px solid #eceef0}.vehicle-register-modal>header small{font-weight:800;color:#747b83}.vehicle-register-modal>header h2{margin:6px 0;font-size:24px}.vehicle-register-modal>header p{margin:0;color:#747b83;font-size:13px}.vehicle-register-modal>header>button{width:38px;height:38px;border:1px solid #dce0e4;border-radius:10px;background:#fff;font-size:22px;cursor:pointer}
        .vehicle-register-modal .setting-register-form{width:auto;margin:0;padding:24px 26px;box-shadow:none;border:0}.vehicle-modal-actions{grid-column:1/-1;display:grid;grid-template-columns:1fr 2fr;gap:10px}.vehicle-modal-actions button{height:48px;border:1px solid #d8dde2;border-radius:11px;background:#fff;font-weight:800}.vehicle-modal-actions .confirm{border-color:#202328;background:#202328;color:#fff}.vehicle-modal-actions .confirm:disabled{opacity:.55}
        @media(max-width:900px){.registered-vehicle-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:600px){.vehicle-management-page{width:calc(100% - 28px);padding-top:24px}.vehicle-management-head{align-items:stretch}.vehicle-management-head h1{font-size:25px}.vehicle-create-trigger{flex:0 0 auto;padding:0 14px;font-size:12px}.registered-vehicle-section{padding:16px}.registered-vehicle-grid{grid-template-columns:1fr}.registered-vehicle-card{padding:16px}.vehicle-register-modal>header{padding:20px}.vehicle-register-modal .setting-register-form{padding:20px}.vehicle-modal-actions{grid-template-columns:1fr 1.7fr}}
      `}</style>
    </main>
  );

  return (
    <main className="setting-register-page">
      <button className="back" type="button" onClick={back}>
        <Icon name="back" />
        설정으로
      </button>
      <section className="setting-register-head">
        <span>{selectedContent.label} 정보</span>
        <h1>{selectedContent.title}</h1>
        <p>{selectedContent.description}</p>
      </section>
      <form className="setting-register-form" onSubmit={submit}>
        {selectedContent.fields.map(([label, placeholder, type]) => (
          <label key={label}>
            <span>{label}</span>
            <input
              name={label}
              type={type}
              placeholder={placeholder}
              required
            />
          </label>
        ))}
        <button type="submit">{selectedContent.title} 완료</button>
      </form>
      {toast && <div className="toast-message" role="status">✓ {toast}</div>}
    </main>
  );
}
