"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../src/lib/supabase";
import { Icon } from "../../components/common/Icon";
import { MinuteClockPicker } from "../../components/common/MinuteClockPicker";
import type { ClassOption } from "../../types/class";
import type { Student } from "../../types/student";
import type { VehicleOption } from "../../types/vehicle";
import type { VehicleRunOption } from "../../types/vehicleRun";
import type { OperatingDayKey, OperatingHours } from "../settings/SettingsPages";
import "../../student-pages.css";

type GuardianDraft = { id?: string; name: string; relationship: string; phone: string; isPrimary: boolean };
type RideDraft = { useType: "vehicle" | "individual"; time: string; place: string; vehicleId: string; runId: string; teacherMemberId: string; handoffGuardian: string; memo: string };
type ClassEditor = { mode: "change" | "add"; targetClassId?: string };
type NewClassDraft = { name: string; startTime: string; endTime: string; venue: string };
const emptyRide = (): RideDraft => ({ useType: "vehicle", time: "", place: "", vehicleId: "", runId: "", teacherMemberId: "", handoffGuardian: "", memo: "" });
const dayNumber: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
const dayNameByNumber = ["일", "월", "화", "수", "목", "금", "토"];
const weekdays = ["월", "화", "수", "목", "금", "토", "일"];
const operatingDayKeyByLabel: Record<string, OperatingDayKey> = { 월: "mon", 화: "tue", 수: "wed", 목: "thu", 금: "fri", 토: "sat", 일: "sun" };
const getTimePart = (time: string | undefined, index: number) => time?.split(":")[index]?.padStart(2, "0") ?? "00";
const getHour = (time: string | undefined) => {
  if (!time || !/^\d{1,2}:\d{2}/.test(time)) return null;
  const hour = Number(time.split(":")[0]);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
};
const composeTime = (hour: number | null, minute: string) => hour === null ? "" : `${String(hour).padStart(2, "0")}:${minute}`;

export function StudentEditPage({ student, centerId, classes, vehicles, teachers, managers, operatingHours, initialSection = "class", modal = false, back, onSaved }: {
  student: Student;
  centerId: string;
  classes: ClassOption[];
  vehicles: VehicleOption[];
  teachers: { id: string; name: string }[];
  managers: { id: string; name: string; phone: string; roles: string[] }[];
  operatingHours: OperatingHours;
  initialSection?: "student" | "guardian" | "class" | "ride";
  modal?: boolean;
  back: () => void;
  onSaved: () => Promise<void>;
}) {
  const studentId = student.databaseId ?? "";
  const [studentName, setStudentName] = useState(student.name);
  const [studentBirth, setStudentBirth] = useState(student.birth === "-" ? "" : student.birth);
  const [birthInputMode, setBirthInputMode] = useState<"date" | "age">(student.birth && student.birth !== "-" ? "date" : "age");
  const [manualAge, setManualAge] = useState("");
  const [studentAddress, setStudentAddress] = useState(student.homeAddress ?? "");
  const [enrollmentDate, setEnrollmentDate] = useState("");
  const [availableClasses, setAvailableClasses] = useState(classes);
  const [classIds, setClassIds] = useState<string[]>(student.classId ? [student.classId] : []);
  const [originalClassIds, setOriginalClassIds] = useState<string[]>(student.classId ? [student.classId] : []);
  const [classEditor, setClassEditor] = useState<ClassEditor | null>(null);
  const [classWeekday, setClassWeekday] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [showNewClass, setShowNewClass] = useState(false);
  const [newClass, setNewClass] = useState<NewClassDraft>({ name: "", startTime: "", endTime: "", venue: "" });
  const [guardians, setGuardians] = useState<GuardianDraft[]>([]);
  const [changeType, setChangeType] = useState<"temporary" | "fixed">("fixed");
  const [serviceDate, setServiceDate] = useState("");
  const [weekday, setWeekday] = useState("");
  const [rides, setRides] = useState({ pickup: emptyRide(), dropoff: emptyRide() });
  const [vehicleRuns, setVehicleRuns] = useState<VehicleRunOption[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedRideDay = changeType === "temporary"
    ? serviceDate ? dayNameByNumber[new Date(`${serviceDate}T00:00:00`).getDay()] : ""
    : weekday;
  const selectedDayClasses = availableClasses
    .filter((item) => classIds.includes(item.id) && item.days.includes(selectedRideDay))
    .filter((item) => item.startTime && item.endTime);
  const pickupReferenceClass = [...selectedDayClasses].sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
  const dropoffReferenceClass = [...selectedDayClasses].sort((a, b) => b.endTime.localeCompare(a.endTime))[0];
  const pickupClassHour = getHour(pickupReferenceClass?.startTime);
  const pickupHour = pickupClassHour === null ? null : (pickupClassHour + 23) % 24;
  const dropoffHour = getHour(dropoffReferenceClass?.endTime);
  const normalizedRideTime = (direction: "pickup" | "dropoff", time: string) => {
    const referenceClass = direction === "pickup" ? pickupReferenceClass : dropoffReferenceClass;
    const hour = direction === "pickup" ? pickupHour : dropoffHour;
    const minute = time ? getTimePart(time, 1) : getTimePart(direction === "pickup" ? referenceClass?.startTime : referenceClass?.endTime, 1);
    return composeTime(hour, minute);
  };

  useEffect(() => { setAvailableClasses(classes); }, [classes]);

  useEffect(() => {
    if (!centerId) return;
    void supabase.from("vehicle_runs")
      .select("id,name,days,vehicle_id,scheduled_start,scheduled_end,driver_member_id,companion_member_id,status")
      .eq("center_id", centerId).eq("status", "active").order("scheduled_start")
      .then(({ data }) => setVehicleRuns((data ?? []).map((row) => ({
        id: row.id, name: row.name, days: row.days ?? [], vehicleId: row.vehicle_id,
        startTime: row.scheduled_start?.slice(0, 5) ?? "", endTime: row.scheduled_end?.slice(0, 5) ?? "",
        driverMemberId: row.driver_member_id ?? undefined, companionMemberId: row.companion_member_id ?? undefined, status: "active",
      }))));
  }, [centerId]);

  useEffect(() => {
    if (modal) return;
    window.setTimeout(() => document.getElementById(`student-edit-${initialSection}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [initialSection, modal]);

  useEffect(() => {
    if (!modal) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") back(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [back, modal]);

  useEffect(() => {
    if (!studentId) return;
    void supabase.from("students").select("birth,birth_year,enrollment_date,created_at").eq("id", studentId).maybeSingle().then(({ data }) => {
      setEnrollmentDate(data?.enrollment_date ?? data?.created_at?.slice(0, 10) ?? "");
      if (data?.birth) {
        setStudentBirth(data.birth);
        setBirthInputMode("date");
      } else if (data?.birth_year) {
        setManualAge(String(new Date().getFullYear() - data.birth_year + 1));
        setBirthInputMode("age");
      }
    });
  }, [studentId]);

  useEffect(() => {
    if (!studentId) return;
    void Promise.all([
      supabase.from("student_classes").select("class_id").eq("student_id", studentId),
      supabase.from("student_guardians").select("id,name,relationship,phone,is_primary").eq("student_id", studentId).order("is_primary", { ascending: false }),
    ]).then(([classResult, guardianResult]) => {
      const savedClassIds = (classResult.data ?? []).map((item) => item.class_id);
      if (savedClassIds.length) { setClassIds(savedClassIds); setOriginalClassIds(savedClassIds); }
      setGuardians((guardianResult.data ?? []).map((item) => ({ id: item.id, name: item.name, relationship: item.relationship, phone: item.phone, isPrimary: item.is_primary })));
    });
  }, [studentId]);

  useEffect(() => {
    const targetWeekday = changeType === "temporary"
      ? serviceDate ? new Date(`${serviceDate}T00:00:00`).getDay() : null
      : weekday ? dayNumber[weekday] : null;
    if (!studentId || targetWeekday === null) return;
    void supabase.from("ride_schedules")
      .select("id,direction,ride_time,place,vehicle_id,vehicle_name,run_id,teacher_member_id,handoff_guardian,special_note")
      .eq("student_id", studentId).eq("weekday", targetWeekday).eq("is_active", true)
      .then(async ({ data }) => {
        const next = { pickup: emptyRide(), dropoff: emptyRide() };
        for (const direction of ["pickup", "dropoff"] as const) {
          const row = data?.find((item) => item.direction === direction);
          if (!row) continue;
          next[direction] = { useType: row.vehicle_id ? "vehicle" : "individual", time: row.ride_time?.slice(0, 5) ?? "", place: row.place ?? "", vehicleId: row.vehicle_id ?? "", runId: row.run_id ?? "", teacherMemberId: row.teacher_member_id ?? "", handoffGuardian: row.handoff_guardian ?? "", memo: row.special_note ?? "" };
          if (changeType === "temporary" && serviceDate) {
            const { data: change } = await supabase.from("ride_schedule_changes").select("ride_time,place,handoff_guardian,special_note").eq("ride_schedule_id", row.id).eq("service_date", serviceDate).maybeSingle();
            if (change) next[direction] = { ...next[direction], time: change.ride_time?.slice(0, 5) ?? next[direction].time, place: change.place ?? next[direction].place, handoffGuardian: change.handoff_guardian ?? next[direction].handoffGuardian, memo: change.special_note ?? next[direction].memo };
          }
        }
        setRides(next);
      });
  }, [changeType, serviceDate, studentId, weekday]);

  const openClassEditor = (mode: ClassEditor["mode"], targetClassId?: string) => {
    const target = availableClasses.find((item) => item.id === targetClassId);
    setClassEditor({ mode, targetClassId });
    setClassWeekday(target?.days[0] ?? "");
    setSelectedClassId("");
    setShowNewClass(false);
    setNewClass({ name: "", startTime: "", endTime: "", venue: "" });
  };

  const closeClassEditor = () => {
    setClassEditor(null);
    setClassWeekday("");
    setSelectedClassId("");
    setShowNewClass(false);
  };

  const applySelectedClass = () => {
    if (!classEditor || !classWeekday) { setMessage("요일을 먼저 선택해주세요."); return; }
    if (!selectedClassId) { setMessage("클래스를 선택해주세요."); return; }
    if (classEditor.mode === "add" && classIds.includes(selectedClassId)) { setMessage("이미 소속된 클래스입니다."); return; }
    setClassIds((current) => classEditor.mode === "change"
      ? current.map((id) => id === classEditor.targetClassId ? selectedClassId : id).filter((id, index, all) => all.indexOf(id) === index)
      : [...current, selectedClassId]);
    setMessage("클래스 선택이 반영되었습니다. 아래 저장 버튼을 눌러 확정해주세요.");
    closeClassEditor();
  };

  const createAndSelectClass = async () => {
    if (!classEditor || !classWeekday) { setMessage("요일을 먼저 선택해주세요."); return; }
    if (!newClass.name.trim()) { setMessage("신규 클래스 이름을 입력해주세요."); return; }
    if (!newClass.startTime || !newClass.endTime) { setMessage("수업 시작·종료 시간을 입력해주세요."); return; }
    if (newClass.endTime <= newClass.startTime) { setMessage("종료 시간은 시작 시간보다 늦게 설정해주세요."); return; }
    const selectedOperatingHours = operatingHours[operatingDayKeyByLabel[classWeekday]];
    if (!selectedOperatingHours?.isOpen) { setMessage(`${classWeekday}요일은 센터 휴무일입니다.`); return; }
    if (newClass.startTime < selectedOperatingHours.start || newClass.endTime > selectedOperatingHours.end) {
      setMessage(`${classWeekday}요일 센터 운영 시간(${selectedOperatingHours.start}~${selectedOperatingHours.end}) 안에서 선택해주세요.`);
      return;
    }
    setSaving(true); setMessage("");
    try {
      const { data, error } = await supabase.from("classes").insert({ center_id: centerId, name: newClass.name.trim(), days: [classWeekday], start_time: newClass.startTime, end_time: newClass.endTime, venue: newClass.venue.trim() || null, status: "active" }).select("id,name,days,start_time,end_time,venue").single();
      if (error) throw error;
      const created: ClassOption = { id: data.id, name: data.name, days: data.days ?? [classWeekday], startTime: data.start_time?.slice(0, 5) ?? newClass.startTime, endTime: data.end_time?.slice(0, 5) ?? newClass.endTime, venue: data.venue ?? "", status: "active" };
      setAvailableClasses((current) => [...current, created]);
      setClassIds((current) => classEditor.mode === "change"
        ? current.map((id) => id === classEditor.targetClassId ? created.id : id)
        : [...current, created.id]);
      setMessage("신규 클래스를 만들고 학생에게 선택했습니다. 클래스 정보 저장을 눌러 확정해주세요.");
      closeClassEditor();
    } catch (error) { setMessage(error instanceof Error ? error.message : "신규 클래스를 만들지 못했습니다."); }
    finally { setSaving(false); }
  };
  const updateGuardian = (index: number, values: Partial<GuardianDraft>) => setGuardians((current) => current.map((item, itemIndex) => {
    if (values.isPrimary && itemIndex !== index) return { ...item, isPrimary: false };
    return itemIndex === index ? { ...item, ...values } : item;
  }));
  const updateRide = (direction: "pickup" | "dropoff", values: Partial<RideDraft>) => setRides((current) => ({ ...current, [direction]: { ...current[direction], ...values } }));

  const renderNewClassTimeField = (label: string, field: "startTime" | "endTime") => {
    const value = newClass[field];
    const selectedHour = getHour(value);
    const selectedMinute = getTimePart(value, 1);
    const dayHours = operatingHours[operatingDayKeyByLabel[classWeekday]];
    const openingHour = getHour(dayHours?.start);
    const closingHour = getHour(dayHours?.end);
    const hourOptions = dayHours?.isOpen && openingHour !== null && closingHour !== null
      ? Array.from({ length: closingHour - openingHour + 1 }, (_, index) => openingHour + index)
      : [];

    const updateTime = (hour: number | null, minute: string) => {
      if (hour === null || !dayHours?.isOpen) {
        setNewClass((current) => ({ ...current, [field]: "" }));
        return;
      }
      let nextTime = composeTime(hour, minute);
      if (nextTime < dayHours.start) nextTime = dayHours.start;
      if (nextTime > dayHours.end) nextTime = dayHours.end;
      setNewClass((current) => ({ ...current, [field]: nextTime }));
    };

    return (
      <label>
        <span>{label}</span>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.25fr)", gap: 8 }}>
          <select
            value={selectedHour ?? ""}
            onChange={(event) => {
              const hour = event.target.value === "" ? null : Number(event.target.value);
              updateTime(hour, selectedMinute);
            }}
            disabled={!dayHours?.isOpen}
            aria-label={`${label} 시 선택`}
          >
            <option value="">시 선택</option>
            {hourOptions.map((hour) => (
              <option key={hour} value={hour}>
                {hour < 12 ? "오전" : "오후"} {hour % 12 || 12}시
              </option>
            ))}
          </select>
          <MinuteClockPicker
            hour={selectedHour}
            minute={selectedMinute}
            label={label}
            disabled={!dayHours?.isOpen}
            onChange={(minute) => updateTime(selectedHour, minute)}
          />
        </div>
        <small>{dayHours?.isOpen ? `${classWeekday}요일 운영 시간 ${dayHours.start}~${dayHours.end}` : `${classWeekday || "선택한"}요일은 센터 휴무일입니다.`}</small>
      </label>
    );
  };

  const saveStudentInfo = async () => {
    if (!studentId) throw new Error("학생 정보를 찾지 못했습니다.");
    if (!studentName.trim()) throw new Error("학생 이름을 입력해주세요.");
    if (!enrollmentDate) throw new Error("학원 등록일을 입력해주세요.");
    const age = Number(manualAge);
    if (birthInputMode === "date" && !studentBirth) throw new Error("생년월일을 입력하거나 나이 직접 입력을 선택해주세요.");
    if (birthInputMode === "age" && (!Number.isInteger(age) || age < 1 || age > 30)) throw new Error("현재 나이를 1세부터 30세 사이로 입력해주세요.");
    const birthYear = birthInputMode === "date" ? Number(studentBirth.slice(0, 4)) : new Date().getFullYear() - age + 1;
    const { error } = await supabase.from("students").update({ name: studentName.trim(), birth: birthInputMode === "date" ? studentBirth : null, birth_year: birthYear, enrollment_date: enrollmentDate, home_address: studentAddress.trim() || null }).eq("id", studentId);
    if (error) throw error;
  };

  const saveClasses = async () => {
    if (!studentId || !classIds.length) throw new Error("소속 클래스를 한 개 이상 선택해주세요.");
    const removed = originalClassIds.filter((id) => !classIds.includes(id));
    const classesToDeactivate: string[] = [];
    for (const classId of removed) {
      const { count } = await supabase.from("student_classes").select("id", { count: "exact", head: true }).eq("class_id", classId).neq("student_id", studentId);
      if ((count ?? 0) === 0) {
        const className = availableClasses.find((item) => item.id === classId)?.name ?? "기존 클래스";
        if (window.confirm(`${className}에 소속된 학생이 없습니다. 과거 운행 이력은 유지하고 클래스를 비활성화하시겠습니까?`)) classesToDeactivate.push(classId);
      }
    }
    const { error: deleteError } = await supabase.from("student_classes").delete().eq("student_id", studentId);
    if (deleteError) throw deleteError;
    const { error: insertError } = await supabase.from("student_classes").insert(classIds.map((classId) => ({ center_id: centerId, student_id: studentId, class_id: classId })));
    if (insertError) throw insertError;
    const primaryClass = availableClasses.find((item) => item.id === classIds[0]);
    const classDays = [...new Set(availableClasses.filter((item) => classIds.includes(item.id)).flatMap((item) => item.days))];
    const { error: studentError } = await supabase.from("students").update({ class_id: primaryClass?.id ?? null, class_name: primaryClass?.name ?? "", class_info: classDays.join("·") }).eq("id", studentId);
    if (studentError) throw studentError;
    if (classesToDeactivate.length) await supabase.from("classes").update({ status: "inactive" }).in("id", classesToDeactivate);
    await supabase.from("ride_schedules").update({ is_active: false }).eq("student_id", studentId);
    if (classDays.length) await supabase.from("ride_schedules").update({ is_active: true }).eq("student_id", studentId).in("weekday", classDays.map((day) => dayNumber[day]));
    setOriginalClassIds(classIds);
  };

  const saveGuardians = async () => {
    if (!studentId) throw new Error("학생 정보를 찾지 못했습니다.");
    const valid = guardians.filter((item) => item.name.trim() && item.phone.trim());
    if (valid.length && !valid.some((item) => item.isPrimary)) throw new Error("대표 보호자를 한 명 지정해주세요.");
    const { error: deleteError } = await supabase.from("student_guardians").delete().eq("student_id", studentId);
    if (deleteError) throw deleteError;
    if (valid.length) {
      const { error } = await supabase.from("student_guardians").insert(valid.map((item) => ({ center_id: centerId, student_id: studentId, name: item.name.trim(), relationship: item.relationship.trim(), phone: item.phone.trim(), is_primary: item.isPrimary })));
      if (error) throw error;
      const primary = valid.find((item) => item.isPrimary)!;
      await supabase.from("students").update({ guardian: primary.name.trim(), phone: primary.phone.trim() }).eq("id", studentId);
    }
  };

  const validateRides = () => {
    for (const [direction, ride] of Object.entries(rides)) {
      const label = direction === "pickup" ? "등원" : "하원";
      if (ride.useType === "individual") {
        continue;
      }
      if (!normalizedRideTime(direction as "pickup" | "dropoff", ride.time) || !ride.place.trim()) throw new Error(`${label} 시간과 장소를 입력해주세요. 수업 시간이 등록된 클래스인지도 확인해주세요.`);
      if (!ride.vehicleId) throw new Error(`${label} 차량을 선택해주세요.`);
      if (changeType === "fixed" && !ride.runId) throw new Error(`${label} 운행 회차를 선택해주세요.`);
    }
  };

  const saveRides = async () => {
    if (!studentId) throw new Error("학생 정보를 찾지 못했습니다.");
    validateRides();
    if (changeType === "temporary") {
      if (!serviceDate) throw new Error("임시 변경 날짜를 선택해주세요.");
      const targetWeekday = new Date(`${serviceDate}T00:00:00`).getDay();
      const { data: baseRows, error: baseError } = await supabase.from("ride_schedules").select("id,direction").eq("student_id", studentId).eq("weekday", targetWeekday).eq("is_active", true);
      if (baseError) throw baseError;
      for (const direction of ["pickup", "dropoff"] as const) {
        const base = baseRows?.find((item) => item.direction === direction);
        if (!base) throw new Error(`${direction === "pickup" ? "등원" : "하원"} 기본 스케줄이 없어 임시 변경할 수 없습니다. 먼저 고정 스케줄을 등록해주세요.`);
        const ride = rides[direction];
        const vehicle = vehicles.find((item) => item.id === ride.vehicleId);
        const { error } = await supabase.from("ride_schedule_changes").upsert({ center_id: centerId, ride_schedule_id: base.id, service_date: serviceDate, ride_time: ride.useType === "vehicle" ? normalizedRideTime(direction, ride.time) : null, place: ride.useType === "vehicle" ? ride.place.trim() : null, handoff_guardian: ride.useType === "individual" ? ride.handoffGuardian.trim() || null : null, special_note: [ride.memo.trim(), ride.useType === "vehicle" ? vehicle?.name : null].filter(Boolean).join(" · ") || null, status: "changed", updated_at: new Date().toISOString() }, { onConflict: "ride_schedule_id,service_date" });
        if (error) throw error;
      }
    } else {
      if (!weekday) throw new Error("승·하원 정보를 등록할 요일을 선택해주세요.");
      const rows = (["pickup", "dropoff"] as const).map((direction) => {
        const ride = rides[direction]; const vehicle = vehicles.find((item) => item.id === ride.vehicleId);
        return { center_id: centerId, student_id: studentId, weekday: dayNumber[weekday], direction, ride_time: ride.useType === "vehicle" ? normalizedRideTime(direction, ride.time) : null, place: ride.useType === "vehicle" ? ride.place.trim() : null, run_id: ride.useType === "vehicle" ? ride.runId : null, vehicle_id: ride.useType === "vehicle" ? vehicle?.id ?? null : null, vehicle_name: ride.useType === "vehicle" ? vehicle?.name ?? null : direction === "pickup" ? "개별 등원" : "개별 하원", teacher_member_id: ride.useType === "vehicle" ? ride.teacherMemberId || null : null, handoff_guardian: ride.useType === "individual" ? ride.handoffGuardian.trim() || null : null, special_note: ride.memo.trim() || null, status: "normal", is_active: true, updated_at: new Date().toISOString() };
      });
      const { error } = await supabase.from("ride_schedules").upsert(rows, { onConflict: "student_id,weekday,direction" });
      if (error) throw error;
    }
  };

  const runSave = async (save: () => Promise<void>, success: string) => {
    setSaving(true); setMessage("");
    try { await save(); await onSaved(); if (modal) back(); else setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : "저장하지 못했습니다."); }
    finally { setSaving(false); }
  };

  const sectionTitle = { student: "학생 정보 수정", guardian: "보호자 정보 수정", class: "클래스 정보 수정", ride: "승·하원 정보 수정" }[initialSection];

  const editor = (
    <main className={`student-detail-page student-edit-page${modal ? " student-edit-modal-panel" : ""}`} role={modal ? "dialog" : undefined} aria-modal={modal || undefined} aria-label={modal ? sectionTitle : undefined}>
      <div className="student-edit-topbar">
        <div>{modal && <><strong>{sectionTitle}</strong><p>필요한 내용만 수정한 후 저장해주세요.</p></>}</div>
        <button className="student-back-button" type="button" onClick={back}>{modal ? "닫기" : <><Icon name="back" />학생 상세로</>}</button>
      </div>

      {!modal && <section className="student-edit-heading">
        <span className="student-profile-avatar">{student.name[0]}</span>
        <div>
          <small>학생 정보 수정</small>
          <h1>{student.name}</h1>
          <p>클래스, 보호자, 승·하원 정보를 항목별로 수정할 수 있습니다.</p>
        </div>
      </section>}

      <section className="student-edit-sections">
        {(!modal || initialSection === "student") && <article className="student-edit-card" id="student-edit-student">
          <header><div><span>01</span><h2>학생 정보</h2></div><p>학생의 기본 인적사항을 수정합니다.</p></header>
          <div className="birth-input-tabs"><button type="button" className={birthInputMode === "date" ? "active" : ""} onClick={() => setBirthInputMode("date")}>생년월일 입력</button><button type="button" className={birthInputMode === "age" ? "active" : ""} onClick={() => setBirthInputMode("age")}>나이 직접 입력</button></div>
          <div className="student-edit-fields"><label><span>학생 이름</span><input value={studentName} onChange={(event) => setStudentName(event.target.value)} /></label>{birthInputMode === "date" ? <label><span>생년월일</span><input type="date" value={studentBirth} onChange={(event) => setStudentBirth(event.target.value)} /></label> : <label><span>현재 연령</span><input type="number" min="1" max="30" value={manualAge} onChange={(event) => setManualAge(event.target.value)} placeholder="예: 11" /><small>입력한 나이로 출생연도와 학년을 자동 계산합니다.</small></label>}<label><span>학원 등록일</span><input type="date" value={enrollmentDate} onChange={(event) => setEnrollmentDate(event.target.value)} /></label><label className="wide"><span>집 주소</span><input value={studentAddress} onChange={(event) => setStudentAddress(event.target.value)} placeholder="집 주소" /></label></div>
          <button className="student-save-button" type="button" disabled={saving} onClick={() => void runSave(saveStudentInfo, "학생 정보가 저장되었습니다.")}>학생 정보 저장</button>
        </article>}

        {(!modal || initialSection === "class") && <article className="student-edit-card" id="student-edit-class">
          <header><div><span>02</span><h2>소속 클래스</h2></div><p>클래스를 선택하면 수업 요일도 함께 저장됩니다.</p></header>
          <h3 className="current-class-title">현재 소속 클래스</h3>
          <div className="current-class-list">
            {classIds.map((classId, index) => {
              const item = availableClasses.find((classItem) => classItem.id === classId);
              if (!item) return null;
              return <section className="current-class-card" key={classId}><div><span>{index === 0 ? "대표 클래스" : "추가 클래스"}</span><strong>{item.name}</strong><small>{item.days.join(" · ") || "요일 미등록"}{item.startTime ? ` · ${item.startTime}~${item.endTime}` : ""}</small></div><div className="current-class-actions"><button type="button" onClick={() => openClassEditor("change", classId)}>변경</button>{classIds.length > 1 && <button className="remove" type="button" onClick={() => setClassIds((current) => current.filter((id) => id !== classId))}>삭제</button>}</div></section>;
            })}
          </div>
          {!classEditor && <button className="student-add-button class-add-trigger" type="button" onClick={() => openClassEditor("add")}>+ 클래스 추가</button>}

          {classEditor && <section className="class-editor-panel">
            <div className="class-editor-heading"><div><strong>{classEditor.mode === "change" ? "소속 클래스 변경" : "클래스 추가"}</strong><p>요일을 선택하면 해당 요일에 운영되는 클래스만 표시됩니다.</p></div><button type="button" onClick={closeClassEditor}>닫기</button></div>
            <fieldset className="class-weekday-field"><legend>1. 수업 요일 선택</legend><div>{weekdays.map((day) => <button type="button" key={day} className={classWeekday === day ? "active" : ""} onClick={() => { setClassWeekday(day); setSelectedClassId(""); setShowNewClass(false); }}>{day}</button>)}</div></fieldset>
            {classWeekday && <div className="class-choice-section"><strong>2. {classWeekday}요일 클래스 선택</strong><div className="filtered-class-list">
              {availableClasses.filter((item) => item.days.includes(classWeekday)).map((item) => <button type="button" key={item.id} className={selectedClassId === item.id ? "active" : ""} disabled={classEditor.mode === "add" && classIds.includes(item.id)} onClick={() => { setSelectedClassId(item.id); setShowNewClass(false); }}><strong>{item.name}</strong><small>{item.startTime && item.endTime ? `${item.startTime}~${item.endTime}` : "시간 미등록"}{item.venue ? ` · ${item.venue}` : ""}</small>{classIds.includes(item.id) && <em>현재 소속</em>}</button>)}
              {!availableClasses.some((item) => item.days.includes(classWeekday)) && <p className="class-empty-message">이 요일에 등록된 클래스가 없습니다.</p>}
            </div><div className="class-editor-actions"><button className="student-add-button" type="button" onClick={() => { setShowNewClass(true); setSelectedClassId(""); }}>+ 신규 클래스 만들기</button>{selectedClassId && <button className="student-save-button" type="button" onClick={applySelectedClass}>선택 완료</button>}</div></div>}

            {showNewClass && <div className="new-class-form"><strong>신규 클래스 정보</strong><div className="student-edit-fields"><label className="wide"><span>클래스명</span><input value={newClass.name} onChange={(event) => setNewClass((current) => ({ ...current, name: event.target.value }))} placeholder={`${classWeekday}요일 신규 클래스`} /></label>{renderNewClassTimeField("시작 시간", "startTime")}{renderNewClassTimeField("종료 시간", "endTime")}<label className="wide"><span>수업 장소</span><input value={newClass.venue} onChange={(event) => setNewClass((current) => ({ ...current, venue: event.target.value }))} placeholder="선택 입력" /></label></div><button className="student-save-button" type="button" disabled={saving} onClick={() => void createAndSelectClass()}>신규 클래스 생성 및 선택</button></div>}
          </section>}
          <div className="class-save-row"><button className="student-save-button" type="button" disabled={saving || !classIds.length} onClick={() => void runSave(saveClasses, "소속 클래스와 수업 요일이 저장되었습니다.")}>클래스 정보 저장</button></div>
        </article>}

        {(!modal || initialSection === "guardian") && <article className="student-edit-card" id="student-edit-guardian">
          <header><div><span>03</span><h2>보호자 정보</h2></div><p>대표 보호자는 한 명만 선택할 수 있습니다.</p></header>
          <div className="guardian-edit-list">
            {guardians.map((guardian, index) => (
              <fieldset key={guardian.id ?? index} className="guardian-edit-card">
                <legend>보호자 {index + 1}</legend>
                <div className="student-edit-fields">
                  <label><span>이름</span><input value={guardian.name} onChange={(event) => updateGuardian(index, { name: event.target.value })} placeholder="보호자 이름" /></label>
                  <label><span>관계</span><input value={guardian.relationship} onChange={(event) => updateGuardian(index, { relationship: event.target.value })} placeholder="예: 어머니" /></label>
                  <label className="wide"><span>연락처</span><input value={guardian.phone} onChange={(event) => updateGuardian(index, { phone: event.target.value })} placeholder="010-0000-0000" /></label>
                </div>
                <div className="guardian-edit-actions">
                  <label className="primary-guardian-check"><input type="radio" name="primaryGuardian" checked={guardian.isPrimary} onChange={() => updateGuardian(index, { isPrimary: true })} /><span>대표 보호자</span></label>
                  <button type="button" onClick={() => setGuardians((current) => current.filter((_, itemIndex) => itemIndex !== index))}>삭제</button>
                </div>
              </fieldset>
            ))}
          </div>
          <div className="student-card-actions">
            <button className="student-add-button" type="button" onClick={() => setGuardians((current) => [...current, { name: "", relationship: "", phone: "", isPrimary: current.length === 0 }])}>+ 보호자 추가</button>
            <button className="student-save-button" type="button" disabled={saving} onClick={() => void runSave(saveGuardians, "보호자 정보가 저장되었습니다.")}>보호자 정보 저장</button>
          </div>
        </article>}

        {(!modal || initialSection === "ride") && <article className="student-edit-card student-ride-edit-card" id="student-edit-ride">
          <header><div><span>04</span><h2>승·하원 정보</h2></div><p>요일별 기본 스케줄을 추가하거나 특정 날짜만 임시 변경할 수 있습니다.</p></header>
          <div className="ride-type-tabs"><button type="button" className={changeType === "fixed" ? "active" : ""} onClick={() => setChangeType("fixed")}>요일별 등록·변경</button><button type="button" className={changeType === "temporary" ? "active" : ""} onClick={() => setChangeType("temporary")}>특정 날짜 임시 변경</button></div>
          <label className="student-apply-field"><span>{changeType === "temporary" ? "적용 날짜" : "적용 요일"}</span>{changeType === "temporary" ? <input type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} /> : <select value={weekday} onChange={(event) => setWeekday(event.target.value)}><option value="">요일 선택</option>{[...new Set(availableClasses.filter((item) => classIds.includes(item.id)).flatMap((item) => item.days))].map((day) => <option key={day}>{day}</option>)}</select>}</label>
          <div className="ride-edit-grid">
            {(["pickup", "dropoff"] as const).map((direction) => {
              const ride = rides[direction];
              const label = direction === "pickup" ? "등원" : "하원";
              const referenceClass = direction === "pickup" ? pickupReferenceClass : dropoffReferenceClass;
              const fixedHour = direction === "pickup" ? pickupHour : dropoffHour;
              const defaultMinute = getTimePart(direction === "pickup" ? referenceClass?.startTime : referenceClass?.endTime, 1);
              const selectedMinute = ride.time ? getTimePart(ride.time, 1) : defaultMinute;
              const selectedDayNumber = changeType === "temporary"
                ? serviceDate ? new Date(`${serviceDate}T00:00:00`).getDay() : null
                : weekday ? dayNumber[weekday] : null;
              const availableRuns = selectedDayNumber === null ? [] : vehicleRuns.filter((run) => run.days.includes(selectedDayNumber));
              const selectedRun = vehicleRuns.find((run) => run.id === ride.runId);
              const runVehicle = vehicles.find((vehicle) => vehicle.id === selectedRun?.vehicleId);
              const runDriver = managers.find((manager) => manager.id === selectedRun?.driverMemberId);
              const runCompanion = managers.find((manager) => manager.id === selectedRun?.companionMemberId);
              return (
                <fieldset key={direction} className="ride-edit-card">
                  <legend>{label} 정보</legend>
                  <div className="student-edit-fields">
                    <label><span>이동 방식</span><select value={ride.useType} onChange={(event) => { const useType = event.target.value as RideDraft["useType"]; updateRide(direction, { useType, vehicleId: useType === "individual" ? "" : ride.vehicleId, runId: useType === "individual" ? "" : ride.runId, teacherMemberId: useType === "individual" ? "" : ride.teacherMemberId, time: useType === "individual" ? "" : ride.time, place: useType === "individual" ? "" : ride.place }); }}><option value="vehicle">차량 이용</option><option value="individual">개별 {label}</option></select></label>
                    {ride.useType === "vehicle" && <div className="ride-time-field"><span>{label} 시간</span><MinuteClockPicker hour={fixedHour} minute={selectedMinute} label={label} disabled={fixedHour === null} onChange={(minute) => updateRide(direction, { time: composeTime(fixedHour, minute) })} /><small className="ride-time-helper">{referenceClass ? `${referenceClass.name} ${direction === "pickup" ? "시작 1시간 전" : "종료"} 기준` : "선택한 요일에 수업 시간이 등록된 클래스가 없습니다."}</small></div>}
                    {ride.useType === "vehicle" && <label className="wide"><span>{label} 장소</span><input value={ride.place} onChange={(event) => updateRide(direction, { place: event.target.value })} placeholder={`${label} 장소`} /></label>}
                    {ride.useType === "vehicle" && <label className="wide"><span>운행 회차</span><select value={ride.runId} disabled={selectedDayNumber === null || !availableRuns.length || changeType === "temporary"} onChange={(event) => { const run = vehicleRuns.find((item) => item.id === event.target.value); updateRide(direction, { runId: event.target.value, vehicleId: run?.vehicleId ?? "" }); }}><option value="">{selectedDayNumber === null ? "요일을 먼저 선택해주세요" : availableRuns.length ? "운행 회차 선택" : "해당 요일에 등록된 회차가 없습니다"}</option>{availableRuns.map((run) => <option key={run.id} value={run.id}>{run.startTime} ~ {run.endTime} · {run.name}</option>)}</select>{changeType === "temporary" && <small>임시 변경에서는 기존 회차가 유지됩니다.</small>}</label>}
                    {ride.useType === "vehicle" && <div className="wide ride-run-link-summary"><div><span>차량</span><strong>{runVehicle ? `${runVehicle.name} · ${runVehicle.number}` : "회차 선택 시 자동 연결"}</strong></div><div><span>기사</span><strong>{runDriver ? `${runDriver.name} · ${runDriver.phone}` : selectedRun ? "미배정" : "회차 선택 시 자동 연결"}</strong></div><div><span>동승자</span><strong>{runCompanion ? `${runCompanion.name} · ${runCompanion.phone}` : selectedRun ? "없음" : "회차 선택 시 자동 연결"}</strong></div></div>}
                    {ride.useType === "vehicle" ? <label className="wide"><span>담당 선생님</span><select value={ride.teacherMemberId} onChange={(event) => updateRide(direction, { teacherMemberId: event.target.value })}><option value="">선택 안 함</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label> : <label className="wide"><span>인계 보호자 <small>선택</small></span><input value={ride.handoffGuardian} onChange={(event) => updateRide(direction, { handoffGuardian: event.target.value })} placeholder={direction === "pickup" ? "선택 입력 · 예: 어머니가 센터에 인계" : "선택 입력 · 예: 아버지가 직접 인계"} /></label>}
                    <label className="wide"><span>특이사항</span><textarea value={ride.memo} onChange={(event) => updateRide(direction, { memo: event.target.value })} placeholder="특이사항을 입력해주세요." /></label>
                  </div>
                </fieldset>
              );
            })}
          </div>
          <button className="student-save-button" type="button" disabled={saving} onClick={() => void runSave(saveRides, changeType === "temporary" ? "선택한 날짜의 승하원 정보가 변경되었습니다." : "선택한 요일의 승하원 정보가 저장되었습니다.")}>{changeType === "temporary" ? "임시 변경 저장" : "요일별 승하원 저장"}</button>
        </article>}
      </section>
      {message && <p className="student-edit-message" role="status">{message}</p>}
    </main>
  );

  if (!modal) return editor;
  return <div className="student-edit-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) back(); }}>{editor}</div>;
}
