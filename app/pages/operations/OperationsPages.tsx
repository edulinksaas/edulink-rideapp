"use client";

import { useEffect, useState } from "react";
import { Icon } from "../../components/common/Icon";
import { MinuteClockPicker } from "../../components/common/MinuteClockPicker";
import { supabase } from "../../../src/lib/supabase";
import type { ClassOption } from "../../types/class";
import type { Student } from "../../types/student";
import type { VehicleOption } from "../../types/vehicle";
import type { ClassroomOption } from "../../types/classroom";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
export const pad = (value: number) => String(value).padStart(2, "0");

type CenterTimetableRun = {
  id: string;
  name: string;
  days: number[];
  vehicleId: string;
  startTime: string;
  endTime: string;
  driverMemberId: string;
  companionMemberId: string;
};

type CenterTimetableOperatingHours = Record<"sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat", { isOpen: boolean; start: string; end: string }>;

export function CenterTimetablePage({ centerId, classes, students, classrooms, vehicles, managers, operatingHours, onCreateClass, onUpdateClass, onDeleteClass, back }: {
  centerId: string;
  classes: ClassOption[];
  students: Student[];
  classrooms: ClassroomOption[];
  vehicles: VehicleOption[];
  managers: Array<{ id: string; name: string }>;
  operatingHours: CenterTimetableOperatingHours;
  onCreateClass: (classItem: Omit<ClassOption, "id" | "status">) => Promise<void>;
  onUpdateClass: (classItem: ClassOption) => Promise<void>;
  onDeleteClass: (classItem: ClassOption) => Promise<void>;
  back: () => void;
}) {
  const [selectedDay, setSelectedDay] = useState(() => new Date().getDay());
  const [timetableMode, setTimetableMode] = useState<"class" | "vehicle">("class");
  const [venue, setVenue] = useState("all");
  const [runs, setRuns] = useState<CenterTimetableRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const [noticeTitle, setNoticeTitle] = useState("안내");
  const [saving, setSaving] = useState(false);
  const [classDraft, setClassDraft] = useState<null | { id?: string; name: string; day: string; startTime: string; endTime: string; classroomId: string; status?: "active" | "inactive" }>(null);
  const [runDraft, setRunDraft] = useState<null | { id?: string; days: number[]; vehicleId: string; startTime: string; endTime: string; driverMemberId: string; companionMemberId: string; status?: "active" | "inactive" }>(null);
  useEffect(() => {
    let active = true;
    const loadRuns = async () => {
      if (!centerId) { setRuns([]); setLoading(false); return; }
      setLoading(true); setErrorMessage("");
      const { data, error } = await supabase.from("vehicle_runs")
        .select("id,name,days,vehicle_id,scheduled_start,scheduled_end,driver_member_id,companion_member_id")
        .eq("center_id", centerId).eq("status", "active").order("scheduled_start");
      if (!active) return;
      if (error) { setErrorMessage(error.message); setRuns([]); }
      else setRuns((data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        days: row.days ?? [],
        vehicleId: row.vehicle_id,
        startTime: row.scheduled_start?.slice(0, 5) ?? "",
        endTime: row.scheduled_end?.slice(0, 5) ?? "",
        driverMemberId: row.driver_member_id ?? "",
        companionMemberId: row.companion_member_id ?? "",
      })));
      setLoading(false);
    };
    void loadRuns();
    return () => { active = false; };
  }, [centerId]);
  const reloadRuns = async () => {
    if (!centerId) return;
    const { data, error } = await supabase.from("vehicle_runs")
      .select("id,name,days,vehicle_id,scheduled_start,scheduled_end,driver_member_id,companion_member_id,status")
      .eq("center_id", centerId).eq("status", "active").order("scheduled_start");
    if (error) throw new Error(error.message);
    setRuns((data ?? []).map((row) => ({ id: row.id, name: row.name, days: row.days ?? [], vehicleId: row.vehicle_id, startTime: row.scheduled_start?.slice(0, 5) ?? "", endTime: row.scheduled_end?.slice(0, 5) ?? "", driverMemberId: row.driver_member_id ?? "", companionMemberId: row.companion_member_id ?? "" })));
  };
  const selectedLabel = weekdays[selectedDay];
  const dayClasses = classes.filter((item) => item.status !== "inactive" && item.days.includes(selectedLabel))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const dayRuns = runs.filter((run) => run.days.includes(selectedDay))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const operatingDayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  const selectedOperatingHours = operatingHours[operatingDayKeys[selectedDay]];
  const runTimeToMinutes = (time: string) => {
    const [hour, minute] = time.split(":").map(Number);
    return hour * 60 + minute;
  };
  const buildTimetableSlots = (items: Array<{ startTime: string; endTime: string }>, includeItemBoundaries = true) => {
    if (!selectedOperatingHours?.isOpen) return [];
    const start = runTimeToMinutes(selectedOperatingHours.start);
    const end = runTimeToMinutes(selectedOperatingHours.end);
    const formatTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    const boundaries = new Set<number>([start, end]);
    for (let minute = start; minute < end; minute += 60) boundaries.add(minute);
    if (includeItemBoundaries) items.forEach((item) => {
      const itemStart = Math.max(start, runTimeToMinutes(item.startTime));
      const itemEnd = Math.min(end, runTimeToMinutes(item.endTime));
      const duration = itemEnd - itemStart;
      if (duration <= 0 || (duration % 60 === 0 && (itemStart - start) % 60 === 0)) return;
      boundaries.add(itemStart);
      boundaries.add(itemEnd);
      for (let minute = itemStart + 30; minute < itemEnd; minute += 30) boundaries.add(minute);
    });
    const sortedBoundaries = Array.from(boundaries).filter((minute) => minute >= start && minute <= end).sort((a, b) => a - b);
    return sortedBoundaries.slice(0, -1).map((slotStart, index) => ({ startTime: formatTime(slotStart), endTime: formatTime(sortedBoundaries[index + 1]) }));
  };
  const classTimetableSlots = buildTimetableSlots([], false);
  const vehicleTimetableSlots = buildTimetableSlots(dayRuns);
  const activeClassrooms = classrooms.filter(
    (room) => room.status === "active" && room.name.trim().length > 0,
  );
  const classroomNames = Array.from(
    new Set(activeClassrooms.map((room) => room.name.trim())),
  );
  const scheduleVenues = venue === "all" || !classroomNames.includes(venue)
    ? classroomNames
    : [venue];
  const getClassStudents = (classItem: ClassOption) => students.filter((student) => {
    const linkedClassIds = (student as Student & { classIds?: string[] }).classIds;
    return linkedClassIds?.length ? linkedClassIds.includes(classItem.id) : student.classId ? student.classId === classItem.id : student.className === classItem.name;
  });
  const getClassTeacherNames = (classItem: ClassOption) => {
    const teacherIds = Array.from(new Set(getClassStudents(classItem).map((student) => student.teacherMemberId).filter(Boolean))) as string[];
    const teacherNames = teacherIds.map((teacherId) => managers.find((manager) => manager.id === teacherId)?.name).filter(Boolean) as string[];
    return teacherNames.length ? teacherNames.join(", ") : "담당 선생님 미배정";
  };
  const getClassroomName = (classItem: ClassOption) => activeClassrooms
    .find((room) => room.id === classItem.classroomId)
    ?.name.trim() ?? "";
  const openNewClass = (day: string, startTime: string, endTime: string, roomName: string) => {
    const room = classrooms.find((item) => item.name === roomName);
    setClassDraft({ name: "", day, startTime, endTime, classroomId: room?.id ?? "" });
  };
  const openClass = (item: ClassOption) => setClassDraft({ id: item.id, name: item.name, day: selectedLabel, startTime: item.startTime, endTime: item.endTime, classroomId: item.classroomId ?? "", status: item.status });
  const openNewRun = (day: number, startTime: string, endTime: string, vehicleId: string) => setRunDraft({ days: [day], startTime, endTime, vehicleId, driverMemberId: "", companionMemberId: "" });
  const openRun = (item: CenterTimetableRun) => setRunDraft({ id: item.id, days: item.days, vehicleId: item.vehicleId, startTime: item.startTime, endTime: item.endTime, driverMemberId: item.driverMemberId, companionMemberId: item.companionMemberId, status: "active" });
  const saveClassDraft = async () => {
    if (!classDraft?.name.trim() || !classDraft.classroomId || !classDraft.startTime || !classDraft.endTime || classDraft.endTime <= classDraft.startTime) { setErrorMessage("클래스 이름, 강의실, 수업 시간을 확인해주세요."); return; }
    const draftDayIndex = weekdays.indexOf(classDraft.day);
    const draftOperatingHours = operatingHours[operatingDayKeys[draftDayIndex < 0 ? selectedDay : draftDayIndex]];
    if (!draftOperatingHours?.isOpen || classDraft.startTime < draftOperatingHours.start || classDraft.endTime > draftOperatingHours.end) { setErrorMessage(`${classDraft.day}요일 센터 운영 시간(${draftOperatingHours?.start ?? "-"}~${draftOperatingHours?.end ?? "-"}) 안에서 선택해주세요.`); return; }
    const draftRoomName = classrooms.find((item) => item.id === classDraft.classroomId)?.name;
    const overlappingClass = classes.find((item) => item.id !== classDraft.id && item.status !== "inactive" && (item.classroomId === classDraft.classroomId || Boolean(draftRoomName && getClassroomName(item) === draftRoomName)) && item.days.includes(classDraft.day) && classDraft.startTime < item.endTime && classDraft.endTime > item.startTime);
    if (overlappingClass) { setNoticeTitle("수업 시간이 겹칩니다"); setNoticeMessage(`${overlappingClass.name} 수업이 ${overlappingClass.startTime}부터 ${overlappingClass.endTime}까지 진행됩니다. 같은 강의실에는 수업을 중복 등록할 수 없으므로 ${overlappingClass.endTime} 이후 시간으로 등록해주세요.`); return; }
    const room = classrooms.find((item) => item.id === classDraft.classroomId);
    setSaving(true); setErrorMessage("");
    try {
      if (classDraft.id) {
        const original = classes.find((item) => item.id === classDraft.id);
        if (!original) throw new Error("클래스 정보를 찾지 못했습니다.");
        await onUpdateClass({ ...original, name: classDraft.name.trim(), startTime: classDraft.startTime, endTime: classDraft.endTime, classroomId: classDraft.classroomId, venue: room?.name ?? "", status: classDraft.status ?? "active" });
      } else await onCreateClass({ name: classDraft.name.trim(), days: [classDraft.day], startTime: classDraft.startTime, endTime: classDraft.endTime, classroomId: classDraft.classroomId, venue: room?.name ?? "" });
      setClassDraft(null);
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : "클래스를 저장하지 못했습니다."); } finally { setSaving(false); }
  };
  const saveRunDraft = async () => {
    if (!runDraft?.vehicleId || !runDraft.startTime || !runDraft.endTime || runDraft.endTime <= runDraft.startTime) { setErrorMessage("차량과 운행 시간을 확인해주세요."); return; }
    const invalidRunDay = runDraft.days.find((day) => { const hours = operatingHours[operatingDayKeys[day]]; return !hours?.isOpen || runDraft.startTime < hours.start || runDraft.endTime > hours.end; });
    if (invalidRunDay !== undefined) { const hours = operatingHours[operatingDayKeys[invalidRunDay]]; setNoticeTitle("운행 시간을 확인해주세요"); setNoticeMessage(`${weekdays[invalidRunDay]}요일 센터 운영 시간은 ${hours?.start ?? "-"}부터 ${hours?.end ?? "-"}까지입니다. 운영 시간 안에서 회차 시간을 선택해주세요.`); return; }
    const vehicle = vehicles.find((item) => item.id === runDraft.vehicleId);
    const values = { center_id: centerId, name: `${vehicle?.name ?? "차량"} ${runDraft.startTime} 회차`, days: runDraft.days, vehicle_id: runDraft.vehicleId, scheduled_start: runDraft.startTime, scheduled_end: runDraft.endTime, driver_member_id: runDraft.driverMemberId || null, companion_member_id: runDraft.companionMemberId || null, status: runDraft.status ?? "active", updated_at: new Date().toISOString() };
    setSaving(true); setErrorMessage("");
    try {
      const result = runDraft.id ? await supabase.from("vehicle_runs").update(values).eq("id", runDraft.id).eq("center_id", centerId) : await supabase.from("vehicle_runs").insert(values);
      if (result.error) throw new Error(result.error.message);
      await reloadRuns(); setRunDraft(null);
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : "운행 회차를 저장하지 못했습니다."); } finally { setSaving(false); }
  };
  const deleteRun = async () => {
    if (!runDraft?.id) return;
    const { count, error: countError } = await supabase.from("ride_schedules").select("id", { count: "exact", head: true }).eq("run_id", runDraft.id);
    if (countError) { setErrorMessage(countError.message); return; }
    const shouldDisable = Boolean(count);
    if (!window.confirm(shouldDisable ? `연결된 일정 ${count}건이 있어 완전히 삭제할 수 없습니다. 이 회차를 사용 중지할까요?` : "이 운행 회차를 삭제할까요?")) return;
    setSaving(true);
    const result = shouldDisable ? await supabase.from("vehicle_runs").update({ status: "inactive", updated_at: new Date().toISOString() }).eq("id", runDraft.id).eq("center_id", centerId) : await supabase.from("vehicle_runs").delete().eq("id", runDraft.id).eq("center_id", centerId);
    setSaving(false);
    if (result.error) { setErrorMessage(result.error.message); return; }
    await reloadRuns(); setRunDraft(null);
  };
  const renderClassClockField = (label: string, value: string, onChange: (value: string) => void) => {
    const dayIndex = weekdays.indexOf(classDraft?.day ?? selectedLabel);
    const hours = operatingHours[operatingDayKeys[dayIndex < 0 ? selectedDay : dayIndex]];
    const startHour = Number(hours?.start.split(":")[0] ?? 0);
    const endHour = Number(hours?.end.split(":")[0] ?? 23);
    const selectedHour = value ? Number(value.split(":")[0]) : null;
    const selectedMinute = value?.split(":")[1] ?? "00";
    const hourOptions = Array.from({ length: Math.max(0, endHour - startHour + 1) }, (_, index) => startHour + index);
    return <label className="center-clock-field"><span>{label}</span><div className="center-clock-controls"><select value={selectedHour ?? ""} onChange={(event) => onChange(`${pad(Number(event.target.value))}:${selectedMinute}`)}><option value="">시 선택</option>{hourOptions.map((hour) => <option key={hour} value={hour}>{hour < 12 ? "오전" : "오후"} {hour % 12 || 12}시</option>)}</select><MinuteClockPicker hour={selectedHour} minute={selectedMinute} label={label} onChange={(minute) => selectedHour !== null && onChange(`${pad(selectedHour)}:${minute}`)} /></div><small>{hours?.start}~{hours?.end} 운영 시간 내 선택</small></label>;
  };
  const renderRunClockField = (label: string, value: string, onChange: (value: string) => void) => {
    const runDay = runDraft?.days[0] ?? selectedDay;
    const hours = operatingHours[operatingDayKeys[runDay]];
    const startHour = Number(hours?.start.split(":")[0] ?? 0);
    const endHour = Number(hours?.end.split(":")[0] ?? 23);
    const selectedHour = value ? Number(value.split(":")[0]) : null;
    const selectedMinute = value?.split(":")[1] ?? "00";
    const hourOptions = Array.from({ length: Math.max(0, endHour - startHour + 1) }, (_, index) => startHour + index);
    return <label className="center-clock-field"><span>{label}</span><div className="center-clock-controls"><select value={selectedHour ?? ""} onChange={(event) => onChange(`${pad(Number(event.target.value))}:${selectedMinute}`)}><option value="">시 선택</option>{hourOptions.map((hour) => <option key={hour} value={hour}>{hour < 12 ? "오전" : "오후"} {hour % 12 || 12}시</option>)}</select><MinuteClockPicker hour={selectedHour} minute={selectedMinute} label={label} onChange={(minute) => selectedHour !== null && onChange(`${pad(selectedHour)}:${minute}`)} /></div><small>{hours?.start}~{hours?.end} 운영 시간 내 선택</small></label>;
  };
  const orderedDays = [1, 2, 3, 4, 5, 6, 0];
  return <main className="center-timetable-page">
    <button className="back" type="button" onClick={back}><Icon name="back" />홈으로</button>
    <section className="center-timetable-head"><span>주간 운영 계획</span><h1>센터 시간표</h1><p>요일별 클래스와 차량 운행 회차를 함께 확인합니다.</p></section>
    <div className="center-timetable-mode" role="group" aria-label="시간표 유형 선택"><button type="button" className={timetableMode === "class" ? "active" : ""} onClick={() => setTimetableMode("class")}>수업 시간표 보기</button><button type="button" className={timetableMode === "vehicle" ? "active" : ""} onClick={() => setTimetableMode("vehicle")}>차량 시간표 보기</button></div>
    <nav className="center-timetable-days" aria-label="시간표 요일 선택">{orderedDays.map((day) => <button type="button" key={day} className={selectedDay === day ? "active" : ""} onClick={() => { setSelectedDay(day); setVenue("all"); }}>{weekdays[day]}요일</button>)}</nav>
    {errorMessage && <p className="auth-message" role="alert">시간표 조회 실패: {errorMessage}</p>}
    <section className="center-timetable-content">
      {timetableMode === "class" ? <div className="center-class-schedule">
        <nav className="venue-tabs" aria-label="강의실 선택">{["all", ...classroomNames].map((item) => <button type="button" key={item} className={venue === item ? "active" : ""} onClick={() => setVenue(item)}>{item === "all" ? "전체 강의실" : item}</button>)}</nav>
        {!selectedOperatingHours?.isOpen ? <section className="vehicle-run-empty"><p>{selectedLabel}요일은 센터 휴무일로 설정되어 있습니다.</p><small>센터 설정에서 운영 여부와 시간을 변경할 수 있습니다.</small></section> : <><div className="vehicle-run-operating-summary"><span>센터 운영 시간</span><strong>{selectedOperatingHours.start} ~ {selectedOperatingHours.end}</strong></div><div className="center-class-schedule-scroll"><section className={`schedule-table ${venue !== "all" ? "single-venue" : ""}`} style={{ minWidth: `${145 + scheduleVenues.length * 210}px` }}>
          <div className="table-head" style={{ gridTemplateColumns: `145px repeat(${scheduleVenues.length}, minmax(210px, 1fr))` }}><strong>시간</strong>{scheduleVenues.map((item) => <strong key={item}>{item} <small>(강의실)</small></strong>)}</div>
          {classTimetableSlots.map((slot) => <div className="table-row center-class-time-row" key={`${slot.startTime}-${slot.endTime}`} style={{ gridTemplateColumns: `145px repeat(${scheduleVenues.length}, minmax(210px, 1fr))` }}><div className="time-cell"><span>{slot.startTime}<small>~ {slot.endTime}</small></span></div>{scheduleVenues.map((roomName) => { const slotStartMinute = runTimeToMinutes(slot.startTime); const slotEndMinute = runTimeToMinutes(slot.endTime); const overlappingLessons = dayClasses.filter((lesson) => getClassroomName(lesson) === roomName && runTimeToMinutes(lesson.startTime) < slotEndMinute && runTimeToMinutes(lesson.endTime) > slotStartMinute); const startingLessons = overlappingLessons.filter((lesson) => runTimeToMinutes(lesson.startTime) >= slotStartMinute && runTimeToMinutes(lesson.startTime) < slotEndMinute); const latestOverlappingEnd = overlappingLessons.reduce((latest, lesson) => Math.max(latest, runTimeToMinutes(lesson.endTime)), slotStartMinute); const suggestedStart = latestOverlappingEnd > slotStartMinute && latestOverlappingEnd < slotEndMinute ? `${pad(Math.floor(latestOverlappingEnd / 60))}:${pad(latestOverlappingEnd % 60)}` : slot.startTime; const canAddAfterOverlap = !overlappingLessons.length || latestOverlappingEnd < slotEndMinute; return <div className="center-class-cell" key={roomName}>{startingLessons.length ? startingLessons.map((lesson) => { const lessonStudents = getClassStudents(lesson); return <button type="button" className="lesson-card center-editable-card" key={lesson.id} onClick={() => openClass(lesson)}><strong>{lesson.name}</strong><span>{lesson.startTime}~{lesson.endTime}</span><span>{lesson.venue || roomName}</span><small>♙ {lessonStudents.length}명</small><small className="center-class-teacher">담당 · {getClassTeacherNames(lesson)}</small><b>수정·삭제 ›</b></button>; }) : canAddAfterOverlap ? <button type="button" className="center-empty-add" onClick={() => openNewClass(selectedLabel, suggestedStart, slot.endTime, roomName)}><strong>＋ 클래스 추가</strong><small>{suggestedStart} 시작</small></button> : <div className="center-class-occupied" aria-label={`${overlappingLessons[0]?.name ?? "수업"} 진행 시간`} />}</div>; })}</div>)}
        </section></div></>}
        <p className="schedule-note">* 센터 관리에 등록된 기본 클래스 시간표입니다.</p>
      </div> : <article className="center-vehicle-schedule"><header><div><span>차량</span><h2>{selectedLabel}요일 차량 시간표</h2></div><strong>{dayRuns.length}개 회차</strong></header>{loading ? <p className="center-timetable-empty">불러오는 중...</p> : !vehicles.length ? <p className="center-timetable-empty">등록된 차량이 없습니다.</p> : !selectedOperatingHours?.isOpen ? <section className="vehicle-run-empty"><p>{selectedLabel}요일은 센터 휴무일로 설정되어 있습니다.</p><small>센터 설정에서 운영 여부와 시간을 변경할 수 있습니다.</small></section> : <><div className="vehicle-run-operating-summary"><span>센터 운영 시간</span><strong>{selectedOperatingHours.start} ~ {selectedOperatingHours.end}</strong></div><div className="vehicle-run-matrix-scroll"><div className="vehicle-run-matrix" style={{ gridTemplateColumns: `116px repeat(${vehicles.length}, minmax(210px, 1fr))` }}><div className="matrix-head time">운행 시간</div>{vehicles.map((vehicle) => <div className="matrix-head" key={vehicle.id}><strong>{vehicle.name}</strong><small>{vehicle.number || "차량 번호 미등록"}</small></div>)}{vehicleTimetableSlots.map((slot) => <div className="matrix-row" key={`${slot.startTime}-${slot.endTime}`} style={{ gridColumn: `1 / span ${vehicles.length + 1}`, gridTemplateColumns: `116px repeat(${vehicles.length}, minmax(210px, 1fr))` }}><div className="matrix-time"><strong>{slot.startTime}</strong><span>~ {slot.endTime}</span></div>{vehicles.map((vehicle) => { const slotStartMinute = runTimeToMinutes(slot.startTime); const slotEndMinute = runTimeToMinutes(slot.endTime); const overlappingRuns = dayRuns.filter((run) => run.vehicleId === vehicle.id && runTimeToMinutes(run.startTime) < slotEndMinute && runTimeToMinutes(run.endTime) > slotStartMinute); const startingRuns = overlappingRuns.filter((run) => runTimeToMinutes(run.startTime) >= slotStartMinute); return <div className="matrix-cell" key={vehicle.id}>{startingRuns.length ? startingRuns.map((run) => { const driver = managers.find((item) => item.id === run.driverMemberId); const companion = managers.find((item) => item.id === run.companionMemberId); return <button type="button" className="matrix-run-card center-editable-card" key={run.id} onClick={() => openRun(run)}><div><strong>{run.name}</strong></div><small>기사 {driver?.name ?? "미배정"} · 동승자 {companion?.name ?? "없음"}</small><span>{run.startTime} ~ {run.endTime}</span><b>수정·삭제 ›</b></button>; }) : overlappingRuns.length ? <div className="matrix-run-continuation center-readonly-run">↳ {overlappingRuns[0].name} 운행 중</div> : <button type="button" className="center-empty-add compact" onClick={() => openNewRun(selectedDay, slot.startTime, slot.endTime, vehicle.id)}><strong>＋ 회차 추가</strong><small>{slot.startTime} 시작</small></button>}</div>; })}</div>)}</div></div><div className="vehicle-run-mobile-cards center-mobile-timetable">{vehicles.map((vehicle) => { const vehicleRuns = dayRuns.filter((run) => run.vehicleId === vehicle.id); return <section key={vehicle.id}><header><div><strong>{vehicle.name}</strong><small>{vehicle.number || "차량 번호 미등록"}</small></div></header>{vehicleRuns.length ? vehicleRuns.map((run) => { const driver = managers.find((item) => item.id === run.driverMemberId); const companion = managers.find((item) => item.id === run.companionMemberId); return <button type="button" className="mobile-run-card center-editable-card" key={run.id} onClick={() => openRun(run)}><span>{run.startTime} ~ {run.endTime}</span><strong>{run.name}</strong><small>기사 {driver?.name ?? "미배정"} · 동승자 {companion?.name ?? "없음"}</small></button>; }) : <button type="button" className="center-mobile-add" onClick={() => openNewRun(selectedDay, selectedOperatingHours.start, selectedOperatingHours.end, vehicle.id)}>＋ 운행 회차 추가</button>}</section>; })}</div></>}</article>}
    </section>
    {classDraft && <div className="center-quick-modal-backdrop" onClick={() => setClassDraft(null)}><section className="center-quick-modal" role="dialog" aria-modal="true" aria-label={classDraft.id ? "클래스 수정" : "클래스 추가"} onClick={(event) => event.stopPropagation()}><header><div><span>{classDraft.day}요일 · {classDraft.startTime}</span><h2>{classDraft.id ? "클래스 수정" : "클래스 추가"}</h2></div><button type="button" onClick={() => setClassDraft(null)}>×</button></header><label><span>클래스 이름</span><input autoFocus value={classDraft.name} onChange={(event) => setClassDraft({ ...classDraft, name: event.target.value })} placeholder="예: 초등 축구반" /></label><label><span>강의실</span><select value={classDraft.classroomId} onChange={(event) => setClassDraft({ ...classDraft, classroomId: event.target.value })}><option value="">강의실 선택</option>{activeClassrooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label><div className="center-time-fields">{renderClassClockField("시작 시간", classDraft.startTime, (startTime) => setClassDraft({ ...classDraft, startTime }))}{renderClassClockField("종료 시간", classDraft.endTime, (endTime) => setClassDraft({ ...classDraft, endTime }))}</div><footer>{classDraft.id && <><button type="button" className="secondary" onClick={async () => { const original = classes.find((item) => item.id === classDraft.id); if (!original) return; await onUpdateClass({ ...original, status: "inactive" }); setClassDraft(null); }}>사용 중지</button><button type="button" className="danger" onClick={async () => { const original = classes.find((item) => item.id === classDraft.id); if (!original || !window.confirm(`'${original.name}' 클래스를 삭제할까요? 연결된 학생이 있으면 사용 중지됩니다.`)) return; setSaving(true); try { await onDeleteClass(original); setClassDraft(null); } catch (error) { setErrorMessage(error instanceof Error ? error.message : "클래스를 삭제하지 못했습니다."); } finally { setSaving(false); } }}>삭제</button></>}<span /><button type="button" onClick={() => void saveClassDraft()} disabled={saving}>{saving ? "저장 중..." : "저장"}</button></footer></section></div>}
    {runDraft && <div className="center-quick-modal-backdrop" onClick={() => setRunDraft(null)}><section className="center-quick-modal" role="dialog" aria-modal="true" aria-label={runDraft.id ? "운행 회차 수정" : "운행 회차 추가"} onClick={(event) => event.stopPropagation()}><header><div><span>{runDraft.days.map((day) => weekdays[day]).join("·")}요일 · {runDraft.startTime}</span><h2>{runDraft.id ? "운행 회차 수정" : "운행 회차 추가"}</h2></div><button type="button" onClick={() => setRunDraft(null)}>×</button></header><label><span>차량</span><select value={runDraft.vehicleId} onChange={(event) => setRunDraft({ ...runDraft, vehicleId: event.target.value })}><option value="">차량 선택</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name} · {vehicle.number || "번호 미등록"}</option>)}</select></label><div className="center-time-fields">{renderRunClockField("운행 시작 시간", runDraft.startTime, (startTime) => setRunDraft({ ...runDraft, startTime }))}{renderRunClockField("운행 종료 시간", runDraft.endTime, (endTime) => setRunDraft({ ...runDraft, endTime }))}</div><label><span>기사</span><select value={runDraft.driverMemberId} onChange={(event) => setRunDraft({ ...runDraft, driverMemberId: event.target.value })}><option value="">미배정</option>{managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select></label><label><span>동승자</span><select value={runDraft.companionMemberId} onChange={(event) => setRunDraft({ ...runDraft, companionMemberId: event.target.value })}><option value="">없음</option>{managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select></label><footer>{runDraft.id && <><button type="button" className="secondary" onClick={async () => { setSaving(true); const result = await supabase.from("vehicle_runs").update({ status: "inactive", updated_at: new Date().toISOString() }).eq("id", runDraft.id).eq("center_id", centerId); setSaving(false); if (result.error) setErrorMessage(result.error.message); else { await reloadRuns(); setRunDraft(null); } }}>사용 중지</button><button type="button" className="danger" onClick={() => void deleteRun()}>삭제</button></>}<span /><button type="button" onClick={() => void saveRunDraft()} disabled={saving}>{saving ? "저장 중..." : "저장"}</button></footer></section></div>}
    {noticeMessage && <div className="center-notice-backdrop" onClick={() => setNoticeMessage("")}><section className="center-notice-modal" role="alertdialog" aria-modal="true" aria-labelledby="center-notice-title" onClick={(event) => event.stopPropagation()}><span aria-hidden="true">!</span><h2 id="center-notice-title">{noticeTitle}</h2><p>{noticeMessage}</p><button type="button" autoFocus onClick={() => setNoticeMessage("")}>확인</button></section></div>}
    <style jsx>{`
      .center-timetable-page{width:min(1120px,calc(100% - 48px));margin:0 auto;padding:34px 0 112px;color:#202328}.center-timetable-head{margin:28px 0 22px}.center-timetable-head>span{color:#69727c;font-size:12px;font-weight:900}.center-timetable-head h1{margin:7px 0;font-size:34px}.center-timetable-head p{margin:0;color:#717a83;font-size:14px}.center-timetable-mode{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:16px;padding:5px;border-radius:14px;background:#eceff2}.center-timetable-mode button{min-height:46px;border:0;border-radius:10px;background:transparent;color:#68717a;font-size:13px;font-weight:900;cursor:pointer}.center-timetable-mode button.active{background:#fff;color:#202328;box-shadow:0 2px 8px rgba(32,35,40,.11)}.center-timetable-days{display:flex;gap:7px;margin-bottom:18px;overflow-x:auto}.center-timetable-days button{flex:0 0 auto;padding:10px 14px;border:1px solid #dce1e5;border-radius:999px;background:#fff;color:#5d6670;font-weight:800;cursor:pointer}.center-timetable-days button.active{border-color:#202328;background:#202328;color:#fff}.center-class-schedule{min-width:0}.center-class-schedule .venue-tabs{margin-bottom:14px}.center-class-schedule-scroll{overflow-x:auto;padding-bottom:6px}.center-class-schedule .schedule-table{margin-top:0;overflow:hidden}.center-class-schedule .table-head,.center-class-schedule .table-row{display:grid}.center-class-time-row{border-top:1px solid #e2e6e9}.center-class-schedule .time-cell span{display:grid;gap:2px}.center-class-schedule .time-cell small{color:#78828c;font-size:9px}.center-class-cell{display:grid;align-content:center;gap:7px;min-height:74px;padding:7px;border-left:1px solid #e2e6e9}.center-class-cell .lesson-card{min-height:58px;margin:0}.center-class-continuation{padding:10px;border:1px solid #c8dff0;border-radius:9px;background:#f5faff;color:#52748d;font-size:10px;font-weight:800}.center-class-schedule .center-class-teacher{display:block;max-width:100%;overflow:hidden;color:#596875;text-overflow:ellipsis;white-space:nowrap}.center-timetable-content>article{min-width:0;padding:22px;border:1px solid #e0e4e8;border-radius:18px;background:#fff}.center-timetable-content>article>header{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:16px}.center-timetable-content header span{color:#77818a;font-size:10px;font-weight:900}.center-timetable-content h2{margin:4px 0 0;font-size:19px}.center-timetable-content>article>header>strong{padding:5px 9px;border-radius:999px;background:#eff1f3;color:#59626b;font-size:11px}.center-editable-card{width:100%;cursor:pointer;text-align:left}.center-editable-card b{color:#596875;font-size:9px}.center-empty-add,.center-mobile-add{display:grid;width:100%;min-height:58px;border:1px dashed #c9d0d6;border-radius:10px;background:#fafbfc;color:#69737c;place-items:center;cursor:pointer}.center-empty-add small{font-size:9px}.center-empty-add.compact{min-height:42px}.center-mobile-add{margin-top:8px}.center-quick-modal-backdrop{position:fixed;z-index:1000;inset:0;display:grid;padding:20px;background:rgba(18,22,26,.48);place-items:center}.center-quick-modal{display:grid;width:min(520px,100%);max-height:calc(100vh - 40px);gap:14px;padding:22px;border-radius:18px;background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.22);overflow-y:auto}.center-quick-modal header{display:flex;align-items:flex-start;justify-content:space-between}.center-quick-modal header span{color:#6d7680;font-size:11px;font-weight:800}.center-quick-modal h2{margin:4px 0 0}.center-quick-modal header>button{width:34px;height:34px;border:0;border-radius:50%;background:#eef1f3;font-size:22px;cursor:pointer}.center-quick-modal label{display:grid;gap:7px}.center-quick-modal label>span{font-size:11px;font-weight:900}.center-quick-modal input,.center-quick-modal select{width:100%;min-height:44px;padding:0 12px;border:1px solid #d8dde2;border-radius:9px;background:#fff}.center-time-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}.center-clock-field>small{color:#77818a;font-size:9px}.center-clock-controls{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr);gap:7px}.center-clock-controls .minute-picker-trigger{min-height:44px}.center-clock-controls .minute-picker-trigger span{font-size:11px}.center-clock-controls .minute-picker-trigger strong{font-size:12px}.center-quick-modal footer{display:grid;grid-template-columns:auto auto 1fr auto;gap:7px;margin-top:4px}.center-quick-modal footer button{min-height:40px;padding:0 13px;border:0;border-radius:9px;background:#202328;color:#fff;font-weight:800;cursor:pointer}.center-quick-modal footer .secondary{border:1px solid #d8dde2;background:#fff;color:#202328}.center-quick-modal footer .danger{background:#fff0f0;color:#b42318}.center-timetable-empty{margin:0;padding:34px 12px;border:1px dashed #d7dde2;border-radius:12px;color:#7a838c;text-align:center;font-size:12px}@media(max-width:700px){.center-timetable-page{width:calc(100% - 28px);padding-top:20px}.center-timetable-head{margin:20px 0 17px}.center-timetable-head h1{font-size:27px}.center-timetable-head p{font-size:11px}.center-timetable-mode button{min-height:42px;font-size:11px}.center-timetable-days button{padding:8px 11px;font-size:11px}.center-timetable-content>article{padding:14px}.center-mobile-timetable>section>header{margin:0}.center-class-schedule .schedule-table{min-width:560px!important}.center-quick-modal{padding:17px}.center-time-fields{grid-template-columns:1fr}.center-quick-modal footer{grid-template-columns:1fr 1fr}.center-quick-modal footer span{display:none}.center-quick-modal footer button:last-child{grid-column:1/-1}}
      .center-notice-backdrop{position:fixed;z-index:1700;inset:0;display:grid;padding:20px;background:rgba(18,22,26,.58);place-items:center}.center-notice-modal{display:grid;width:min(390px,100%);gap:12px;padding:24px;border-radius:18px;background:#fff;text-align:center;box-shadow:0 24px 70px rgba(0,0,0,.28)}.center-notice-modal>span{display:grid;width:42px;height:42px;margin:0 auto;border-radius:50%;background:#fff1dc;color:#b15b00;font-size:22px;font-weight:900;place-items:center}.center-notice-modal h2{margin:0;font-size:20px}.center-notice-modal p{margin:0;color:#5f6871;font-size:13px;line-height:1.65;word-break:keep-all}.center-notice-modal button{min-height:44px;margin-top:4px;border:0;border-radius:10px;background:#202328;color:#fff;font-weight:900;cursor:pointer}
    `}</style>
  </main>;
}

export function CalendarPage({
  selected,
  onSelect,
  onDateClick,
  onConfirm,
  back,
  title = "달력",
  prompt = "선택한 날짜의 차량 스케줄을 확인해보세요.",
  buttonLabel = "해당 날짜 차량 스케줄 확인하기",
}: {
  selected: Date;
  onSelect: (date: Date) => void;
  onDateClick?: (date: Date) => void;
  onConfirm: () => void;
  back: () => void;
  title?: string;
  prompt?: string;
  buttonLabel?: string;
}) {
  const [month, setMonth] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1),
  );
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const lastDate = new Date(year, monthIndex + 1, 0).getDate();
  const previousLastDate = new Date(year, monthIndex, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstDay + 1;
    if (day < 1)
      return {
        day: previousLastDate + day,
        current: false,
        date: new Date(year, monthIndex - 1, previousLastDate + day),
      };
    if (day > lastDate)
      return {
        day: day - lastDate,
        current: false,
        date: new Date(year, monthIndex + 1, day - lastDate),
      };
    return { day, current: true, date: new Date(year, monthIndex, day) };
  });
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const today = new Date();
  const moveMonth = (amount: number) =>
    setMonth(new Date(year, monthIndex + amount, 1));
  return (
    <main className="calendar-page">
      <div className="calendar-titlebar">
        <button onClick={back} aria-label="이전 화면">
          <Icon name="back" />
        </button>
        <h1>{title}</h1>
        <span />
      </div>
      <section className="calendar-card">
        <div className="month-control">
          <button onClick={() => moveMonth(-1)} aria-label="이전 달">
            ‹
          </button>
          <strong>
            {year}년 {monthIndex + 1}월
          </strong>
          <button onClick={() => moveMonth(1)} aria-label="다음 달">
            ›
          </button>
        </div>
        <div className="weekdays">
          {weekdays.map((day, index) => (
            <span
              key={day}
              className={index === 0 ? "sun" : index === 6 ? "sat" : ""}
            >
              {day}
            </span>
          ))}
        </div>
        <div className="calendar-grid">
          {cells.map((cell, index) => {
            const active = sameDay(cell.date, selected);
            const isToday = sameDay(cell.date, today);
            return (
              <button
                key={`${cell.date.toISOString()}-${index}`}
                className={`${!cell.current ? "other-month" : ""} ${index % 7 === 0 ? "sun" : index % 7 === 6 ? "sat" : ""} ${active ? "selected" : ""}`}
                onClick={() => {
                  onSelect(cell.date);
                  if (!cell.current)
                    setMonth(
                      new Date(
                        cell.date.getFullYear(),
                        cell.date.getMonth(),
                        1,
                      ),
                    );
                  onDateClick?.(cell.date);
                }}
                aria-label={`${cell.date.getFullYear()}년 ${cell.date.getMonth() + 1}월 ${cell.day}일${isToday ? ", 오늘" : ""}`}
              >
                <span>{cell.day}</span>
              </button>
            );
          })}
        </div>
      </section>
      {!onDateClick && (
        <section className="date-confirm">
          <div className="selected-date">
            <span className="calendar-symbol">▣</span>
            <strong>
              {selected.getFullYear()}. {pad(selected.getMonth() + 1)}.{" "}
              {pad(selected.getDate())} ({weekdays[selected.getDay()]})
            </strong>
          </div>
          <p>{prompt}</p>
          <button className="confirm-button" onClick={onConfirm}>
            <span>▣</span>
            {buttonLabel}
            <b>›</b>
          </button>
        </section>
      )}
    </main>
  );
}

export function ViewChoicePage({
  selected,
  choose,
  back,
}: {
  selected: Date;
  choose: (view: "schedule" | "class-schedule") => void;
  back: () => void;
}) {
  const dateLabel = `${selected.getFullYear()}. ${pad(selected.getMonth() + 1)}. ${pad(selected.getDate())} (${weekdays[selected.getDay()]})`;
  return (
    <main className="choice-page">
      <button className="back" onClick={back}>
        <Icon name="back" />
        날짜 선택으로
      </button>
      <section className="choice-head">
        <span className="choice-date">▣ {dateLabel}</span>
        <h1>어떻게 확인할까요?</h1>
        <p>차량 스케줄을 확인할 방식을 선택해주세요.</p>
      </section>
      <section className="view-options">
        <button
          className="view-option timeline-option"
          onClick={() => choose("schedule")}
        >
          <span className="view-icon">
            <Icon name="list" />
          </span>
          <span className="view-copy">
            <strong>차량 기사 뷰</strong>
            <small>
              시간 순서대로 전체 차량의 이동 경로와 탑승 일정을 확인합니다.
            </small>
          </span>
          <b>›</b>
        </button>
        <button
          className="view-option"
          onClick={() => choose("class-schedule")}
        >
          <span className="view-icon">
            <Icon name="bus" />
          </span>
          <span className="view-copy">
            <strong>담당 선생님 뷰</strong>
            <small>
              수업 클래스별로 등원·하원 차량과 이용 학생을 확인합니다.
            </small>
          </span>
          <b>›</b>
        </button>
      </section>
    </main>
  );
}

export function NoSchedulePage({ selected, back }: { selected: Date; back: () => void }) {
  return (
    <main className="no-schedule-page">
      <button className="back" onClick={back}>
        <Icon name="back" />
        날짜 선택으로
      </button>
      <section className="no-schedule-card">
        <span className="no-schedule-icon">▣</span>
        <small>
          {selected.getFullYear()}. {pad(selected.getMonth() + 1)}. {pad(selected.getDate())} (일)
        </small>
        <h1>차량 운행 정보가 없습니다.</h1>
        <p>일요일은 차량을 운행하지 않습니다.<br />다른 날짜를 선택해 운행 스케줄을 확인해주세요.</p>
        <button onClick={back}>다른 날짜 선택하기</button>
      </section>
    </main>
  );
}

export function SameDayViewChoicePage({
  selected,
  choose,
  back,
}: {
  selected: Date;
  choose: (view: "same-day-schedule" | "same-day-class-schedule") => void;
  back: () => void;
}) {
  const dateLabel = `${selected.getFullYear()}. ${pad(selected.getMonth() + 1)}. ${pad(selected.getDate())} (${weekdays[selected.getDay()]})`;
  return (
    <main className="choice-page">
      <button className="back" onClick={back}>
        <Icon name="back" />
        날짜 선택으로
      </button>
      <section className="choice-head">
        <span className="choice-date">▣ {dateLabel}</span>
        <h1>어떻게 변경할까요?</h1>
        <p>당일 스케줄을 확인하고 변경할 방식을 선택해주세요.</p>
      </section>
      <section className="view-options">
        <button
          className="view-option timeline-option"
          onClick={() => choose("same-day-schedule")}
        >
          <span className="view-icon">
            <Icon name="list" />
          </span>
          <span className="view-copy">
            <strong>차량 기사 뷰</strong>
            <small>
              시간 순서대로 전체 차량의 탑승 일정을 확인하고 변경합니다.
            </small>
          </span>
          <b>›</b>
        </button>
        <button
          className="view-option"
          onClick={() => choose("same-day-class-schedule")}
        >
          <span className="view-icon">
            <Icon name="bus" />
          </span>
          <span className="view-copy">
            <strong>담당 선생님 뷰</strong>
            <small>
              수업 클래스별 등원·하원 차량과 이용 학생을 확인하고 변경합니다.
            </small>
          </span>
          <b>›</b>
        </button>
      </section>
    </main>
  );
}

export function VehicleDayPage({
  selected,
  onSelectDay,
  back,
}: {
  selected: Date;
  onSelectDay: (date: Date) => void;
  back: () => void;
}) {
  const monday = new Date(selected);
  const day = monday.getDay();
  monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
  const days = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  });
  return (
    <main className="choice-page vehicle-day-page">
      <button className="back" onClick={back}>
        <Icon name="back" />
        변경 유형 선택
      </button>
      <section className="choice-head">
        <span className="choice-date">차량 스케줄 변경</span>
        <h1>요일을 선택해주세요</h1>
        <p>변경할 차량 스케줄의 운행 요일을 선택하세요.</p>
      </section>
      <section className="weekday-options" aria-label="운행 요일 선택">
        {days.map((date) => (
          <button
            key={date.toISOString()}
            className={date.getDay() === selected.getDay() ? "active" : ""}
            onClick={() => onSelectDay(date)}
          >
            <strong>{weekdays[date.getDay()]}요일</strong>
            <b>›</b>
          </button>
        ))}
      </section>
    </main>
  );
}

export function VehicleViewChoicePage({
  selected,
  choose,
  back,
}: {
  selected: Date;
  choose: (view: "vehicle-schedule" | "vehicle-class-schedule") => void;
  back: () => void;
}) {
  return (
    <main className="choice-page">
      <button className="back" onClick={back}>
        <Icon name="back" />
        요일 선택으로
      </button>
      <section className="choice-head">
        <span className="choice-date">
          {weekdays[selected.getDay()]}요일 · {selected.getMonth() + 1}월{" "}
          {selected.getDate()}일
        </span>
        <h1>어떻게 변경할까요?</h1>
        <p>차량 스케줄을 확인하고 변경할 방식을 선택해주세요.</p>
      </section>
      <section className="view-options">
        <button
          className="view-option timeline-option"
          onClick={() => choose("vehicle-schedule")}
        >
          <span className="view-icon">
            <Icon name="list" />
          </span>
          <span className="view-copy">
            <strong>차량 기사 뷰</strong>
            <small>
              선택한 요일의 전체 차량 운행을 시간 순서대로 확인합니다.
            </small>
          </span>
          <b>›</b>
        </button>
        <button
          className="view-option"
          onClick={() => choose("vehicle-class-schedule")}
        >
          <span className="view-icon">
            <Icon name="bus" />
          </span>
          <span className="view-copy">
            <strong>담당 선생님 뷰</strong>
            <small>선택한 요일의 등원·하원 차량을 클래스별로 확인합니다.</small>
          </span>
          <b>›</b>
        </button>
      </section>
    </main>
  );
}

export function ChangeChoicePage({
  choose,
  back,
}: {
  choose: (view: "same-day-date" | "vehicle-day") => void;
  back: () => void;
}) {
  return (
    <main className="choice-page change-choice-page">
      <section className="choice-head">
        <span className="choice-date">운행 정보 변경</span>
        <h1>무엇을 변경할까요?</h1>
        <p>변경할 운행 정보의 유형을 선택해주세요.</p>
      </section>
      <section className="view-options">
        <button
          className="view-option timeline-option"
          onClick={() => choose("same-day-date")}
        >
          <span className="view-icon">
            <Icon name="edit" />
          </span>
          <span className="view-copy">
            <strong>당일 스케줄 변경</strong>
            <small>
              오늘 발생한 결석, 탑승 장소, 탑승 시간 등의 정보를 변경합니다.
            </small>
          </span>
          <b>›</b>
        </button>
        <button className="view-option" onClick={() => choose("vehicle-day")}>
          <span className="view-icon">
            <Icon name="bus" />
          </span>
          <span className="view-copy">
            <strong>차량 스케줄 변경</strong>
            <small>정기 운행 노선과 차량·기사 배정 정보를 변경합니다.</small>
          </span>
          <b>›</b>
        </button>
      </section>
    </main>
  );
}

type Ride = {
  id: string;
  studentId: string;
  time: string;
  name: string;
  place: string;
  phone: string;
  photo: string;
  guardians: { relation: string; name: string; phone: string }[];
  specialNote: string;
  status: "normal" | "changed" | "added" | "excluded" | "run-changed" | "cancelled" | "attention" | "delayed";
  direction: "pickup" | "dropoff";
  originalTime?: string;
  originalPlace?: string;
  changeKinds: Array<"time" | "place" | "note">;
};
type TimelineGroup = {
  groupId: string;
  runId?: string;
  vehicleId?: string;
  vehicleName: string;
  count: number;
  rides: Ride[];
  runName: string;
  runStart?: string;
  runEnd?: string;
  driverMemberId?: string;
  companionMemberId?: string;
  recordId?: string;
  runStatus: "scheduled" | "in_progress" | "completed" | "cancelled";
  actualStartAt?: string;
  actualEndAt?: string;
};
const runStatusLabels: Record<TimelineGroup["runStatus"], string> = {
  scheduled: "운행 전",
  in_progress: "운행 중",
  completed: "운행 완료",
  cancelled: "취소",
};
export function TimelinePage({
  selected,
  centerId,
  back,
  manageMode = false,
  companionAssignments,
  vehicles,
  managers,
  openStudent,
}: {
  selected: Date;
  centerId: string;
  back: () => void;
  manageMode?: boolean;
  companionAssignments: Record<string, string>;
  vehicles: VehicleOption[];
  managers: { id: string; name: string; phone: string; roles: string[]; assignedVehicleName?: string }[];
  openStudent: (studentId: string) => void;
}) {
  const [route, setRoute] = useState("all");
  const [vehicleWindowStart, setVehicleWindowStart] = useState(0);
  const [vehiclesPerPage, setVehiclesPerPage] = useState(3);
  const [timelineGroups, setTimelineGroups] = useState<TimelineGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [completed, setCompleted] = useState<string[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [actionToast, setActionToast] = useState("");
  const [runRecordSaving, setRunRecordSaving] = useState("");
  const [runRecordError, setRunRecordError] = useState("");
  const [profileRide, setProfileRide] = useState<Ride | null>(null);
  const [guardianRide, setGuardianRide] = useState<Ride | null>(null);
  const [noteRide, setNoteRide] = useState<Ride | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [specialNotes, setSpecialNotes] = useState<Record<string, string>>({});
  const [editRide, setEditRide] = useState<Ride | null>(null);
  const [editTime, setEditTime] = useState("");
  const [editPlace, setEditPlace] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const selectedDateKey = `${selected.getFullYear()}-${pad(selected.getMonth() + 1)}-${pad(selected.getDate())}`;
  useEffect(() => {
    const updateVehiclesPerPage = () => {
      if (window.innerWidth < 760) setVehiclesPerPage(1);
      else if (window.innerWidth < 1300) setVehiclesPerPage(2);
      else setVehiclesPerPage(3);
    };
    updateVehiclesPerPage();
    window.addEventListener("resize", updateVehiclesPerPage);
    return () => window.removeEventListener("resize", updateVehiclesPerPage);
  }, []);
  useEffect(() => { setVehicleWindowStart(0); setRoute("all"); }, [selected]);
  useEffect(() => {
    let active = true;
    if (!centerId) return () => { active = false; };
    const loadSchedules = async () => {
      setLoading(true); setLoadError("");
      const { data, error } = await supabase
        .from("ride_schedules")
        .select("id,direction,ride_time,place,vehicle_id,vehicle_name,status,special_note,run_id,students(id,name,guardian,phone,photo_name),vehicle_runs(name,scheduled_start,scheduled_end,driver_member_id,companion_member_id)")
        .eq("center_id", centerId)
        .eq("weekday", selected.getDay())
        .eq("is_active", true)
        .not("vehicle_id", "is", null)
        .order("ride_time");
      if (!active) return;
      if (error) { setTimelineGroups([]); setLoadError(error.message); setLoading(false); return; }
      const scheduleIds = (data ?? []).map((row) => row.id);
      const { data: changeRows, error: changeError } = scheduleIds.length
        ? await supabase
            .from("ride_schedule_changes")
            .select("ride_schedule_id,ride_time,place,special_note,status")
            .eq("center_id", centerId)
            .eq("service_date", selectedDateKey)
            .in("ride_schedule_id", scheduleIds)
        : { data: [], error: null };
      if (!active) return;
      if (changeError) { setTimelineGroups([]); setLoadError(changeError.message); setLoading(false); return; }
      const runIds = Array.from(new Set((data ?? []).map((row) => row.run_id).filter(Boolean))) as string[];
      const { data: recordRows, error: recordError } = runIds.length
        ? await supabase.from("vehicle_run_records")
            .select("id,vehicle_run_id,status,actual_start_at,actual_end_at,driver_member_id,companion_member_id")
            .eq("center_id", centerId)
            .eq("service_date", selectedDateKey)
            .in("vehicle_run_id", runIds)
        : { data: [], error: null };
      if (!active) return;
      if (recordError) { setTimelineGroups([]); setLoadError(`당일 운행 기록 조회 실패: ${recordError.message}`); setLoading(false); return; }
      const changeMap = new Map((changeRows ?? []).map((change) => [change.ride_schedule_id, change]));
      const recordMap = new Map((recordRows ?? []).map((record) => [record.vehicle_run_id, record]));
      const groups = new Map<string, TimelineGroup>();
      const notes: Record<string, string> = {};
      for (const row of data ?? []) {
        if (!row.vehicle_id) continue;
        const change = changeMap.get(row.id);
        const student = Array.isArray(row.students) ? row.students[0] : row.students;
        const vehicle = row.vehicle_name || "미배정 차량";
        const run = Array.isArray(row.vehicle_runs) ? row.vehicle_runs[0] : row.vehicle_runs;
        const record = row.run_id ? recordMap.get(row.run_id) : undefined;
        const direction = row.direction === "dropoff" ? "dropoff" : "pickup";
        // 기존 데이터에는 run_id가 없으므로 차량·방향별 레거시 그룹으로 계속 표시합니다.
        const runName = run?.name || `${direction === "dropoff" ? "하원" : "등원"} 미지정 회차`;
        const groupId = row.run_id || `legacy:${vehicle}:${direction}`;
        const guardianText = student?.guardian || "보호자";
        const originalTime = String(row.ride_time ?? "").slice(0, 5);
        const originalPlace = row.place ?? "";
        const changedTime = String(change?.ride_time ?? row.ride_time ?? "").slice(0, 5);
        const changedPlace = change?.place ?? originalPlace;
        const changeKinds: Ride["changeKinds"] = [];
        if (change?.ride_time && changedTime !== originalTime) changeKinds.push("time");
        if (change?.place != null && changedPlace !== originalPlace) changeKinds.push("place");
        if (change?.special_note != null && change.special_note !== (row.special_note ?? "")) changeKinds.push("note");
        const rawStatus = String(change?.status ?? row.status ?? "normal");
        const status: Ride["status"] = ["deleted", "removed", "excluded"].includes(rawStatus)
          ? "excluded"
          : rawStatus === "cancelled"
            ? "cancelled"
          : ["run_changed", "run-changed"].includes(rawStatus)
            ? "run-changed"
          : rawStatus === "added"
            ? "added"
            : change || rawStatus === "changed"
              ? "changed"
              : rawStatus === "attention" || rawStatus === "delayed"
                ? rawStatus
                : "normal";
        const ride: Ride = {
          id: row.id, studentId: student?.id || "", time: changedTime, name: student?.name || "이름 미등록",
          place: changedPlace, phone: student?.phone || "", photo: student?.photo_name || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23e5e7eb'/%3E%3C/svg%3E",
          guardians: [{ relation: "보호자", name: guardianText, phone: student?.phone || "" }],
          specialNote: change?.special_note ?? row.special_note ?? "", status, direction,
          originalTime, originalPlace, changeKinds,
        };
        const current = groups.get(groupId);
        groups.set(groupId, current
          ? { ...current, count: current.count + 1, rides: [...current.rides, ride] }
          : { groupId, runId: row.run_id ?? undefined, vehicleId: row.vehicle_id ?? undefined, vehicleName: vehicle, count: 1, rides: [ride], runName, runStart: run?.scheduled_start?.slice(0, 5), runEnd: run?.scheduled_end?.slice(0, 5), driverMemberId: record?.driver_member_id ?? run?.driver_member_id ?? undefined, companionMemberId: record?.companion_member_id ?? run?.companion_member_id ?? undefined, recordId: record?.id, runStatus: (record?.status ?? "scheduled") as TimelineGroup["runStatus"], actualStartAt: record?.actual_start_at ?? undefined, actualEndAt: record?.actual_end_at ?? undefined });
        notes[row.id] = ride.specialNote;
      }
      const next = Array.from(groups.values())
        .map((group) => ({ ...group, rides: [...group.rides].sort((a, b) => a.time.localeCompare(b.time)) }))
        .sort((a, b) => a.vehicleName.localeCompare(b.vehicleName, "ko") || (a.runStart || a.rides[0]?.time || "99:99").localeCompare(b.runStart || b.rides[0]?.time || "99:99"));
      setTimelineGroups(next); setSpecialNotes(notes); setLoading(false);
    };
    void loadSchedules();
    return () => { active = false; };
  }, [centerId, selected, selectedDateKey]);
  const vehicleCards = Array.from(new Set(timelineGroups.map((group) => group.vehicleName)).values()).map((name) => ({ name, number: "", driver: "" }));
  const vehicleDrivers = managers.filter((manager) => manager.roles.includes("차량 기사"));
  const getScheduleSummary = (
    vehicleName: string,
    group: TimelineGroup,
  ) => {
    const vehicle = vehicles.find((item) => item.name === vehicleName);
    const times = group.rides.map((ride) => ride.time).filter(Boolean).sort();
    const operationTime = group.runStart && group.runEnd ? `${group.runStart} ~ ${group.runEnd}` : times.length
      ? times.length === 1
        ? times[0]
        : `${times[0]} ~ ${times[times.length - 1]}`
      : "시간 미등록";
    const runDriver = managers.find((manager) => manager.id === group.driverMemberId);
    const explicitlyAssignedDriver = runDriver ?? vehicleDrivers.find(
      (manager) => manager.assignedVehicleName === vehicleName,
    );
    const driver = explicitlyAssignedDriver ?? (vehicleDrivers.length === 1 ? vehicleDrivers[0] : undefined);
    const runCompanion = managers.find((manager) => manager.id === group.companionMemberId);
    const assignedCompanion = companionAssignments[`${selectedDateKey}|${vehicleName}|${group.groupId}`];
    const companionNames = runCompanion ? [runCompanion.name] : assignedCompanion ? [assignedCompanion] : [];
    const companions = companionNames.map((name) => ({
      name,
      phone: managers.find((manager) => manager.name === name)?.phone ?? "연락처 미등록",
    }));
    return { vehicle, operationTime, driver, companions };
  };
  const maxVehicleWindowStart = Math.max(0, vehicleCards.length - vehiclesPerPage);
  const visibleVehicleNames = route === "all"
    ? vehicleCards.slice(vehicleWindowStart, vehicleWindowStart + vehiclesPerPage).map((vehicle) => vehicle.name)
    : [route];
  useEffect(() => {
    setVehicleWindowStart((current) => Math.min(current, maxVehicleWindowStart));
  }, [maxVehicleWindowStart]);
  const openEditModal = (ride: Ride) => {
    setEditRide(ride);
    setEditTime(ride.time);
    setEditPlace(ride.place);
    setEditNote(specialNotes[ride.id] ?? ride.specialNote);
    setEditError("");
  };
  const saveDailyChange = async () => {
    if (!editRide || !editTime || !editPlace.trim()) return;
    setEditSaving(true);
    setEditError("");
    const { error } = await supabase.from("ride_schedule_changes").upsert({
      center_id: centerId,
      ride_schedule_id: editRide.id,
      service_date: selectedDateKey,
      ride_time: editTime,
      place: editPlace.trim(),
      special_note: editNote.trim() || null,
      status: "changed",
      updated_at: new Date().toISOString(),
    }, { onConflict: "ride_schedule_id,service_date" });
    if (error) {
      setEditError(error.message);
      setEditSaving(false);
      return;
    }
    setTimelineGroups((groups) => groups.map((group) => ({
      ...group,
      rides: group.rides.map((ride) => ride.id === editRide.id
        ? {
          ...ride,
          time: editTime,
          place: editPlace.trim(),
          specialNote: editNote.trim(),
          status: "changed",
          changeKinds: [
            ...(editTime !== (ride.originalTime ?? ride.time) ? ["time" as const] : []),
            ...(editPlace.trim() !== (ride.originalPlace ?? ride.place) ? ["place" as const] : []),
            ...(editNote.trim() !== ride.specialNote ? ["note" as const] : []),
          ],
        }
        : ride),
    })));
    setSpecialNotes((notes) => ({ ...notes, [editRide.id]: editNote.trim() }));
    setNotice(`${editRide.name}의 ${weekdays[selected.getDay()]}요일 스케줄을 변경했습니다.`);
    setEditRide(null);
    setEditSaving(false);
    showActionToast("당일 스케줄 변경 사항이 저장되었습니다.");
  };
  const toggle = (id: string) =>
    setCompleted((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
  const showActionToast = (message: string) => {
    setActionToast(message);
    window.setTimeout(() => setActionToast(""), 2500);
  };
  const formatRecordedTime = (value?: string) => value
    ? new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value))
    : "미기록";
  const getRideStatusStyle = (status: string) => {
    switch (status) {
      case "changed":
      case "time-changed": return { border: "2px solid #3b82f6", background: "#f8fbff" };
      case "place-changed": return { border: "2px solid #8b5cf6", background: "#fbf9ff" };
      case "multiple-changed": return { border: "2px solid #1e40af", background: "#f5f8ff" };
      case "added": return { border: "2px solid #22a06b", background: "#f6fcf8" };
      case "excluded": return { border: "2px dashed #dc4c4c", background: "#fff8f7", opacity: 0.7 };
      case "run-changed": return { border: "2px solid #f59e0b", background: "#fffbf2" };
      case "cancelled": return { border: "2px solid #dc2626", background: "#fff7f7", opacity: 0.68 };
      default: return undefined;
    }
  };
  const updateRunRecord = async (group: TimelineGroup, action: "start" | "complete" | "cancel") => {
    if (!group.runId) { setRunRecordError("회차가 배정된 일정만 당일 운행을 기록할 수 있습니다."); return; }
    if (action === "complete" && group.runStatus !== "in_progress") { setRunRecordError("운행을 시작한 뒤 완료할 수 있습니다."); return; }
    if (action === "cancel" && !window.confirm(`${group.runName} 운행을 취소할까요?`)) return;
    setRunRecordSaving(group.groupId);
    setRunRecordError("");
    const now = new Date().toISOString();
    let result;
    if (group.recordId) {
      const changes = action === "start"
        ? { status: "in_progress", actual_start_at: now, actual_end_at: null, updated_at: now }
        : action === "complete"
          ? { status: "completed", actual_end_at: now, updated_at: now }
          : { status: "cancelled", updated_at: now };
      result = await supabase.from("vehicle_run_records").update(changes)
        .eq("id", group.recordId).eq("center_id", centerId)
        .select("id,status,actual_start_at,actual_end_at").single();
    } else {
      if (!group.vehicleId || !group.runStart || !group.runEnd) {
        setRunRecordError("회차의 차량과 예정 시간이 모두 등록되어 있어야 합니다.");
        setRunRecordSaving("");
        return;
      }
      result = await supabase.from("vehicle_run_records").insert({
        center_id: centerId,
        vehicle_run_id: group.runId,
        service_date: selectedDateKey,
        scheduled_start: group.runStart,
        scheduled_end: group.runEnd,
        vehicle_id: group.vehicleId,
        driver_member_id: group.driverMemberId || null,
        companion_member_id: group.companionMemberId || null,
        status: action === "start" ? "in_progress" : "cancelled",
        actual_start_at: action === "start" ? now : null,
        actual_end_at: null,
        updated_at: now,
      }).select("id,status,actual_start_at,actual_end_at").single();
    }
    if (result.error) {
      setRunRecordError(`운행 기록 저장 실패: ${result.error.message}`);
      setRunRecordSaving("");
      return;
    }
    const record = result.data;
    setTimelineGroups((groups) => groups.map((item) => item.groupId === group.groupId ? {
      ...item,
      recordId: record.id,
      runStatus: record.status as TimelineGroup["runStatus"],
      actualStartAt: record.actual_start_at ?? undefined,
      actualEndAt: record.actual_end_at ?? undefined,
    } : item));
    setRunRecordSaving("");
    showActionToast(action === "start" ? "실제 출발 시간을 기록했습니다." : action === "complete" ? "실제 종료 시간을 기록했습니다." : "당일 운행을 취소했습니다.");
  };
  return (
    <main className={`timeline-page ${manageMode ? "manage-schedule" : ""} ${route === "all" ? "all-vehicles-view" : ""}`}>
      <div className="timeline-toolbar">
        <button className="back" onClick={back}>
          <Icon name="back" />
          조회 방식 선택
        </button>
        <div>
          <button className="ghost-button">초기화</button>
          <button className="dark-button">변경 사항</button>
        </div>
      </div>
      <section className="timeline-heading">
        <h1>운행 정보 타임라인</h1>
        <p>
          {selected.getFullYear()}년 {selected.getMonth() + 1}월{" "}
          {selected.getDate()}일 {weekdays[selected.getDay()]}요일 운행
          일정입니다.
        </p>
      </section>
      <details className="change-status-guide">
        <summary><span>변경 상태 안내</span><small>테두리 색과 배지의 의미</small></summary>
        <div className="change-status-guide-items">
          <span className="normal">정상 일정</span>
          <span className="time">시간 변경</span>
          <span className="place">장소 변경</span>
          <span className="multiple">2건 변경</span>
          <span className="added">당일 추가</span>
          <span className="excluded">당일 제외</span>
          <span className="run">회차 변경</span>
          <span className="cancelled">운행 취소</span>
        </div>
      </details>
      {notice && (
        <p className="schedule-action-notice" role="status">
          {notice}
        </p>
      )}
      {runRecordError && <p className="schedule-action-notice error" role="alert">{runRecordError}</p>}
      <section className="filter-panel vehicle-only compact-vehicle-filter">
        <div className="filter-group route-filter">
          <strong>조회할 차량 선택</strong>
          <div className="vehicle-card-tabs">
            {!vehicleCards.length && <p className="empty-state">등록된 차량이 없습니다.</p>}
            {!!vehicleCards.length && (
              <button
                className={route === "all" ? "active" : ""}
                onClick={() => { setRoute("all"); setVehicleWindowStart(0); }}
              >
                <strong className="vehicle-card-name">전체 차량 보기</strong>
              </button>
            )}
            {vehicleCards.map((vehicle) => (
              <button
                key={vehicle.name}
                className={route === vehicle.name ? "active" : ""}
                onClick={() => setRoute(vehicle.name)}
              >
                <strong className="vehicle-card-name">{vehicle.name}</strong>
              </button>
            ))}
          </div>
          {route === "all" && vehicleCards.length > vehiclesPerPage && (
            <div className="vehicle-window-controls" aria-label="전체 차량 목록 이동">
              <button type="button" aria-label="이전 차량 보기" disabled={vehicleWindowStart === 0} onClick={() => setVehicleWindowStart((current) => Math.max(0, current - 1))}>‹</button>
              <span>{vehicleWindowStart + 1}–{Math.min(vehicleWindowStart + vehiclesPerPage, vehicleCards.length)} / {vehicleCards.length}대</span>
              <button type="button" aria-label="다음 차량 보기" disabled={vehicleWindowStart >= maxVehicleWindowStart} onClick={() => setVehicleWindowStart((current) => Math.min(maxVehicleWindowStart, current + 1))}>›</button>
            </div>
          )}
        </div>
      </section>
      {loading && <section className="panel empty-state">운행 스케줄을 불러오고 있습니다.</section>}
      {loadError && <section className="panel empty-state">운행 스케줄 조회 실패: {loadError}</section>}
      {!loading && !loadError && !timelineGroups.length && <section className="panel empty-state">등록된 운행 스케줄이 없습니다.</section>}
      <div
        className={`timeline-list ${route === "all" ? "all-vehicles-grid" : "single-vehicle-list"}`}
        style={route === "all" ? { gridTemplateColumns: `repeat(${Math.max(1, visibleVehicleNames.length)}, minmax(0, 1fr))` } : undefined}
      >
        {visibleVehicleNames.map((vehicleName) => (
          <section className="vehicle-schedule-column" key={vehicleName}>
            {route === "all" && <header className="vehicle-schedule-column-head"><h2>{vehicleName}</h2><span>{timelineGroups.filter((group) => group.vehicleName === vehicleName).reduce((count, group) => count + group.rides.length, 0)}건 일정</span></header>}
        {timelineGroups.filter((group) => group.vehicleName === vehicleName).map((group) => {
          const hasPickup = group.rides.some((ride) => ride.direction === "pickup");
          const hasDropoff = group.rides.some((ride) => ride.direction === "dropoff");
          const runType = hasPickup && hasDropoff ? "혼합 운행" : hasDropoff ? "하원 운행" : hasPickup ? "등원 운행" : "미배정 회차";
          const summary = getScheduleSummary(vehicleName, group);
          const visibleRides = group.rides;
          const lastActiveRide = visibleRides
            .filter((ride) => ride.status !== "excluded" && !deleted.includes(ride.id))
            .at(-1);
          const endsWithPickup = lastActiveRide?.direction === "pickup";
          const activeRideCount = visibleRides.filter((ride) => ride.status !== "excluded" && !deleted.includes(ride.id)).length;
          const changedRideCount = visibleRides.filter((ride) => ride.status === "changed").length;
          const addedRideCount = visibleRides.filter((ride) => ride.status === "added").length;
          const excludedRideCount = visibleRides.filter((ride) => ride.status === "excluded" || deleted.includes(ride.id)).length;
          return (
            <section className="timeline-group run-timeline-group" key={group.groupId}>
              <header>
                <div><span className={`run-type-badge ${hasPickup && hasDropoff ? "mixed" : ""}`}>{runType}</span><h2>{group.runName}</h2>{!group.runId && <small className="unassigned-run-label">회차 재배정 필요</small>}</div>
                <span>총 {activeRideCount}건{changedRideCount + addedRideCount + excludedRideCount > 0 && ` · 변경 ${changedRideCount + addedRideCount + excludedRideCount}`}</span>
              </header>
              <article className="vehicle-operation-summary" aria-label={`${group.runName} 운행 기본 정보`}>
                <div className="operation-summary-row operation-time-row">
                  <span className="operation-summary-icon" aria-hidden="true">🕐</span>
                  <div><small>운행 시간</small><strong>{summary.operationTime}</strong></div>
                </div>
                <div className="operation-summary-row">
                  <span className="operation-summary-icon" aria-hidden="true">🚐</span>
                  <div className="operation-summary-content">
                    <small>기사 정보</small>
                    {summary.driver ? (
                      <strong>{summary.driver.name} / <a href={`tel:${summary.driver.phone.replace(/-/g, "")}`}>{summary.driver.phone || "연락처 미등록"}</a></strong>
                    ) : <strong>기사 미배정</strong>}
                  </div>
                </div>
                <div className="operation-summary-row">
                  <span className="operation-summary-icon" aria-hidden="true">👥</span>
                  <div className="operation-summary-content">
                    <small>동승자 정보</small>
                    {!summary.companions.length ? <strong>없음</strong> : summary.companions.map((companion) => (
                      <span className="operation-person" key={`${group.groupId}-${companion.name}-${companion.phone}`}>
                        <strong>{companion.name} / {companion.phone === "연락처 미등록" ? companion.phone : <a href={`tel:${companion.phone.replace(/-/g, "")}`}>{companion.phone}</a>}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              </article>
              <section className="run-record-panel" aria-label={`${group.runName} 당일 운행 기록`}>
                <div className="run-record-state">
                  <span className={`run-status-chip ${group.runStatus}`}>{runStatusLabels[group.runStatus]}</span>
                  <p>실제 출발 <strong>{formatRecordedTime(group.actualStartAt)}</strong> · 실제 종료 <strong>{formatRecordedTime(group.actualEndAt)}</strong></p>
                </div>
                {!manageMode && group.runId && <div className="run-record-actions">
                  <button type="button" disabled={runRecordSaving === group.groupId || group.runStatus !== "scheduled"} onClick={() => void updateRunRecord(group, "start")}>운행 시작</button>
                  <button type="button" disabled={runRecordSaving === group.groupId || group.runStatus !== "in_progress"} onClick={() => void updateRunRecord(group, "complete")}>운행 완료</button>
                  <button type="button" className="cancel" disabled={runRecordSaving === group.groupId || group.runStatus === "completed" || group.runStatus === "cancelled"} onClick={() => void updateRunRecord(group, "cancel")}>운행 취소</button>
                </div>}
                {!group.runId && <small>회차를 재배정하면 실제 운행 시간을 기록할 수 있습니다.</small>}
              </section>
              <div className="ride-list">
                {visibleRides.map((ride) => {
                  const done = completed.includes(ride.id);
                  const isDropoff = ride.direction === "dropoff";
                  const isLocallyExcluded = deleted.includes(ride.id);
                  const isExcluded = ride.status === "excluded" || isLocallyExcluded;
                  const hasTimeChange = ride.changeKinds.includes("time");
                  const hasPlaceChange = ride.changeKinds.includes("place");
                  const visualStatus = group.runStatus === "cancelled"
                    ? "cancelled"
                    : isExcluded
                      ? "excluded"
                      : ride.status === "changed" && hasTimeChange && hasPlaceChange
                        ? "multiple-changed"
                        : ride.status === "changed" && hasTimeChange
                          ? "time-changed"
                          : ride.status === "changed" && hasPlaceChange
                            ? "place-changed"
                            : ride.status;
                  return (
                    <article
                      className={`ride-card ride-status-${visualStatus} ${route === "all" ? "compact-ride-card" : ""} ${done ? "done" : ""}`}
                      style={getRideStatusStyle(visualStatus)}
                      key={ride.id}
                    >
                      <div className="ride-badge-row">
                        <span className={`ride-direction-badge ${isDropoff ? "dropoff" : "pickup"}`}>{isDropoff ? "하원" : "등원"}</span>
                        {visualStatus === "changed" && <span className="ride-change-badge changed">정보 변경</span>}
                        {visualStatus === "time-changed" && <span className="ride-change-badge time">시간 변경</span>}
                        {visualStatus === "place-changed" && <span className="ride-change-badge place">장소 변경</span>}
                        {visualStatus === "multiple-changed" && <span className="ride-change-badge multiple">2건 변경</span>}
                        {visualStatus === "added" && <span className="ride-change-badge added">당일 추가</span>}
                        {visualStatus === "excluded" && <span className="ride-change-badge excluded">당일 제외</span>}
                        {visualStatus === "run-changed" && <span className="ride-change-badge run">회차 변경</span>}
                        {visualStatus === "cancelled" && <span className="ride-change-badge cancelled">운행 취소</span>}
                      </div>
                      <div className="ride-field time-field">
                        <small>시간</small>
                        <strong>{ride.time}</strong>
                      </div>
                      <button className="child-photo-button" type="button" onClick={() => setProfileRide(ride)} aria-label={`${ride.name} 사진 크게 보기`}>
                        <img src={ride.photo} alt={`${ride.name} 프로필`} />
                      </button>
                      <div className="ride-field name-field">
                        <small>아이 이름</small>
                        <button className="child-name-button" type="button" onClick={() => ride.studentId && openStudent(ride.studentId)}>{ride.name}</button>
                      </div>
                      <div className="ride-field place-field">
                        <small>장소</small>
                        <strong>{ride.place}</strong>
                      </div>
                      <div className="ride-card-detail-actions">
                        <button type="button" onClick={() => setGuardianRide(ride)}>보호자 보기</button>
                        <button type="button" onClick={() => { setNoteRide(ride); setNoteDraft(specialNotes[ride.id] ?? ""); }}>특이사항 보기</button>
                      </div>
                      {manageMode ? (
                        <div className="schedule-item-actions">
                          <button
                            type="button"
                            onClick={() => openEditModal(ride)}
                          >
                            변경하기
                          </button>
                          <button
                            className="delete"
                            disabled={ride.status === "excluded"}
                            onClick={() => {
                              setDeleted((items) => items.includes(ride.id) ? items.filter((id) => id !== ride.id) : [...items, ride.id]);
                              setNotice(`${ride.name} 스케줄을 ${isExcluded ? "복구" : "당일 제외 처리"}했습니다.`);
                            }}
                          >
                            {ride.status === "excluded" ? "제외됨" : isLocallyExcluded ? "제외 취소" : "삭제하기"}
                          </button>
                        </div>
                      ) : (
                        <button
                          className={
                            done ? "ride-button complete" : "ride-button"
                          }
                          onClick={() => {
                            toggle(ride.id);
                            showActionToast(
                              isDropoff
                                ? "아이 도착 정보가 전달 됬습니다."
                                : "탑승 정보가 전달 됬습니다.",
                            );
                          }}
                        >
                          {isDropoff
                            ? done
                              ? "도착 완료"
                              : "도착"
                            : done
                              ? "탑승 완료"
                              : "탑승 확인"}
                        </button>
                      )}
                    </article>
                  );
                })}
                {endsWithPickup && (() => {
                  const centerArrivalId = `${group.groupId}:center-arrival`;
                  const centerArrivalDone = completed.includes(centerArrivalId);
                  const centerArrivalTime = group.runEnd || visibleRides
                    .map((ride) => ride.time)
                    .filter(Boolean)
                    .sort()
                    .at(-1) || "시간 미등록";

                  return (
                    <article className={`center-arrival-card ${route === "all" ? "compact" : ""} ${centerArrivalDone ? "done" : ""}`}>
                      <div className="center-arrival-badge-row">
                        <span className="ride-direction-badge pickup">등원</span>
                        <span className="center-arrival-badge">운행 종료 지점</span>
                      </div>
                      <div className="center-arrival-field time">
                        <small>시간</small>
                        <strong>{centerArrivalTime}</strong>
                      </div>
                      <div className="center-arrival-icon" aria-hidden="true">🏫</div>
                      <div className="center-arrival-field title">
                        <small>일정</small>
                        <strong>센터 도착</strong>
                      </div>
                      <div className="center-arrival-field place">
                        <small>장소</small>
                        <strong>센터</strong>
                      </div>
                      {!manageMode && (
                        <button
                          type="button"
                          className={centerArrivalDone ? "center-arrival-button complete" : "center-arrival-button"}
                          onClick={() => {
                            toggle(centerArrivalId);
                            showActionToast(
                              centerArrivalDone
                                ? "센터 도착 완료를 취소했습니다."
                                : "센터 도착 정보가 전달 됬습니다.",
                            );
                          }}
                        >
                          {centerArrivalDone ? "도착 완료" : "센터 도착"}
                        </button>
                      )}
                    </article>
                  );
                })()}
              </div>
            </section>
          );
        })}
          </section>
        ))}
      </div>
      {actionToast && (
        <div className="toast-message" role="status">
          ✓ {actionToast}
        </div>
      )}
      {profileRide && (
        <div className="info-modal-backdrop" role="presentation" onClick={() => setProfileRide(null)}>
          <section className="info-modal profile-modal" role="dialog" aria-modal="true" aria-label={`${profileRide.name} 프로필`} onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setProfileRide(null)} aria-label="닫기">×</button>
            <img src={profileRide.photo} alt={`${profileRide.name} 프로필 크게 보기`} />
            <strong>{profileRide.name}</strong>
          </section>
        </div>
      )}
      {guardianRide && (
        <div className="info-modal-backdrop" role="presentation" onClick={() => setGuardianRide(null)}>
          <section className="info-modal guardian-modal" role="dialog" aria-modal="true" aria-label={`${guardianRide.name} 보호자 정보`} onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setGuardianRide(null)} aria-label="닫기">×</button>
            <header><span>{guardianRide.name}</span><h3>보호자 정보</h3></header>
            <div className="guardian-modal-list">
              {guardianRide.guardians.map((guardian) => (
                <article key={`${guardian.relation}-${guardian.phone}`}>
                  <div><small>{guardian.relation}</small><strong>{guardian.name}</strong><span>{guardian.phone}</span></div>
                  <a href={`tel:${guardian.phone.replace(/-/g, "")}`} aria-label={`${guardian.name} 보호자에게 전화하기`}>📞</a>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
      {noteRide && (
        <div className="info-modal-backdrop" role="presentation" onClick={() => setNoteRide(null)}>
          <section className="info-modal note-modal" role="dialog" aria-modal="true" aria-label={`${noteRide.name} 특이사항`} onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setNoteRide(null)} aria-label="닫기">×</button>
            <header><span>{noteRide.name}</span><h3>특이사항</h3><small>운영자 또는 담당 선생님이 입력할 수 있습니다.</small></header>
            <textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="예: 주로 할머니가 데리러 오심. 혼자 올라감." rows={5} />
            <button className="note-save-button" type="button" onClick={() => { setSpecialNotes((current) => ({ ...current, [noteRide.id]: noteDraft })); setNoteRide(null); showActionToast("특이사항이 저장되었습니다."); }}>특이사항 저장</button>
          </section>
        </div>
      )}
      {editRide && (
        <div className="info-modal-backdrop" role="presentation" onClick={() => !editSaving && setEditRide(null)}>
          <section className="info-modal schedule-change-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-change-title" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" disabled={editSaving} onClick={() => setEditRide(null)} aria-label="닫기">×</button>
            <header>
              <span>{selected.getMonth() + 1}월 {selected.getDate()}일 · {editRide.name}</span>
              <h3 id="schedule-change-title">당일 스케줄 변경</h3>
              <small>이 날짜에만 적용되며 기본 반복 스케줄은 유지됩니다.</small>
            </header>
            <div className="schedule-change-fields">
              <div className="schedule-change-time-field">
                <span>시간 수정</span>
                <MinuteClockPicker
                  hour={editTime ? Number(editTime.split(":")[0]) : null}
                  minute={editTime?.split(":")[1] ?? "00"}
                  label={editRide.direction === "pickup" ? "등원" : "하원"}
                  disabled={editSaving}
                  onChange={(minute) => setEditTime(`${editTime.split(":")[0]}:${minute}`)}
                />
                <small>기존 {editTime ? `${Number(editTime.split(":")[0])}시` : "시간"}는 유지되며 분만 변경할 수 있습니다.</small>
              </div>
              <label>
                <span>장소 수정</span>
                <input type="text" value={editPlace} onChange={(event) => setEditPlace(event.target.value)} placeholder="승·하원 장소를 입력해주세요" required />
              </label>
              <label>
                <span>특이사항 수정</span>
                <textarea value={editNote} onChange={(event) => setEditNote(event.target.value)} placeholder="보호자 요청이나 전달 사항을 입력해주세요" rows={4} />
              </label>
            </div>
            {editError && <p className="auth-message" role="alert">저장 실패: {editError}</p>}
            <div className="schedule-change-actions">
              <button type="button" className="ghost-button" disabled={editSaving} onClick={() => setEditRide(null)}>취소</button>
              <button type="button" className="dark-button" disabled={editSaving || !editTime || !editPlace.trim()} onClick={() => void saveDailyChange()}>{editSaving ? "저장 중..." : "변경 사항 저장"}</button>
            </div>
          </section>
        </div>
      )}
      <style jsx>{`
        .schedule-change-modal { width: min(520px, calc(100% - 32px)); }
        .schedule-change-modal header { margin-bottom: 22px; padding-right: 32px; }
        .schedule-change-modal header span { color: #667085; font-size: 13px; font-weight: 700; }
        .schedule-change-modal header h3 { margin: 6px 0; font-size: 24px; }
        .schedule-change-modal header small { color: #667085; line-height: 1.5; }
        .schedule-change-fields { display: grid; gap: 16px; }
        .schedule-change-fields label { display: grid; gap: 8px; }
        .schedule-change-fields label > span, .schedule-change-time-field > span { font-size: 14px; font-weight: 800; }
        .schedule-change-time-field { display: grid; gap: 8px; }
        .schedule-change-time-field > small { color: #667085; font-size: 11px; line-height: 1.45; }
        .schedule-change-fields input, .schedule-change-fields textarea { width: 100%; box-sizing: border-box; border: 1px solid #d0d5dd; border-radius: 10px; background: #fff; padding: 13px 14px; color: #202328; font: inherit; outline: none; }
        .schedule-change-fields input:focus, .schedule-change-fields textarea:focus { border-color: #202328; box-shadow: 0 0 0 3px rgba(32,35,40,.08); }
        .schedule-change-fields textarea { resize: vertical; }
        .schedule-change-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 22px; }
        .schedule-change-actions button { min-height: 48px; }
        .vehicle-window-controls { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 14px; }
        .vehicle-window-controls button { width: 42px; height: 42px; border: 1px solid #d7dce1; border-radius: 50%; background: #fff; color: #202328; font-size: 25px; line-height: 1; cursor: pointer; }
        .vehicle-window-controls button:disabled { opacity: .3; cursor: default; }
        .vehicle-window-controls span { min-width: 92px; color: #667085; text-align: center; font-size: 12px; font-weight: 800; }
        .timeline-page.all-vehicles-view { width: min(1180px, calc(100% - 48px)); max-width: 1180px; }
        .change-status-guide { margin: 0 0 16px; overflow: hidden; border: 1px solid #e0e4e8; border-radius: 14px; background: #fff; }
        .change-status-guide summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 16px; cursor: pointer; list-style: none; }
        .change-status-guide summary::-webkit-details-marker { display: none; }
        .change-status-guide summary span { font-size: 13px; font-weight: 900; }
        .change-status-guide summary small { color: #747d86; font-size: 10px; }
        .change-status-guide-items { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 8px; padding: 0 16px 14px; }
        .change-status-guide-items span { padding: 9px 10px; border: 2px solid #d9dee3; border-radius: 9px; background: #fff; color: #525b64; text-align: center; font-size: 10px; font-weight: 900; }
        .change-status-guide-items .time { border-color: #3b82f6; color: #1d4ed8; }
        .change-status-guide-items .place { border-color: #8b5cf6; color: #6d28d9; }
        .change-status-guide-items .multiple { border-color: #1e40af; color: #1e3a8a; }
        .change-status-guide-items .added { border-color: #22a06b; color: #16764a; }
        .change-status-guide-items .excluded { border-color: #dc4c4c; border-style: dashed; color: #b42318; }
        .change-status-guide-items .run { border-color: #f59e0b; color: #a65a16; }
        .change-status-guide-items .cancelled { border-color: #dc2626; background: #fff7f7; color: #b42318; }
        .all-vehicles-grid { display: grid; align-items: stretch; gap: 16px; }
        .vehicle-schedule-column { min-width: 0; height: 100%; display: flex; flex-direction: column; gap: 14px; }
        .vehicle-schedule-column-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 16px 18px; border-radius: 14px; background: #202328; color: #fff; }
        .vehicle-schedule-column-head h2 { margin: 0; font-size: 17px; }
        .vehicle-schedule-column-head span { color: #d8dce0; font-size: 11px; font-weight: 800; }
        .run-timeline-group { min-width: 0; padding: 16px; border: 1px solid #e1e5e9; border-radius: 16px; background: #fafbfc; }
        .run-timeline-group > header { align-items: flex-start; justify-content: space-between; }
        .run-timeline-group > header > div { display: flex; min-width: 0; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
        .run-timeline-group > header h2 { width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .unassigned-run-label { color: #b25b12; font-size: 10px; font-weight: 800; }
        .ride-badge-row { position: absolute; top: 8px; right: 132px; z-index: 2; display: flex; max-width: calc(100% - 150px); flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 5px; }
        .timeline-page :global(.ride-card) { min-width: 0; box-sizing: border-box; border-left-width: 1px; background: #fff; }
        .timeline-page :global(.ride-card.ride-status-changed) { border: 2px solid #3b82f6; background: #f8fbff; }
        .timeline-page :global(.ride-card.ride-status-time-changed) { border: 2px solid #3b82f6; background: #f8fbff; }
        .timeline-page :global(.ride-card.ride-status-place-changed) { border: 2px solid #8b5cf6; background: #fbf9ff; }
        .timeline-page :global(.ride-card.ride-status-multiple-changed) { border: 2px solid #1e40af; background: #f5f8ff; }
        .timeline-page :global(.ride-card.ride-status-added) { border: 2px solid #22a06b; background: #f6fcf8; }
        .timeline-page :global(.ride-card.ride-status-excluded) { border: 2px dashed #dc4c4c; background: #fff8f7; opacity: .7; }
        .timeline-page :global(.ride-card.ride-status-run-changed) { border: 2px solid #f59e0b; background: #fffbf2; }
        .timeline-page :global(.ride-card.ride-status-cancelled) { border: 2px solid #dc2626; background: #fff7f7; opacity: .68; }
        .timeline-page :global(.ride-card.ride-status-excluded .name-field strong), .timeline-page :global(.ride-card.ride-status-excluded .child-name-button) { text-decoration: line-through; }
        .ride-direction-badge { display: inline-flex; padding: 4px 8px; border-radius: 999px; font-size: 10px; font-weight: 900; line-height: 1.2; }
        .ride-direction-badge.pickup { background: #e8f4ff; color: #1768a5; }
        .ride-direction-badge.dropoff { background: #fff0e7; color: #b65117; }
        .ride-change-badge { display: inline-flex; padding: 4px 8px; border-radius: 999px; font-size: 9px; font-weight: 900; line-height: 1.2; }
        .ride-change-badge.changed { background: #dbeafe; color: #1d4ed8; }
        .ride-change-badge.time { background: #dbeafe; color: #1d4ed8; }
        .ride-change-badge.place { background: #ede9fe; color: #6d28d9; }
        .ride-change-badge.multiple { background: #dbe5ff; color: #1e3a8a; }
        .ride-change-badge.added { background: #dcfce7; color: #16764a; }
        .ride-change-badge.excluded { background: #fee2e2; color: #b42318; }
        .ride-change-badge.run { background: #fff0c7; color: #a65a16; }
        .ride-change-badge.cancelled { background: #fee2e2; color: #b42318; }
        .vehicle-operation-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; overflow: hidden; border: 1px solid #e1e5e9; border-radius: 14px; background: #fff; box-shadow: 0 4px 14px rgba(32,35,40,.05); }
        .operation-summary-row { display: grid; grid-template-columns: 30px minmax(0, 1fr); align-items: start; gap: 8px; min-width: 0; padding: 13px 12px; }
        .operation-summary-row + .operation-summary-row { border-left: 1px solid #edf0f2; }
        .operation-summary-icon { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; background: #f3f5f6; font-size: 15px; }
        .operation-summary-row small { display: block; margin-bottom: 4px; color: #7a838c; font-size: 10px; font-weight: 800; }
        .operation-summary-row strong { color: #202328; font-size: 13px; line-height: 1.4; }
        .operation-summary-content { min-width: 0; display: grid; gap: 3px; }
        .operation-summary-content > span { color: #5f6871; font-size: 11px; line-height: 1.45; }
        .operation-summary-content a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
        .operation-person { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
        .operation-person strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
        .run-record-panel { display: grid; gap: 12px; margin-top: 12px; padding: 13px; border: 1px solid #dde3e8; border-radius: 12px; background: #fff; }
        .run-record-state { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .run-record-state p { margin: 0; color: #667085; font-size: 11px; }
        .run-record-state p strong { color: #202328; }
        .run-status-chip { display: inline-flex; flex: 0 0 auto; padding: 5px 9px; border-radius: 999px; background: #eef1f4; color: #59636d; font-size: 10px; font-weight: 900; }
        .run-status-chip.in_progress { background: #e8f4ff; color: #1768a5; }
        .run-status-chip.completed { background: #e7f7ee; color: #16794b; }
        .run-status-chip.cancelled { background: #fff0ee; color: #b42318; }
        .run-record-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
        .run-record-actions button { min-width: 0; min-height: 38px; padding: 7px 5px; border: 0; border-radius: 9px; background: #202328; color: #fff; font-size: 11px; font-weight: 800; cursor: pointer; }
        .run-record-actions button.cancel { background: #fff0ee; color: #b42318; }
        .run-record-actions button:disabled { opacity: .35; cursor: default; }
        .run-record-panel > small { color: #b25b12; font-size: 10px; font-weight: 700; }
        .all-vehicles-grid :global(.timeline-group) { min-width: 0; }
        .all-vehicles-grid :global(.compact-ride-card) { min-width: 0; display: grid; grid-template-columns: 54px 44px minmax(0, 1fr); grid-template-areas: "badge badge badge" "time photo name" "place place place" "details details details" "primary primary primary"; align-items: center; gap: 10px; padding: 14px; }
        .all-vehicles-grid :global(.compact-ride-card .ride-badge-row) { position: static; grid-area: badge; width: max-content; max-width: 100%; }
        .all-vehicles-grid :global(.compact-ride-card .time-field) { grid-area: time; min-width: 0; }
        .all-vehicles-grid :global(.compact-ride-card .child-photo-button) { grid-area: photo; width: 40px; height: 40px; min-width: 40px; }
        .all-vehicles-grid :global(.compact-ride-card .child-photo-button img) { width: 40px; height: 40px; object-fit: cover; }
        .all-vehicles-grid :global(.compact-ride-card .name-field) { grid-area: name; min-width: 0; }
        .all-vehicles-grid :global(.compact-ride-card .child-name-button) { max-width: 100%; white-space: normal; word-break: keep-all; overflow-wrap: anywhere; text-align: left; }
        .all-vehicles-grid :global(.compact-ride-card .place-field) { grid-area: place; min-width: 0; padding-top: 9px; border-top: 1px solid #e7eaed; }
        .all-vehicles-grid :global(.compact-ride-card .place-field strong) { display: block; white-space: normal; word-break: keep-all; overflow-wrap: anywhere; }
        .all-vehicles-grid :global(.compact-ride-card .ride-card-detail-actions) { grid-area: details; display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
        .all-vehicles-grid :global(.compact-ride-card .ride-card-detail-actions button) { min-width: 0; width: 100%; min-height: 38px; padding: 7px; white-space: normal; }
        .all-vehicles-grid :global(.compact-ride-card .ride-button), .all-vehicles-grid :global(.compact-ride-card .schedule-item-actions) { grid-area: primary; width: 100%; }
        .all-vehicles-grid :global(.compact-ride-card .schedule-item-actions) { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
        .all-vehicles-grid :global(.compact-ride-card .schedule-item-actions button) { min-width: 0; }
        .center-arrival-card { position: relative; display: grid; grid-template-columns: 82px 52px minmax(130px, 1fr) minmax(130px, 1fr) auto; align-items: center; gap: 16px; min-width: 0; box-sizing: border-box; padding: 18px 16px; border: 1px solid #b8d9c6; border-left: 5px solid #22a06b; border-radius: 12px; background: #f7fcf9; transition: background .16s ease, opacity .16s ease; }
        .center-arrival-card.done { background: #edf8f1; }
        .center-arrival-badge-row { position: absolute; top: 8px; right: 132px; display: flex; align-items: center; gap: 5px; }
        .center-arrival-badge { display: inline-flex; padding: 4px 8px; border-radius: 999px; background: #dff4e7; color: #16764a; font-size: 9px; font-weight: 900; line-height: 1.2; }
        .center-arrival-field { min-width: 0; }
        .center-arrival-field small { display: block; margin-bottom: 7px; color: #8a949c; font-size: 10px; }
        .center-arrival-field strong { display: block; overflow: hidden; color: #202328; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
        .center-arrival-icon { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 50%; background: #e3f3e9; font-size: 20px; }
        .center-arrival-button { min-width: 106px; min-height: 50px; border: 0; border-radius: 7px; background: #202328; color: #fff; font-size: 13px; font-weight: 900; cursor: pointer; }
        .center-arrival-button.complete { background: #1d7a4d; }
        .all-vehicles-grid .center-arrival-card.compact { grid-template-columns: 54px 44px minmax(0, 1fr); grid-template-areas: "badge badge badge" "time icon title" "place place place" "button button button"; gap: 10px; padding: 14px; }
        .all-vehicles-grid .center-arrival-card.compact .center-arrival-badge-row { position: static; grid-area: badge; width: max-content; max-width: 100%; }
        .all-vehicles-grid .center-arrival-card.compact .center-arrival-field.time { grid-area: time; }
        .all-vehicles-grid .center-arrival-card.compact .center-arrival-icon { grid-area: icon; width: 40px; height: 40px; }
        .all-vehicles-grid .center-arrival-card.compact .center-arrival-field.title { grid-area: title; }
        .all-vehicles-grid .center-arrival-card.compact .center-arrival-field.place { grid-area: place; padding-top: 9px; border-top: 1px solid #dce9e1; }
        .all-vehicles-grid .center-arrival-card.compact .center-arrival-button { grid-area: button; width: 100%; }
        @media (max-width: 860px) { .timeline-page.all-vehicles-view { width: calc(100% - 32px); max-width: none; } }
        @media (min-width: 760px) { .change-status-guide:not([open]) .change-status-guide-items { display: grid; } }
        @media (max-width: 759px) { .all-vehicles-grid { grid-template-columns: 1fr !important; } .vehicle-operation-summary { grid-template-columns: 1fr; } .operation-summary-row + .operation-summary-row { border-top: 1px solid #edf0f2; border-left: 0; } .ride-badge-row { top: 5px; right: 10px; max-width: calc(100% - 20px); } .run-record-state { align-items: flex-start; flex-direction: column; } .change-status-guide-items{grid-template-columns:repeat(2,minmax(0,1fr))}.change-status-guide:not([open]) .change-status-guide-items{display:none} .center-arrival-card:not(.compact) { grid-template-columns: 54px 44px minmax(0,1fr); grid-template-areas: "badge badge badge" "time icon title" "place place place" "button button button"; gap: 10px; padding: 14px; } .center-arrival-card:not(.compact) .center-arrival-badge-row { position: static; grid-area: badge; } .center-arrival-card:not(.compact) .center-arrival-field.time { grid-area: time; } .center-arrival-card:not(.compact) .center-arrival-icon { grid-area: icon; } .center-arrival-card:not(.compact) .center-arrival-field.title { grid-area: title; } .center-arrival-card:not(.compact) .center-arrival-field.place { grid-area: place; padding-top: 9px; border-top: 1px solid #dce9e1; } .center-arrival-card:not(.compact) .center-arrival-button { grid-area: button; width: 100%; } }
        @media (max-width: 520px) { .timeline-page.all-vehicles-view { width: calc(100% - 28px); } }
        @media (max-width: 600px) { .schedule-change-modal { width: calc(100% - 24px); } .schedule-change-actions { grid-template-columns: 1fr; } }
      `}</style>
    </main>
  );
}

export function ClassSchedulePage({
  selected,
  centerId,
  onDateChange,
  back,
  classes,
  students,
  classrooms,
  manageMode = false,
  openStudent,
}: {
  selected: Date;
  centerId: string;
  onDateChange: (date: Date) => void;
  back: () => void;
  classes: ClassOption[];
  students: Student[];
  classrooms: ClassroomOption[];
  manageMode?: boolean;
  openStudent: (student: Student) => void;
}) {
  const [venue, setVenue] = useState("all");
  const [notice, setNotice] = useState("");
  const [deletedStudents, setDeletedStudents] = useState<number[]>([]);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [dropoffAssignments, setDropoffAssignments] = useState<Record<string, { vehicleId: string; vehicleName: string }>>({});
  const [selectedLesson, setSelectedLesson] = useState<{
    id: string;
    title: string;
    time: string;
    info: string;
    count: string;
    venue: string;
    students: Student[];
  } | null>(null);
  const moveDate = (amount: number) => {
    const next = new Date(selected);
    next.setDate(selected.getDate() + amount);
    onDateChange(next);
  };
  const activeClassrooms = classrooms.filter((room) => room.status === "active");
  const classroomNames = activeClassrooms.length
    ? activeClassrooms.map((room) => room.name)
    : Array.from(new Set(classes.map((item) => item.venue).filter(Boolean)));
  const venues = venue === "all" ? classroomNames : [venue];
  const selectedDay = weekdays[selected.getDay()];
  useEffect(() => {
    let active = true;
    if (!centerId) return () => { active = false; };
    void supabase.from("ride_schedules")
      .select("student_id,vehicle_id,vehicle_name")
      .eq("center_id", centerId)
      .eq("weekday", selected.getDay())
      .eq("direction", "dropoff")
      .eq("is_active", true)
      .then(({ data }) => {
        if (!active) return;
        const next: Record<string, { vehicleId: string; vehicleName: string }> = {};
        for (const row of data ?? []) next[row.student_id] = { vehicleId: row.vehicle_id ?? "", vehicleName: row.vehicle_name ?? "" };
        setDropoffAssignments(next);
      });
    return () => { active = false; };
  }, [centerId, selected]);
  const classesForDay = classes.filter((item) => item.status !== "inactive" && item.days.includes(selectedDay));
  const getClassStudents = (classItem: ClassOption) => students.filter((student) => {
    const linkedClassIds = (student as Student & { classIds?: string[] }).classIds;
    return linkedClassIds?.length
      ? linkedClassIds.includes(classItem.id)
      : student.classId
        ? student.classId === classItem.id
        : student.className === classItem.name;
  });
  const scheduleRows: Array<{ time: string; cells: Record<string, ClassOption | null> }> = Array.from(
    new Set(classesForDay.map((item) => `${item.startTime}~${item.endTime}`)),
  ).sort().map((time) => {
    const cells = Object.fromEntries(classroomNames.map((name) => [name, null])) as Record<string, ClassOption | null>;
    classesForDay.filter((item) => `${item.startTime}~${item.endTime}` === time).forEach((item) => {
      const roomName = classrooms.find((room) => room.id === item.classroomId)?.name ?? item.venue;
      if (roomName) cells[roomName] = item;
    });
    return { time, cells };
  });
  if (selectedLesson) {
    const visibleStudents = selectedLesson.students
      .map((student, index) => ({ student, index }))
      .filter(({ index }) => !deletedStudents.includes(index));
    const vehicleMap = new Map<string, Student[]>();
    visibleStudents.forEach(({ student }) => {
      const assignment = student.databaseId ? dropoffAssignments[student.databaseId] : undefined;
      const vehicleName = assignment
        ? assignment.vehicleId ? assignment.vehicleName || "미배정 차량" : "개별 하원"
        : student.dropoffInfo.split(" · ")[1] || student.vehicleName || "개별 하원";
      vehicleMap.set(vehicleName, [...(vehicleMap.get(vehicleName) ?? []), student]);
    });
    const vehicleGroups = Array.from(vehicleMap, ([title, assignedStudents]) => ({
      title,
      students: assignedStudents,
      individual: title === "개별 하원",
    }));
    return (
      <main
        className={`class-detail-page ${manageMode ? "manage-roster-page" : ""}`}
      >
        <header className="class-detail-toolbar">
          <button
            className="back"
            onClick={() => {
              setSelectedLesson(null);
              setNotice("");
            }}
          >
            <Icon name="back" />
            클래스 시간표
          </button>
          <span>
            {selected.getFullYear()}년 {selected.getMonth() + 1}월{" "}
            {selected.getDate()}일
          </span>
        </header>
        <section className="single-class-head">
          <div>
            <small>
              {selectedLesson.venue || "장소 미지정"} · {selectedLesson.time}
            </small>
            <h1>{selectedLesson.title}</h1>
            <p>{selectedLesson.info}</p>
          </div>
          <strong>총 {visibleStudents.length}명</strong>
        </section>
        {notice && (
          <p className="schedule-action-notice" role="status">
            {notice}
          </p>
        )}
        <section className="single-class-roster">
          <header>
            <h2>클래스 학생 명단</h2>
            <span>
              {manageMode ? "학생별 스케줄 관리" : "승·하원 이용 현황"}
            </span>
          </header>
          {!visibleStudents.length && <p className="empty-state">이 클래스에 등록된 학생이 없습니다.</p>}
          {visibleStudents.map(({ student, index }) => {
            return (
              <article key={student.id}>
                <span className="roster-number">{index + 1}</span>
                <button type="button" className="student-profile-link" onClick={() => openStudent(student)}>{student.name}</button>
                <div>
                  <small>승원</small>
                  <b>{student.pickupInfo || "개별 등원"}</b>
                </div>
                <div>
                  <small>하원</small>
                  <b>{student.dropoffInfo || "개별 하원"}</b>
                </div>
                {manageMode && (
                  <div className="roster-actions">
                    <button
                      onClick={() =>
                        setNotice(
                          `${student.name} 학생의 승·하원 스케줄 변경 화면을 열었습니다.`,
                        )
                      }
                    >
                      변경
                    </button>
                    <button
                      className="delete"
                      onClick={() => {
                        setDeletedStudents((items) => [...items, index]);
                        setNotice(`${student.name} 학생의 스케줄을 삭제했습니다.`);
                      }}
                    >
                      삭제
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </section>
        {!manageMode && (
          <button
            className="vehicle-sort-button"
            onClick={() => setShowVehicleModal(true)}
          >
            <span>▣</span>차량별 학생 분류하기<b>›</b>
          </button>
        )}
        {showVehicleModal && (
          <div
            className="vehicle-sort-overlay"
            role="presentation"
            onMouseDown={() => setShowVehicleModal(false)}
          >
            <section
              className="vehicle-sort-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="vehicle-sort-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header>
                <div>
                  <small>{selectedLesson.title}</small>
                  <h2 id="vehicle-sort-title">차량별 학생 분류</h2>
                </div>
                <button
                  onClick={() => setShowVehicleModal(false)}
                  aria-label="닫기"
                >
                  ×
                </button>
              </header>
              <div className="vehicle-group-list">
                {vehicleGroups.map((group) => (
                  <article key={group.title} className={group.individual ? "individual-dropoff-group" : ""}>
                    <div className="vehicle-group-head">
                      <span>{group.individual ? "⌂" : "▣"}</span>
                      <div>
                        <strong>{group.title}</strong>
                        <small>
                          {group.individual ? "보호자 직접 인계" : "등록된 차량 기준"}
                        </small>
                      </div>
                      <b>{group.students.length}명</b>
                    </div>
                    <div className="vehicle-student-chips">
                      {group.students.length ? (
                        group.students.map((student) => (
                          <button type="button" className="student-profile-link" key={student.id} onClick={() => openStudent(student)}>
                            {student.name}
                          </button>
                        ))
                      ) : (
                        <small>배정된 학생이 없습니다.</small>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              <button
                className="modal-close-button"
                onClick={() => setShowVehicleModal(false)}
              >
                확인
              </button>
            </section>
          </div>
        )}
      </main>
    );
  }
  return (
    <main className="class-page">
      <header className="class-titlebar">
        <button onClick={back} aria-label="이전 화면">
          <Icon name="back" />
        </button>
        <h1>클래스 스케줄</h1>
        <span>▣</span>
      </header>
      <div className="class-date">
        <button onClick={() => moveDate(-1)} aria-label="이전 날짜">
          ‹
        </button>
        <strong>
          ▣ &nbsp;{selected.getFullYear()}년 {selected.getMonth() + 1}월{" "}
          {selected.getDate()}일 ({weekdays[selected.getDay()]})
        </strong>
        <button onClick={() => moveDate(1)} aria-label="다음 날짜">
          ›
        </button>
      </div>
      <nav className="venue-tabs" aria-label="구장 선택">
        {["all", ...classroomNames].map((item) => (
          <button
            key={item}
            className={venue === item ? "active" : ""}
            onClick={() => setVenue(item)}
          >
            {item === "all" ? "전체 강의실" : item}
          </button>
        ))}
      </nav>
      <section
        className={`schedule-table ${venue !== "all" ? "single-venue" : ""}`}
      >
        <div className="table-head">
          <strong>시간</strong>
          {venues.map((item) => (
            <strong key={item}>
              {item} <small>(강의실)</small>
            </strong>
          ))}
        </div>
        {!scheduleRows.length && (
          <div className="class-schedule-empty" role="status">
            <p>선택한 요일에 등록된 클래스 스케줄이 없습니다.</p>
          </div>
        )}
        {scheduleRows.map((row) => (
          <div className="table-row" key={row.time}>
            <div className="time-cell">
              {row.time.split("\n").map((part) => (
                <span key={part}>{part}</span>
              ))}
            </div>
            {venues.map((item) => {
              const lesson = row.cells[item];
              if (!lesson) {
                return <article className="lesson-card empty" key={item} />;
              }
              const lessonStudents = getClassStudents(lesson);
              const openLesson = () => {
                setDeletedStudents([]);
                setSelectedLesson({
                  id: lesson.id,
                  title: lesson.name,
                  time: `${lesson.startTime}~${lesson.endTime}`,
                  info: lessonStudents[0]?.classInfo || `${lesson.days.join("·")}요일 수업`,
                  count: `${lessonStudents.length}명`,
                  venue: lesson.venue || item,
                  students: lessonStudents,
                });
              };
              return (
                <article
                  className="lesson-card clickable"
                  key={item}
                  role="button"
                  tabIndex={0}
                  onClick={openLesson}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      openLesson();
                    }
                  }}
                >
                  <strong>{lesson.name}</strong>
                  <span>{lesson.startTime}~{lesson.endTime}</span>
                  <span>{lesson.venue || item}</span>
                  <small>♙ {lessonStudents.length}명</small>
                </article>
              );
            })}
          </div>
        ))}
      </section>
      <p className="schedule-note">
        * 스케줄은 상황에 따라 변경될 수 있습니다.
      </p>
      <style jsx>{`
        .class-schedule-empty {
          display: grid;
          min-height: 240px;
          border-top: 1px solid #e1e5e8;
          background: #fff;
          place-items: center;
        }

        .class-schedule-empty p {
          margin: 0;
          padding: 24px;
          color: #747d86;
          font-size: 14px;
          font-weight: 700;
          text-align: center;
          word-break: keep-all;
        }

        @media (max-width: 700px) {
          .class-schedule-empty {
            min-height: 180px;
          }

          .class-schedule-empty p {
            padding: 20px 14px;
            font-size: 12px;
          }
        }
      `}</style>
    </main>
  );
}
