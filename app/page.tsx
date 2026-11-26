"use client";

import { useEffect, useState } from "react";
import { supabase } from "../src/lib/supabase";
import { Icon } from "./components/common/Icon";
import { AppHeader } from "./components/layout/AppHeader";
import {
  DesktopNavigation,
  MobileNavigation,
} from "./components/layout/AppNavigation";
import type { View } from "./types/navigation";
import { StudentDetailPage } from "./pages/students/StudentDetailPage";
import { StudentListPage } from "./pages/students/StudentListPage";
import { StudentRegisterPage } from "./pages/students/StudentRegisterPage";
import type { Student } from "./types/student";
import {
  CalendarPage,
  CenterTimetablePage,
  ChangeChoicePage,
  ClassSchedulePage,
  NoSchedulePage,
  pad,
  SameDayViewChoicePage,
  TimelinePage,
  VehicleDayPage,
  VehicleViewChoicePage,
  ViewChoicePage,
} from "./pages/operations/OperationsPages";
import {
  CenterManagementPage,
  CenterSettingsPage,
  ClassManagementPage,
  ManagerManagementPage,
  SettingRegistrationPage,
  SettingsPage,
  VehicleRunManagementPage,
  VehicleRunReassignmentPage,
} from "./pages/settings/SettingsPages";
import type { OperatingDayKey, OperatingHours, RegisteredManager } from "./pages/settings/SettingsPages";
import type { ClassOption } from "./types/class";
import type { VehicleOption } from "./types/vehicle";
import type { ClassroomOption } from "./types/classroom";
import type { VehicleRunOption } from "./types/vehicleRun";

const students: Student[] = [];

const DEFAULT_OPERATING_HOURS: OperatingHours = {
  mon: { isOpen: true, start: "13:00", end: "21:00" }, tue: { isOpen: true, start: "13:00", end: "21:00" },
  wed: { isOpen: true, start: "13:00", end: "21:00" }, thu: { isOpen: true, start: "13:00", end: "21:00" },
  fri: { isOpen: true, start: "13:00", end: "21:00" }, sat: { isOpen: true, start: "10:00", end: "18:00" },
  sun: { isOpen: false, start: "10:00", end: "18:00" },
};

const OPERATING_DAY_KEYS: OperatingDayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function normalizeOperatingHours(value: unknown): OperatingHours {
  if (!value || typeof value !== "object") return structuredClone(DEFAULT_OPERATING_HOURS);
  const source = value as Partial<OperatingHours>;
  const normalizedDays = Object.fromEntries(OPERATING_DAY_KEYS.map((key) => {
    const fallback = DEFAULT_OPERATING_HOURS[key];
    const saved = source[key];
    return [key, { isOpen: typeof saved?.isOpen === "boolean" ? saved.isOpen : fallback.isOpen, start: saved?.start || fallback.start, end: saved?.end || fallback.end }];
  })) as Record<OperatingDayKey, OperatingHours[OperatingDayKey]>;
  return {
    ...normalizedDays,
    _defaults: source._defaults ?? {
      weekday: { start: normalizedDays.mon.start, end: normalizedDays.mon.end },
      weekend: { start: normalizedDays.sat.start, end: normalizedDays.sat.end },
    },
    _overrides: Array.isArray(source._overrides) ? source._overrides.filter((key): key is OperatingDayKey => OPERATING_DAY_KEYS.includes(key as OperatingDayKey)) : undefined,
  };
}

type StudentRow = {
  id: string;
  student_code: string;
  name: string;
  birth: string | null;
  class_name: string;
  class_info: string;
  class_id: string | null;
  teacher_member_id: string | null;
  pickup_place: string;
  pickup_info: string;
  dropoff_place: string;
  dropoff_info: string;
  guardian: string;
  phone: string;
  photo_name: string | null;
  home_address: string | null;
  handoff_guardian: string | null;
  ride_notes: string | null;
  general_notes: string | null;
};

type StudentRideScheduleRow = {
  student_id: string;
  weekday: number;
  direction: "pickup" | "dropoff";
  ride_time: string | null;
  place: string | null;
  vehicle_name: string | null;
};

const RIDE_WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const RIDE_WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function applyRideScheduleSummary(
  student: Student,
  schedules: StudentRideScheduleRow[],
): Student {
  const summarize = (direction: "pickup" | "dropoff") => {
    const directionSchedules = schedules
      .filter((schedule) => schedule.direction === direction)
      .sort((left, right) => {
        const dayDifference =
          RIDE_WEEKDAY_ORDER.indexOf(left.weekday) -
          RIDE_WEEKDAY_ORDER.indexOf(right.weekday);
        return dayDifference ||
          (left.ride_time ?? "99:99").localeCompare(right.ride_time ?? "99:99");
      });
    const first = directionSchedules[0];
    if (!first) return null;

    const weekday = RIDE_WEEKDAY_NAMES[first.weekday] ?? "요일 미등록";
    const time = first.ride_time?.slice(0, 5) || "시간 미등록";
    const vehicle = first.vehicle_name?.trim();
    const individualLabel = direction === "pickup" ? "개별 등원" : "개별 하원";
    const isIndividual = vehicle === individualLabel || vehicle?.startsWith("개별 ");
    const remaining = directionSchedules.length - 1;

    return {
      place: isIndividual
        ? individualLabel
        : first.place?.trim() || "장소 미등록",
      info: [
        isIndividual ? weekday : `${weekday} ${time}`,
        isIndividual ? "" : vehicle,
        remaining > 0 ? `외 ${remaining}개 일정` : "",
      ].filter(Boolean).join(" · "),
    };
  };

  const pickup = summarize("pickup");
  const dropoff = summarize("dropoff");
  return {
    ...student,
    pickupPlace: pickup?.place ?? student.pickupPlace,
    pickupInfo: pickup?.info ?? student.pickupInfo,
    dropoffPlace: dropoff?.place ?? student.dropoffPlace,
    dropoffInfo: dropoff?.info ?? student.dropoffInfo,
  };
}

const toStudent = (row: StudentRow): Student => ({
  databaseId: row.id,
  id: row.student_code,
  name: row.name,
  birth: row.birth || "-",
  className: row.class_name || "미등록",
  classInfo: row.class_info || "",
  classId: row.class_id || undefined,
  teacherMemberId: row.teacher_member_id || undefined,
  pickupPlace: row.pickup_place || "미등록",
  pickupInfo: row.pickup_info || "",
  dropoffPlace: row.dropoff_place || "미등록",
  dropoffInfo: row.dropoff_info || "",
  guardian: row.guardian || "-",
  phone: row.phone || "-",
  photoName: row.photo_name || "",
  homeAddress: row.home_address || "",
  handoffGuardian: row.handoff_guardian || "",
  rideNotes: row.ride_notes || "",
  generalNotes: row.general_notes || "",
});

const cards = [
  {
    view: "calendar" as View,
    icon: "bus" as const,
    title: "운행 정보",
    desc: "날짜를 선택해 차량 운행 스케줄과 도착 예정 시간을 확인합니다.",
    action: "둘러보기",
  },
  {
    view: "center-timetable" as View,
    icon: "list" as const,
    title: "센터 시간표",
    desc: "요일별 클래스와 차량 운행 회차를 한눈에 확인합니다.",
    action: "시간표 보기",
  },
  {
    view: "student-register" as View,
    icon: "list" as const,
    title: "학생 등록",
    desc: "학생 기본 정보와 정기 승하원 스케줄을 함께 등록합니다.",
    action: "학생 등록하기",
  },
  {
    view: "change-choice" as View,
    icon: "edit" as const,
    title: "변경하기",
    desc: "당일 탑승 정보 또는 차량 운행 스케줄을 수정합니다.",
    action: "관리하기",
  },
];

function Home({
  navigate,
  userName,
}: {
  navigate: (view: View) => void;
  userName: string;
}) {
  return (
    <main className="home">
      <section className="intro">
        <p className="eyebrow">차량 운행 관리</p>
        <h1>안녕하세요, {userName}님</h1>
        <p>오늘의 차량 운행 현황과 변경 사항을 확인하세요.</p>
        <button className="home-history-button" type="button" onClick={() => navigate("history")}>
          <Icon name="list" />
          <span>금일 운행 변경 내용</span>
          <b aria-hidden="true">→</b>
        </button>
      </section>
      <section className="card-grid" aria-label="주요 메뉴">
        {cards.map((card, index) => (
          <button
            key={card.view}
            className={`menu-card ${index === 0 ? "primary" : ""}`}
            onClick={() => navigate(card.view)}
          >
            <span className="icon-box">
              <Icon name={card.icon} />
            </span>
            <span className="card-copy">
              <strong>{card.title}</strong>
              <span>{card.desc}</span>
            </span>
            <span className="card-action">
              {card.action}
              <b>→</b>
            </span>
          </button>
        ))}
      </section>
      <style jsx>{`
        .intro{position:relative;padding-right:250px}.home-history-button{position:absolute;top:0;right:0;display:flex;align-items:center;gap:9px;min-height:44px;padding:0 15px;border:1px solid #d9dee2;border-radius:11px;background:#fff;color:#202328;font-size:12px;font-weight:900;cursor:pointer;box-shadow:0 3px 10px rgba(32,35,40,.06)}.home-history-button:hover{border-color:#202328;transform:translateY(-1px)}.home-history-button :global(svg){width:17px;height:17px}.home-history-button b{margin-left:3px;font-size:14px}@media(max-width:700px){.intro{padding-right:0}.home-history-button{position:static;width:100%;justify-content:center;margin-top:17px;font-size:11px}.home-history-button b{margin-left:auto}}
      `}</style>
    </main>
  );
}

function RegisterChoicePage({
  choose,
  back,
}: {
  choose: (view: "student-register" | "register" | "companion-schedule-register") => void;
  back: () => void;
}) {
  return (
    <main className="choice-page">
      <section className="choice-head">
        <span className="choice-date">정보 등록</span>
        <h1>무엇을 등록할까요?</h1>
        <p>새로 등록할 정보의 유형을 선택해주세요.</p>
      </section>
      <section className="view-options">
        <button
          className="view-option timeline-option"
          onClick={() => choose("student-register")}
        >
          <span className="view-icon">
            <Icon name="edit" />
          </span>
          <span className="view-copy">
            <strong>학생 등록하기</strong>
            <small>
              학생과 보호자 연락처, 소속 클래스 등 기본 정보를 등록합니다.
            </small>
          </span>
          <b>›</b>
        </button>
        <button className="view-option" onClick={() => choose("register")}>
          <span className="view-icon">
            <Icon name="bus" />
          </span>
          <span className="view-copy">
            <strong>스케줄 등록하기</strong>
            <small>
              학생의 등원·하원 요일, 시간, 장소와 이용 차량을 등록합니다.
            </small>
          </span>
          <b>›</b>
        </button>
        <button className="view-option" onClick={() => choose("companion-schedule-register")}>
          <span className="view-icon"><Icon name="list" /></span>
          <span className="view-copy">
            <strong>동승자 스케줄 등록</strong>
            <small>설정에 등록된 동승자를 차량 운행 스케줄별로 배정합니다.</small>
          </span>
          <b>›</b>
        </button>
      </section>
    </main>
  );
}

const companionScheduleNames: string[] = [];

function CompanionScheduleRegisterPage({ back, companionOptions, assignments, save }: {
  back: () => void;
  companionOptions: RegisteredManager[];
  assignments: Record<string, string>;
  save: (assignments: Record<string, string>) => void;
}) {
  const [vehicle, setVehicle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [draft, setDraft] = useState<Record<string, string>>(assignments);
  const [saved, setSaved] = useState(false);
  const assignmentKey = (schedule: string) => `${date}|${vehicle}|${schedule}`;
  return (
    <main className="register-page companion-register-page">
      <button className="back" onClick={back}><Icon name="back" />등록 유형 선택</button>
      <section className="register-head">
        <span>운행 담당 배정</span><h1>동승자 스케줄 등록</h1>
        <p>날짜와 차량을 선택한 뒤 각 운행 스케줄의 동승자를 배정해주세요.</p>
      </section>
      <form className="register-form" onSubmit={(event) => { event.preventDefault(); save(draft); setSaved(true); window.setTimeout(() => setSaved(false), 2500); }}>
        <section className="form-section">
          <h2>운행 기준</h2>
          <div className="form-grid">
            <label><span>운행 날짜</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
            <label><span>차량</span><select value={vehicle} onChange={(event) => setVehicle(event.target.value)}><option value="">등록된 차량이 없습니다</option></select></label>
          </div>
        </section>
        <section className="form-section companion-assignment-section">
          <h2>스케줄별 동승자</h2>
          <div className="companion-assignment-list">
            {!companionScheduleNames.length && <p className="empty-state">등록된 운행 스케줄이 없습니다.</p>}
            {companionScheduleNames.map((schedule) => (
              <label key={schedule}>
                <span>{schedule}</span>
                <select value={draft[assignmentKey(schedule)] ?? ""} onChange={(event) => setDraft((current) => ({ ...current, [assignmentKey(schedule)]: event.target.value }))}>
                  <option value="">동승자 선택</option>
                  {companionOptions.map((manager) => <option key={manager.id} value={manager.name}>{manager.name}</option>)}
                </select>
              </label>
            ))}
          </div>
        </section>
        {saved && <p className="save-message" role="status">동승자 스케줄이 저장되었습니다.</p>}
        <button className="register-submit" type="submit">동승자 스케줄 저장하기</button>
      </form>
    </main>
  );
}

function getClassRideTimes(className: string, classes: ClassOption[]) {
  const classItem = classes.find((item) => item.name === className);
  if (!classItem) return null;
  const start = classItem.startTime;
  const end = classItem.endTime;
  const [hour, minute] = start.split(":").map(Number);
  const pickupMinutes = (hour * 60 + minute - 60 + 1440) % 1440;
  return { start, end, 등원: `${pad(Math.floor(pickupMinutes / 60))}:${pad(pickupMinutes % 60)}`, 하원: end };
}

function RegisterPage({ back, centerId, studentRows, classes, vehicles, teachers, managers, onSaveSchedule }: {
  back: () => void;
  centerId: string;
  studentRows: Student[];
  classes: ClassOption[];
  vehicles: VehicleOption[];
  teachers: { id: string; name: string }[];
  managers: RegisteredManager[];
  onSaveSchedule: (schedule: {
    student: Student;
    day: string;
    rides: Array<{
      direction: "pickup" | "dropoff";
      useType: "vehicle" | "individual";
      time: string;
      place: string;
      vehicle?: VehicleOption;
      teacherMemberId?: string;
      runId?: string;
      memo: string;
    }>;
  }) => Promise<void>;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [day, setDay] = useState("");
  const [className, setClassName] = useState("");
  const [studentId, setStudentId] = useState("");
  const dayStudents = studentRows.filter((student) => {
    const classItem = classes.find((item) => student.classId ? item.id === student.classId : item.name === student.className);
    return classItem?.days.includes(day) ?? false;
  });
  const availableClasses = classes.filter((item) => item.days.includes(day) && dayStudents.some((student) => student.classId === item.id || student.className === item.name));
  const studentOptions = dayStudents.filter((student) => student.classId === availableClasses.find((item) => item.name === className)?.id || student.className === className);
  const selectedStudent = studentOptions.find((student) => student.id === studentId);
  const canContinue = Boolean(day && className && selectedStudent);
  type RideLabel = "등원" | "하원";
  type RideDraft = {
    useType: "" | "vehicle" | "individual";
    time: string;
    place: string;
    vehicleId: string;
    teacherMemberId: string;
    runId: string;
    memo: string;
  };
  const emptyRide = (): RideDraft => ({ useType: "", time: "", place: "", vehicleId: "", teacherMemberId: "", runId: "", memo: "" });
  const [runOptions, setRunOptions] = useState<VehicleRunOption[]>([]);
  useEffect(() => {
    if (!centerId || !day) { setRunOptions([]); return; }
    const weekday = ({ 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 } as Record<string, number>)[day];
    void supabase.from("vehicle_runs").select("id,name,days,vehicle_id,scheduled_start,scheduled_end,driver_member_id,companion_member_id,status")
      .eq("center_id", centerId).eq("status", "active").contains("days", [weekday]).order("scheduled_start")
      .then(({ data }) => setRunOptions((data ?? []).map((row) => ({ id: row.id, name: row.name, days: row.days ?? [], vehicleId: row.vehicle_id, startTime: row.scheduled_start?.slice(0, 5) ?? "", endTime: row.scheduled_end?.slice(0, 5) ?? "", driverMemberId: row.driver_member_id ?? undefined, companionMemberId: row.companion_member_id ?? undefined, status: "active" }))));
  }, [centerId, day]);
  const [rideType, setRideType] = useState<RideLabel>("등원");
  const [rideDrafts, setRideDrafts] = useState<Record<RideLabel, RideDraft>>({ 등원: emptyRide(), 하원: emptyRide() });
  const [saved, setSaved] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const classTimes = getClassRideTimes(className, classes);
  const currentRide = rideDrafts[rideType];
  const selectedRun = runOptions.find((run) => run.id === currentRide.runId);
  const selectedRunVehicle = vehicles.find((vehicle) => vehicle.id === selectedRun?.vehicleId);
  const selectedRunDriver = managers.find((manager) => manager.id === selectedRun?.driverMemberId);
  const selectedRunCompanion = managers.find((manager) => manager.id === selectedRun?.companionMemberId);
  const rideTime = currentRide.time || classTimes?.[rideType] || "";
  const [rideHour = "", rideMinute = ""] = rideTime.split(":");
  const updateCurrentRide = (values: Partial<RideDraft>) => {
    setRideDrafts((current) => ({ ...current, [rideType]: { ...current[rideType], ...values } }));
    setSaved(false);
    setScheduleError("");
  };
  const updateRideTime = (hour: string, minute: string) => {
    updateCurrentRide({ time: `${hour}:${minute}` });
  };
  const resetRideDrafts = () => {
    setRideType("등원");
    setRideDrafts({ 등원: emptyRide(), 하원: emptyRide() });
  };
  const validateRide = (label: RideLabel) => {
    const draft = rideDrafts[label];
    const time = draft.time || classTimes?.[label] || "";
    if (!draft.useType) return `${label} 이용 방법을 선택해주세요.`;
    if (!time) return `${label} 시간을 선택해주세요.`;
    if (!draft.place.trim()) return `${label} 장소를 입력해주세요.`;
    if (draft.useType === "vehicle" && !draft.vehicleId) return `${label} 차량을 선택해주세요.`;
    if (draft.useType === "vehicle" && !draft.runId) return `${label} 운행 회차를 선택해주세요.`;
    return "";
  };
  return (
    <main className="register-page">
      <button className="back" onClick={back}>
        <Icon name="back" />
        홈으로
      </button>
      <section className="register-head">
        <span>승하원 스케줄 등록</span>
        <h1>{step === 1 ? "기본 정보를 선택해주세요" : "승·하원 정보를 입력해주세요"}</h1>
        <p>{step === 1 ? "요일, 클래스, 학생 순서로 선택해주세요." : `${day}요일 · ${className} · ${selectedStudent?.name ?? ""}`}</p>
      </section>
      <ol className="registration-steps" aria-label="등록 단계">
        <li aria-current={step === 1 ? "step" : undefined}>1. 기본 정보</li>
        <li aria-current={step === 2 ? "step" : undefined}>2. 승·하원 정보</li>
      </ol>
      <form
        className="register-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!canContinue) return;
          if (step === 1) {
            setStep(2);
            window.scrollTo({ top: 0 });
            return;
          }
          if (!selectedStudent) return;
          if (rideType === "등원") {
            const validationError = validateRide("등원");
            if (validationError) {
              setScheduleError(validationError);
              return;
            }
            setRideType("하원");
            setScheduleError("");
            window.scrollTo({ top: 0 });
            return;
          }
          const pickupError = validateRide("등원");
          const dropoffError = validateRide("하원");
          if (pickupError || dropoffError) {
            setScheduleError(pickupError || dropoffError);
            if (pickupError) setRideType("등원");
            return;
          }
          try {
            setScheduleError("");
            await onSaveSchedule({
              student: selectedStudent,
              day,
              rides: (["등원", "하원"] as RideLabel[]).map((label) => {
                const draft = rideDrafts[label];
                return {
                  direction: label === "등원" ? "pickup" as const : "dropoff" as const,
                  useType: draft.useType as "vehicle" | "individual",
                  time: draft.time || classTimes?.[label] || "",
                  place: draft.place.trim(),
                  vehicle: draft.useType === "vehicle" ? vehicles.find((item) => item.id === draft.vehicleId) : undefined,
                  teacherMemberId: draft.teacherMemberId || undefined,
                  runId: draft.runId || undefined,
                  memo: draft.memo.trim(),
                };
              }),
            });
            setSaved(true);
          } catch (error) {
            setScheduleError(error instanceof Error ? error.message : "승하원 스케줄을 저장하지 못했습니다.");
          }
        }}
      >
        <section className="form-section" hidden={step !== 1}>
          <h2>기본 정보</h2>
          <div className="form-grid">
            <label className="wide">
              <span>요일 선택</span>
              <select required value={day} onChange={(event) => {
                setDay(event.target.value); setClassName(""); setStudentId(""); setSaved(false); resetRideDrafts();
              }}>
                <option value="" disabled>요일을 선택해주세요</option>
                {["월", "화", "수", "목", "금", "토", "일"].map((value) => <option key={value} value={value}>{value}요일</option>)}
              </select>
            </label>
            <label className="wide">
              <span>클래스 선택</span>
              <select required disabled={!day || !availableClasses.length} value={className} onChange={(event) => {
                setClassName(event.target.value); setStudentId(""); setSaved(false); resetRideDrafts();
              }}>
                <option value="" disabled>{day ? "클래스를 선택해주세요" : "요일을 먼저 선택해주세요"}</option>
                {availableClasses.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
              </select>
              {day && !availableClasses.length && <small role="status">해당 요일에 학생이 등록된 클래스가 없습니다. 학생의 수업 요일과 클래스를 먼저 등록해주세요.</small>}
            </label>
            <label className="wide">
              <span>학생 선택</span>
              <select required disabled={!className} value={studentId} onChange={(event) => { setStudentId(event.target.value); setSaved(false); resetRideDrafts(); }}>
                <option value="" disabled>{className ? "학생을 선택해주세요" : "클래스를 먼저 선택해주세요"}</option>
                {studentOptions.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
              </select>
            </label>
          </div>
        </section>
        <fieldset className="form-section ride-info-step" hidden={step !== 2} disabled={step !== 2}>
          <h2>승하원 정보</h2>
          <p className="form-section-description">{classTimes ? `수업 시간 ${classTimes.start} ~ ${classTimes.end}` : "수업 시간이 등록되지 않은 클래스입니다. 승·하원 시간을 직접 선택해주세요."}</p>
          <div className="ride-type-tabs" role="group" aria-label="등하원 입력 단계">
            <button
              type="button"
              className={rideType === "등원" ? "active" : ""}
              onClick={() => { setRideType("등원"); setSaved(false); setScheduleError(""); }}
            >
              1. 등원 정보
            </button>
            <button
              type="button"
              className={rideType === "하원" ? "active" : ""}
              disabled={Boolean(validateRide("등원"))}
              onClick={() => { setRideType("하원"); setSaved(false); setScheduleError(""); }}
            >
              2. 하원 정보
            </button>
          </div>
          <div className="form-grid">
            <label className="wide">
              <span>{rideType} 이용 방법</span>
              <select required value={currentRide.useType} onChange={(event) => updateCurrentRide({
                useType: event.target.value as RideDraft["useType"],
                vehicleId: event.target.value === "individual" ? "" : currentRide.vehicleId,
              })}>
                <option value="" disabled>이용 방법을 선택해주세요</option>
                <option value="vehicle">차량 이용</option>
                <option value="individual">개별 {rideType}</option>
              </select>
            </label>
            <label>
              <span>{rideType} 요일</span>
              <input value={`${day}요일`} readOnly />
            </label>
            <div className="ride-time-field" role="group" aria-label={`${rideType} 시간`}>
              <span>{rideType} 시간</span>
              <div className="ride-time-selects">
                <select aria-label={`${rideType} 시`} required value={rideHour} onChange={(event) => updateRideTime(event.target.value, rideMinute || "00")}>
                  <option value="" disabled>시 선택</option>
                  {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={pad(hour)}>{pad(hour)}시</option>)}
                </select>
                <select aria-label={`${rideType} 분`} required value={rideMinute} onChange={(event) => updateRideTime(rideHour, event.target.value)}>
                  <option value="" disabled>분 선택</option>
                  {Array.from({ length: 60 }, (_, minute) => <option key={minute} value={pad(minute)}>{pad(minute)}분</option>)}
                </select>
              </div>
              {classTimes && <small>{rideType === "등원" ? `기본값: 수업 시작 1시간 전 (${classTimes.등원})` : `기본값: 수업 종료 시간 (${classTimes.하원})`} · 1분 단위로 변경 가능</small>}
            </div>
            <label className="wide">
              <span>{rideType} 장소</span>
              <input required value={currentRide.place} onChange={(event) => updateCurrentRide({ place: event.target.value })} placeholder={`${rideType} 장소를 입력해주세요`} />
            </label>
            {currentRide.useType === "vehicle" && <label>
              <span>운행 회차</span>
              <select required value={currentRide.runId} onChange={(event) => {
                const run = runOptions.find((item) => item.id === event.target.value);
                updateCurrentRide({ runId: event.target.value, vehicleId: run?.vehicleId ?? "" });
              }} disabled={!runOptions.length}>
                <option value="" disabled>{runOptions.length ? "회차를 선택해주세요" : "해당 요일의 운행 회차가 없습니다"}</option>
                {runOptions.map((run) => <option key={run.id} value={run.id}>{run.startTime} ~ {run.endTime} · {run.name}</option>)}
              </select>
            </label>}
            {currentRide.useType === "vehicle" && <div className="wide ride-run-link-summary"><div><span>차량</span><strong>{selectedRunVehicle ? `${selectedRunVehicle.name} · ${selectedRunVehicle.number}` : "회차 선택 시 자동 연결"}</strong></div><div><span>기사</span><strong>{selectedRunDriver ? `${selectedRunDriver.name} · ${selectedRunDriver.phone}` : selectedRun ? "미배정" : "회차 선택 시 자동 연결"}</strong></div><div><span>동승자</span><strong>{selectedRunCompanion ? `${selectedRunCompanion.name} · ${selectedRunCompanion.phone}` : selectedRun ? "없음" : "회차 선택 시 자동 연결"}</strong></div></div>}
            {currentRide.useType === "vehicle" && <label>
              <span>자동 연결 차량</span>
              <select value={currentRide.vehicleId} disabled>
                <option value="" disabled>
                  회차를 먼저 선택해주세요
                </option>
                {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name} · {vehicle.number}</option>)}
              </select>
            </label>}
            <label>
              <span>담당 선생님</span>
              <select value={currentRide.teacherMemberId} onChange={(event) => updateCurrentRide({ teacherMemberId: event.target.value })} disabled={!teachers.length}>
                <option value="">선택 안 함</option>
                {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
              </select>
            </label>
            <label className="wide">
              <span>메모</span>
              <textarea
                rows={3}
                value={currentRide.memo}
                onChange={(event) => updateCurrentRide({ memo: event.target.value })}
                placeholder="보호자 요청 사항이나 탑승 시 참고할 내용을 입력해주세요."
              />
            </label>
          </div>
        </fieldset>
        {step === 2 && saved && (
          <p className="save-message" role="status">
            승하원 스케줄이 등록되었습니다.
          </p>
        )}
        {scheduleError && <p className="auth-message" role="alert">{scheduleError}</p>}
        {step === 2 && <button className="registration-previous" type="button" onClick={() => { setStep(1); setSaved(false); window.scrollTo({ top: 0 }); }}>이전 · 기본 정보</button>}
        <button className="register-submit" type="submit" disabled={!canContinue}>
          <Icon name="list" />
          {step === 1 ? "다음 · 승·하원 정보 입력" : rideType === "등원" ? "다음 · 하원 정보 입력" : "등하원 스케줄 등록하기"}
        </button>
      </form>
    </main>
  );
}


function ManagerInviteSignupPage() {
  const token = new URLSearchParams(window.location.search).get("invite") ?? "";
  const [centerName, setCenterName] = useState("초대받은 센터");
  const [completed, setCompleted] = useState(false);
  const [message, setMessage] = useState(() => token ? "" : "초대 정보가 없습니다.");
  const [submitting, setSubmitting] = useState(false);

  const acceptInvitation = async () => {
    if (!token) return;
    const { error } = await supabase.rpc("accept_center_invitation", {
      p_token: token,
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    setCompleted(true);
  };

  useEffect(() => {
    if (!token) {
      return;
    }

    void supabase
      .rpc("get_invitation_summary", { p_token: token })
      .then(({ data, error }) => {
        const summary = Array.isArray(data) ? data[0] : data;
        if (error || !summary?.is_valid) {
          setMessage("유효하지 않거나 만료된 초대 링크입니다.");
          return;
        }
        setCenterName(summary.center_name);
      });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void acceptInvitation();
    });
  }, [token]);

  if (completed) {
    return (
      <main className="invite-signup-page">
        <section className="invite-signup-complete">
          <span>✓</span>
          <h1>가입 신청이 완료되었습니다</h1>
          <p>{centerName} 운영자가 권한을 설정하면 서비스를 이용할 수 있습니다.</p>
          <small>현재 상태 · 권한 설정 대기</small>
        </section>
      </main>
    );
  }

  return (
    <main className="invite-signup-page">
      <section className="invite-signup-heading">
        <span>에듀링크 담당자 초대</span>
        <h1>{centerName}</h1>
        <p>센터 담당자로 초대되었습니다.<br />사용할 계정을 만들어주세요.</p>
      </section>
      <form
        className="invite-signup-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setMessage("");
          setSubmitting(true);
          const form = new FormData(event.currentTarget);
          const password = String(form.get("password") ?? "");
          const confirmPassword = String(form.get("confirmPassword") ?? "");
          if (password !== confirmPassword) {
            setMessage("비밀번호가 일치하지 않습니다.");
            setSubmitting(false);
            return;
          }

          const { data, error } = await supabase.auth.signUp({
            email: String(form.get("email") ?? "").trim(),
            password,
            options: {
              data: {
                full_name: String(form.get("name") ?? "").trim(),
                phone: String(form.get("phone") ?? "").trim(),
              },
              emailRedirectTo: `${window.location.origin}/?invite=${token}`,
            },
          });

          if (error) {
            setMessage(error.message);
          } else if (data.session) {
            await acceptInvitation();
          } else {
            setMessage("인증 메일을 발송했습니다. 메일의 인증 링크를 눌러주세요.");
          }
          setSubmitting(false);
        }}
      >
        <label><span>이름</span><input name="name" required autoComplete="name" placeholder="이름을 입력해 주세요." /></label>
        <label><span>연락처</span><input name="phone" required type="tel" autoComplete="tel" placeholder="010-0000-0000" /></label>
        <label><span>이메일</span><input name="email" required type="email" autoComplete="email" placeholder="사용할 이메일을 입력해 주세요." /></label>
        <label><span>비밀번호</span><input name="password" required type="password" autoComplete="new-password" minLength={8} placeholder="8자 이상 입력해 주세요." /></label>
        <label><span>비밀번호 확인</span><input name="confirmPassword" required type="password" autoComplete="new-password" minLength={8} placeholder="비밀번호를 다시 입력해 주세요." /></label>
        {message && <p className="auth-message" role="status">{message}</p>}
        <button type="submit" disabled={submitting}>{submitting ? "처리 중..." : "회원가입 완료"}</button>
        <small>가입 후 운영자의 권한 설정이 완료될 때까지 센터 정보에 접근할 수 없습니다.</small>
      </form>
    </main>
  );
}


type AuthView = "login" | "signup" | "forgot";

function AuthPage({
  view,
  navigate,
  onLogin,
}: {
  view: AuthView;
  navigate: (view: AuthView) => void;
  onLogin: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setIsError(false);
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");
    const name = String(form.get("name") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();

    try {
      if (view === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        onLogin();
        return;
      }

      if (view === "signup") {
        if (password !== confirmPassword) {
          setIsError(true);
          setMessage("비밀번호가 일치하지 않습니다.");
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
              phone,
            },
            emailRedirectTo: window.location.origin,
          },
        });

        if (error) throw error;

        if (data.session) {
          onLogin();
        } else {
          setMessage("인증 메일을 발송했습니다. 이메일 인증 후 로그인하여 소속 센터를 연결해주세요.");
          window.setTimeout(() => navigate("login"), 2500);
        }
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setMessage("비밀번호 재설정 메일을 발송했습니다.");
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <header className="auth-topbar">
        <span className="auth-brand-icon">▣</span>
        <strong>에듀링크 운행관리</strong>
      </header>
      <div className="auth-center">
        <section className="auth-card">
          <div className="auth-heading">
            <h1>
              {view === "login"
                ? "로그인"
                : view === "signup"
                  ? "회원가입"
                  : "비밀번호 찾기"}
            </h1>
            <p>
              {view === "login"
                ? "차량 운행 스케줄 관리를 위해 로그인해 주세요."
                : view === "signup"
                  ? "이메일 인증 후 소속 센터 연결과 운영자 권한 승인이 필요합니다."
                  : "가입 시 등록한 이메일을 입력해 주세요."}
            </p>
          </div>
          <form className="auth-form" onSubmit={submit}>
            {view === "signup" && (
              <label>
                <span>이름</span>
                <input name="name" required placeholder="이름을 입력해 주세요." autoComplete="name" />
              </label>
            )}
            <label>
              <span>{view === "login" ? "아이디 (이메일)" : "이메일 (아이디)"}</span>
              <input
                name="email"
                required
                type="email"
                placeholder="example@edulink.co.kr"
                autoComplete="email"
              />
            </label>
            {view !== "forgot" && (
              <label>
                <span>비밀번호</span>
                <div className="password-input">
                  <input
                    name="password"
                    required
                    minLength={8}
                    type={showPassword ? "text" : "password"}
                    placeholder="8자 이상 입력해 주세요."
                    autoComplete={view === "login" ? "current-password" : "new-password"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label="비밀번호 표시 전환"
                  >
                    ◉
                  </button>
                </div>
              </label>
            )}
            {view === "signup" && (
              <>
                <label>
                  <span>비밀번호 확인</span>
                  <div className="password-input">
                    <input
                      name="confirmPassword"
                      required
                      minLength={8}
                      type={showConfirm ? "text" : "password"}
                      placeholder="비밀번호를 다시 한번 입력해 주세요."
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((value) => !value)}
                      aria-label="비밀번호 확인 표시 전환"
                    >
                      ◉
                    </button>
                  </div>
                </label>
                <label>
                  <span>연락처</span>
                  <input
                    name="phone"
                    required
                    type="tel"
                    placeholder="010-0000-0000"
                    autoComplete="tel"
                  />
                </label>
              </>
            )}
            {message && (
              <p className={`auth-message ${isError ? "error" : ""}`} role={isError ? "alert" : "status"}>
                {message}
              </p>
            )}
            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting
                ? "처리 중..."
                : view === "login"
                  ? "로그인"
                  : view === "signup"
                    ? "회원가입"
                    : "비밀번호 재설정 링크 발송"}
            </button>
          </form>
          <nav className="auth-links">
            {view === "login" ? (
              <>
                <button onClick={() => navigate("signup")}>회원가입</button>
                <i />
                <button onClick={() => navigate("forgot")}>비밀번호 찾기</button>
              </>
            ) : (
              <button onClick={() => navigate("login")}>
                {view === "signup"
                  ? "이미 계정이 있으신가요? 로그인"
                  : "로그인으로 돌아가기"}
              </button>
            )}
          </nav>
        </section>
        <aside className="auth-help">
          ⓘ 로그인에 문제가 있으신 경우, 관리자에게 문의해 주세요.
        </aside>
      </div>
    </main>
  );
}

function SubPage({
  view,
  back,
  selected,
}: {
  view: "change" | "history";
  back: () => void;
  selected: Date;
}) {
  const content = {
    change: {
      title: "운행 정보 변경",
      sub: "변경할 학생을 선택하세요.",
      empty: "변경할 운행 정보가 없습니다.",
    },
    history: {
      title: "금일 운행 변경 내용",
      sub: "오늘 접수된 변경 요청입니다.",
      empty: "접수된 변경 요청이 없습니다.",
    },
  }[view];

  return (
    <main className="subpage">
      {view !== "history" && (
        <button className="back" onClick={back}>
          <Icon name="back" />
          홈으로
        </button>
      )}
      <section className="subhead">
        <h1>{content.title}</h1>
        <p>{content.sub}</p>
      </section>
      <section className="panel empty-state">{content.empty}</section>
    </main>
  );
}

function CenterConnectionPage({ onConnected, onLogout }: { onConnected: () => Promise<void>; onLogout: () => void }) {
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const getInviteToken = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    try {
      const url = new URL(trimmed);
      return url.searchParams.get("invite")?.trim() ?? "";
    } catch {
      return trimmed;
    }
  };

  if (mode === "choose") {
    return (
      <main className="setting-register-page">
        <section className="setting-register-head">
          <span>센터 연결</span>
          <h1>소속 센터를 연결해주세요</h1>
          <p>이메일 인증은 완료되었습니다. 센터를 만들거나 운영자에게 받은 초대 링크로 가입을 신청해주세요.</p>
        </section>
        <section className="settings-card-grid">
          <button type="button" onClick={() => { setMode("create"); setMessage(""); }}>
            <strong>새 센터 만들기</strong>
            <span>센터를 생성하고 운영자 권한으로 시작합니다.</span>
          </button>
          <button type="button" onClick={() => { setMode("join"); setMessage(""); }}>
            <strong>기존 센터 연결하기</strong>
            <span>초대 링크 또는 초대코드를 입력하고 승인을 요청합니다.</span>
          </button>
        </section>
        <button className="ghost-button" type="button" onClick={onLogout}>로그아웃</button>
      </main>
    );
  }

  if (mode === "join") {
    return (
      <main className="setting-register-page">
        <section className="setting-register-head">
          <span>센터 연결</span>
          <h1>기존 센터에 가입 신청</h1>
          <p>센터 운영자에게 받은 초대 링크 또는 초대코드를 입력해주세요.</p>
        </section>
        <form className="setting-register-form" onSubmit={async (event) => {
          event.preventDefault();
          setSubmitting(true);
          setMessage("");
          const form = new FormData(event.currentTarget);
          const token = getInviteToken(String(form.get("invite") ?? ""));
          if (!token) {
            setMessage("초대 링크 또는 초대코드를 입력해주세요.");
            setSubmitting(false);
            return;
          }
          const { data: summaryData, error: summaryError } = await supabase.rpc("get_invitation_summary", { p_token: token });
          const summary = Array.isArray(summaryData) ? summaryData[0] : summaryData;
          if (summaryError || !summary?.is_valid) {
            setMessage("유효하지 않거나 만료된 초대 정보입니다.");
            setSubmitting(false);
            return;
          }
          const { error } = await supabase.rpc("accept_center_invitation", { p_token: token });
          if (error) setMessage(error.message);
          else await onConnected();
          setSubmitting(false);
        }}>
          <label>
            <span>초대 링크 또는 초대코드</span>
            <input name="invite" required placeholder="운영자에게 받은 초대 정보를 입력해주세요." />
          </label>
          {message && <p className="auth-message error" role="alert">{message}</p>}
          <button type="submit" disabled={submitting}>{submitting ? "연결 중..." : "센터 가입 신청"}</button>
          <small>가입 신청 후 센터 운영자가 역할과 권한을 설정해야 서비스를 이용할 수 있습니다.</small>
        </form>
        <button className="ghost-button" type="button" onClick={() => { setMode("choose"); setMessage(""); }}>이전</button>
      </main>
    );
  }

  return (
    <main className="setting-register-page">
      <section className="setting-register-head">
        <span>센터 생성</span>
        <h1>센터를 등록해주세요</h1>
        <p>센터를 만든 계정에는 운영자 권한이 자동으로 부여됩니다.</p>
      </section>
      <form className="setting-register-form" onSubmit={async (event) => {
        event.preventDefault();
        setSubmitting(true);
        setMessage("");
        const form = new FormData(event.currentTarget);
        const { error } = await supabase.rpc("create_center_with_owner", {
          p_name: String(form.get("centerName") ?? "").trim(),
          p_address: String(form.get("centerAddress") ?? "").trim(),
        });
        if (error) setMessage(error.message);
        else await onConnected();
        setSubmitting(false);
      }}>
        <label><span>센터명</span><input name="centerName" required placeholder="센터명을 입력해 주세요." /></label>
        <label><span>센터 주소</span><input name="centerAddress" placeholder="주소를 입력해 주세요." /></label>
        {message && <p className="auth-message error" role="alert">{message}</p>}
        <button type="submit" disabled={submitting}>{submitting ? "등록 중..." : "센터 등록 완료"}</button>
      </form>
      <button className="ghost-button" type="button" onClick={() => { setMode("choose"); setMessage(""); }}>이전</button>
    </main>
  );
}

function PermissionWaitingPage({ centerName, onLogout }: { centerName: string; onLogout: () => void }) {
  return (
    <main className="invite-signup-page">
      <section className="invite-signup-complete">
        <span>✓</span>
        <h1>권한 설정 대기 중입니다</h1>
        <p>{centerName} 운영자가 담당 권한을 설정하면 서비스를 이용할 수 있습니다.</p>
        <button type="button" onClick={onLogout}>로그아웃</button>
      </section>
    </main>
  );
}

export default function HomePage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authView, setAuthView] = useState<AuthView>("login");
  const [view, setView] = useState<View>("home");
  const [studentRegisterReturnView, setStudentRegisterReturnView] = useState<View>("home");
  const [selected, setSelected] = useState(() => new Date());
  const [studentRows, setStudentRows] = useState<Student[]>(students);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [centerName, setCenterName] = useState("센터 미등록");
  const [userName, setUserName] = useState("이용자");
  const [centerAddress, setCenterAddress] = useState("");
  const [defaultClassDurationMinutes, setDefaultClassDurationMinutes] = useState(50);
  const [classDurationOptions, setClassDurationOptions] = useState<number[]>([40, 50, 60, 90, 119, 120]);
  const [operatingHours, setOperatingHours] = useState<OperatingHours>(() => structuredClone(DEFAULT_OPERATING_HOURS));
  const [centerId, setCenterId] = useState("");
  const [membershipStatus, setMembershipStatus] = useState<"checking" | "none" | "pending" | "active">("checking");
  const [currentRoles, setCurrentRoles] = useState<string[]>([]);
  const [registeredManagers, setRegisteredManagers] = useState<RegisteredManager[]>([]);
  const [companionAssignments, setCompanionAssignments] = useState<Record<string, string>>({});
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([]);
  const [classroomOptions, setClassroomOptions] = useState<ClassroomOption[]>([]);
  const [studentRegisterRuns, setStudentRegisterRuns] = useState<VehicleRunOption[]>([]);

  const loadVehicles = async (targetCenterId: string) => {
    const { data, error } = await supabase.from("vehicles").select("id,name,number,model,capacity").eq("center_id", targetCenterId).order("name");
    if (error) { console.error("차량 조회 실패:", error.message); setVehicleOptions([]); return; }
    setVehicleOptions((data ?? []).map((item) => ({ id: item.id, name: item.name, number: item.number, model: item.model ?? "", capacity: item.capacity ?? 0 })));
  };

  const loadClassrooms = async (targetCenterId: string) => {
    const { data, error } = await supabase.from("classrooms").select("id,name,capacity,status").eq("center_id", targetCenterId).order("created_at");
    if (error) { console.error("강의실 조회 실패:", error.message); setClassroomOptions([]); return; }
    setClassroomOptions((data ?? []).map((room) => ({ id: room.id, name: room.name, capacity: room.capacity, status: room.status === "inactive" ? "inactive" : "active" })));
  };

  const loadClasses = async (targetCenterId: string) => {
    const { data, error } = await supabase.from("classes").select("id,name,days,start_time,end_time,venue,classroom_id,status").eq("center_id", targetCenterId).order("start_time");
    if (error) { console.error("클래스 조회 실패:", error.message); setClassOptions([]); return; }
    setClassOptions((data ?? []).map((item) => ({ id: item.id, name: item.name, days: item.days ?? [], startTime: item.start_time?.slice(0, 5) ?? "", endTime: item.end_time?.slice(0, 5) ?? "", venue: item.venue ?? "", classroomId: item.classroom_id ?? undefined, status: item.status === "inactive" ? "inactive" : "active" })));
  };

  const loadVehicleRuns = async (targetCenterId: string) => {
    const { data, error } = await supabase.from("vehicle_runs").select("id,name,days,vehicle_id,scheduled_start,scheduled_end,driver_member_id,companion_member_id,status").eq("center_id", targetCenterId).order("scheduled_start");
    if (error) { console.error("운행 회차 조회 실패:", error.message); setStudentRegisterRuns([]); return; }
    setStudentRegisterRuns((data ?? []).map((row) => ({ id: row.id, name: row.name, days: row.days ?? [], vehicleId: row.vehicle_id, startTime: row.scheduled_start?.slice(0, 5) ?? "", endTime: row.scheduled_end?.slice(0, 5) ?? "", driverMemberId: row.driver_member_id ?? undefined, companionMemberId: row.companion_member_id ?? undefined, status: row.status === "inactive" ? "inactive" : "active" })));
  };

  useEffect(() => {
    if (view === "student-register" && centerId) void loadVehicleRuns(centerId);
  }, [view, centerId]);

  const loadStudents = async (targetCenterId: string) => {
    const { data, error } = await supabase
      .from("students")
      .select("id,student_code,name,birth,class_name,class_info,class_id,teacher_member_id,pickup_place,pickup_info,dropoff_place,dropoff_info,guardian,phone,photo_name,home_address,handoff_guardian,ride_notes,general_notes")
      .eq("center_id", targetCenterId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("학생 명단 조회 실패:", error.message);
      setStudentRows([]);
      setClassOptions([]);
      setVehicleOptions([]);
      return;
    }
    const studentIds = (data ?? []).map((row) => row.id);
    const { data: classLinks, error: classLinkError } = studentIds.length
      ? await supabase.from("student_classes").select("student_id,class_id").in("student_id", studentIds)
      : { data: [], error: null };
    if (classLinkError) console.error("학생 클래스 연결 조회 실패:", classLinkError.message);
    const { data: rideSchedules, error: rideScheduleError } = studentIds.length
      ? await supabase
          .from("ride_schedules")
          .select("student_id,weekday,direction,ride_time,place,vehicle_name")
          .eq("center_id", targetCenterId)
          .eq("is_active", true)
          .in("student_id", studentIds)
      : { data: [], error: null };
    if (rideScheduleError) console.error("학생 승하원 일정 조회 실패:", rideScheduleError.message);

    const classIdsByStudent = new Map<string, string[]>();
    for (const link of classLinks ?? []) classIdsByStudent.set(link.student_id, [...(classIdsByStudent.get(link.student_id) ?? []), link.class_id]);
    const ridesByStudent = new Map<string, StudentRideScheduleRow[]>();
    for (const schedule of (rideSchedules ?? []) as StudentRideScheduleRow[]) {
      ridesByStudent.set(schedule.student_id, [
        ...(ridesByStudent.get(schedule.student_id) ?? []),
        schedule,
      ]);
    }
    setStudentRows((data ?? []).map((row) => {
      const student = applyRideScheduleSummary(
        toStudent(row as StudentRow),
        ridesByStudent.get(row.id) ?? [],
      );
      return { ...student, classIds: classIdsByStudent.get(row.id) ?? (student.classId ? [student.classId] : []) };
    }));
  };

  const loadManagers = async (targetCenterId: string) => {
    const { data: members } = await supabase
      .from("center_members")
      .select("id,user_id,roles,status")
      .eq("center_id", targetCenterId)
      .order("joined_at");
    const userIds = (members ?? []).map((member) => member.user_id);
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("id,full_name,phone").in("id", userIds)
      : { data: [] };
    const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    setRegisteredManagers((members ?? []).map((member) => {
      const profile = profileMap.get(member.user_id);
      return {
        id: member.id,
        userId: member.user_id,
        name: profile?.full_name || "이름 미등록",
        phone: profile?.phone || "연락처 미등록",
        roles: member.roles ?? [],
        status: member.status === "active" ? "사용 중" : member.status === "inactive" ? "비활성" : "권한 설정 대기",
      };
    }));
  };

  const refreshSelectedStudent = async () => {
    if (!selectedStudent?.databaseId) return;
    const { data, error } = await supabase
      .from("students")
      .select("id,student_code,name,birth,class_name,class_info,class_id,teacher_member_id,pickup_place,pickup_info,dropoff_place,dropoff_info,guardian,phone,photo_name,home_address,handoff_guardian,ride_notes,general_notes")
      .eq("id", selectedStudent.databaseId)
      .single();
    if (error) throw new Error(error.message);
    const updated = toStudent(data as StudentRow);
    setSelectedStudent(updated);
    await Promise.all([loadStudents(centerId), loadClasses(centerId)]);
  };

  const loadAccount = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setLoggedIn(false);
      setMembershipStatus("checking");
      setAuthReady(true);
      return;
    }
    setLoggedIn(true);
    const metadataName = String(userData.user.user_metadata?.full_name ?? "").trim();
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userData.user.id)
      .maybeSingle();
    setUserName(currentProfile?.full_name?.trim() || metadataName || "이용자");
    const { data: membership, error } = await supabase
      .from("center_members")
      .select("id,center_id,roles,status,centers(name,address,default_class_duration_minutes,class_duration_options,operating_hours)")
      .eq("user_id", userData.user.id)
      .neq("status", "inactive")
      .limit(1)
      .maybeSingle();
    if (error || !membership) {
      setMembershipStatus("none");
      setCenterId("");
      setCenterName("센터 미등록");
      setStudentRows([]);
      setAuthReady(true);
      return;
    }
    const center = Array.isArray(membership.centers) ? membership.centers[0] : membership.centers;
    setCenterId(membership.center_id);
    setCenterName(center?.name ?? "소속 센터");
    setCenterAddress(center?.address ?? "");
    const nextDefaultDuration = center?.default_class_duration_minutes ?? 50;
    const storedDurationOptions = Array.isArray(center?.class_duration_options)
      ? center.class_duration_options.filter((minutes: unknown): minutes is number => typeof minutes === "number" && Number.isInteger(minutes) && minutes > 0 && minutes <= 720)
      : [];
    const nextDurationOptions = [...storedDurationOptions, nextDefaultDuration].filter((minutes, index, values) => values.indexOf(minutes) === index).sort((a, b) => a - b);
    setDefaultClassDurationMinutes(nextDefaultDuration);
    setClassDurationOptions(nextDurationOptions.length ? nextDurationOptions : [40, 50, 60, 90, 119, 120]);
    setOperatingHours(normalizeOperatingHours(center?.operating_hours));
    setCurrentRoles(membership.roles ?? []);
    setMembershipStatus(membership.status === "active" ? "active" : "pending");
    if (membership.status === "active") {
      await Promise.all([loadStudents(membership.center_id), loadClasses(membership.center_id), loadVehicles(membership.center_id), loadClassrooms(membership.center_id), loadVehicleRuns(membership.center_id)]);
    } else {
      setStudentRows([]);
    }
    if (membership.status === "active" && (membership.roles ?? []).includes("운영자")) {
      await loadManagers(membership.center_id);
    } else {
      setRegisteredManagers([]);
    }
    setAuthReady(true);
  };

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("invite")) {
      window.setTimeout(() => setView("manager-invite-signup"), 0);
    }

    const initialAccountLoad = window.setTimeout(() => void loadAccount(), 0);

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(Boolean(session));
      window.setTimeout(() => void loadAccount(), 0);
    });

    return () => {
      window.clearTimeout(initialAccountLoad);
      authListener.subscription.unsubscribe();
    };
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    setView("home");
    setCenterId("");
    setUserName("이용자");
    setCurrentRoles([]);
    setRegisteredManagers([]);
    setStudentRows([]);
    setClassOptions([]);
    setVehicleOptions([]);
  };
  const saveCenter = async (name: string, address: string, classDurationMinutes: number, nextClassDurationOptions: number[], nextOperatingHours: OperatingHours) => {
    if (centerId) {
      const { error } = await supabase.from("centers").update({ name, address, default_class_duration_minutes: classDurationMinutes, class_duration_options: nextClassDurationOptions, operating_hours: nextOperatingHours, updated_at: new Date().toISOString() }).eq("id", centerId);
      if (error) throw new Error(error.message);
    }
    setCenterName(name);
    setCenterAddress(address);
    setDefaultClassDurationMinutes(classDurationMinutes);
    setClassDurationOptions(nextClassDurationOptions);
    setOperatingHours(nextOperatingHours);
  };
  const createClassroom = async (classroom: Omit<ClassroomOption, "id" | "status">) => {
    if (!centerId) throw new Error("소속 센터 정보를 찾지 못했습니다.");
    const { error } = await supabase.from("classrooms").insert({ center_id: centerId, name: classroom.name, capacity: classroom.capacity, status: "active" });
    if (error) throw new Error(error.message);
    await loadClassrooms(centerId);
  };
  const updateClassroom = async (classroom: ClassroomOption) => {
    const { error } = await supabase.from("classrooms").update({ name: classroom.name, capacity: classroom.capacity, status: classroom.status, updated_at: new Date().toISOString() }).eq("id", classroom.id).eq("center_id", centerId);
    if (error) throw new Error(error.message);
    await Promise.all([loadClassrooms(centerId), loadClasses(centerId)]);
  };
  const registerManager = (manager: RegisteredManager) => {
    setRegisteredManagers((current) => {
      const next = [...current, manager];
      return next;
    });
  };
  const updateManager = async (manager: RegisteredManager) => {
    const { error } = await supabase.rpc("set_center_member_roles", {
      p_member_id: manager.id,
      p_roles: manager.roles,
    });
    if (error) {
      window.alert(error.message);
      return;
    }
    await loadManagers(centerId);
  };
  const saveCompanionAssignments = (assignments: Record<string, string>) => {
    setCompanionAssignments(assignments);
  };
  const registerStudent = async (student: Student) => {
    if (!centerId) throw new Error("소속 센터 정보를 찾지 못했습니다.");
    const { data, error } = await supabase
      .from("students")
      .insert({
        center_id: centerId,
        student_code: student.id,
        name: student.name,
        birth: student.birth === "-" ? null : student.birth,
        class_name: student.className,
        class_info: student.classInfo,
        class_id: student.classId || null,
        teacher_member_id: student.teacherMemberId || null,
        pickup_place: student.pickupPlace,
        pickup_info: student.pickupInfo,
        dropoff_place: student.dropoffPlace,
        dropoff_info: student.dropoffInfo,
        guardian: student.guardian,
        phone: student.phone,
        photo_name: student.photoName || null,
        home_address: student.homeAddress || null,
        handoff_guardian: student.handoffGuardian?.trim() || null,
        ride_notes: student.rideNotes || null,
        general_notes: student.generalNotes || null,
      })
      .select("id,student_code,name,birth,class_name,class_info,class_id,teacher_member_id,pickup_place,pickup_info,dropoff_place,dropoff_info,guardian,phone,photo_name,home_address,handoff_guardian,ride_notes,general_notes")
      .single();
    if (error) throw new Error(error.message);
    const selectedClassIds = Array.from(new Set([...(student.classIds ?? []), ...(student.classId ? [student.classId] : [])]));
    if (selectedClassIds.length) {
      const { error: classLinkError } = await supabase.from("student_classes").upsert(selectedClassIds.map((classId) => ({ center_id: centerId, student_id: data.id, class_id: classId })), { onConflict: "student_id,class_id" });
      if (classLinkError) {
        await supabase.from("students").delete().eq("id", data.id);
        throw new Error(`클래스 연결 저장 실패: ${classLinkError.message}`);
      }
    }
    const dayNumber: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
    const schedules = student.rideSchedules?.length ? student.rideSchedules.map((ride) => ({
      center_id: centerId,
      student_id: data.id,
      weekday: dayNumber[ride.day],
      direction: ride.direction,
      ride_time: ride.useType === "vehicle" ? ride.time : null,
      place: ride.useType === "vehicle" ? ride.place : null,
      vehicle_id: ride.useType === "vehicle" ? ride.vehicleId || null : null,
      vehicle_name: ride.useType === "vehicle" ? ride.vehicleName || null : ride.direction === "pickup" ? "개별 등원" : "개별 하원",
      teacher_member_id: null,
      run_id: ride.useType === "vehicle" ? ride.runId || null : null,
      handoff_guardian: ride.useType === "individual" ? ride.handoffGuardian?.trim() || null : null,
      special_note: ride.specialNote || null,
      status: "normal",
      is_active: true,
    })) : (student.classDays ?? []).flatMap((day) => {
      const common = {
        center_id: centerId,
        student_id: data.id,
        weekday: dayNumber[day],
        vehicle_id: student.vehicleId || null,
        vehicle_name: student.vehicleName || null,
        teacher_member_id: student.teacherMemberId || null,
        status: "normal",
      };
      return [
        ...(student.pickupTime && student.pickupPlace ? [{ ...common, direction: "pickup", ride_time: student.pickupTime, place: student.pickupPlace }] : []),
        ...(student.dropoffTime && student.dropoffPlace ? [{ ...common, direction: "dropoff", ride_time: student.dropoffTime, place: student.dropoffPlace }] : []),
      ];
    });
    if (schedules.length) {
      const { error: scheduleError } = await supabase.from("ride_schedules").insert(schedules);
      if (scheduleError) {
        await supabase.from("students").delete().eq("id", data.id);
        throw new Error(`운행 스케줄 저장 실패: ${scheduleError.message}`);
      }
    }
    const savedStudent = { ...toStudent(data as StudentRow), classIds: selectedClassIds };
    setStudentRows((current) => [savedStudent, ...current]);
    setSelectedStudent(savedStudent);
    setView("student-detail");
  };
  const createClass = async (classItem: Omit<ClassOption, "id" | "status">) => {
    if (!centerId) throw new Error("소속 센터 정보를 찾지 못했습니다.");
    const { error } = await supabase.from("classes").insert({ center_id: centerId, name: classItem.name, days: classItem.days, start_time: classItem.startTime, end_time: classItem.endTime, venue: classItem.venue || null, classroom_id: classItem.classroomId || null });
    if (error) throw new Error(error.message);
    await loadClasses(centerId);
  };
  const updateClass = async (classItem: ClassOption) => {
    if (!centerId) throw new Error("소속 센터 정보를 찾지 못했습니다.");
    const { error } = await supabase.from("classes").update({ name: classItem.name.trim(), days: classItem.days, start_time: classItem.startTime, end_time: classItem.endTime, venue: classItem.venue || null, classroom_id: classItem.classroomId || null, status: classItem.status ?? "active", updated_at: new Date().toISOString() }).eq("id", classItem.id).eq("center_id", centerId);
    if (error) throw new Error(error.message);
    const { error: legacyStudentError } = await supabase.from("students").update({ class_name: classItem.name.trim(), class_info: classItem.days.join("·") }).eq("center_id", centerId).eq("class_id", classItem.id);
    if (legacyStudentError) throw new Error(legacyStudentError.message);
    await Promise.all([loadClasses(centerId), loadStudents(centerId)]);
  };
  const deleteOrDisableClass = async (classItem: ClassOption) => {
    if (!centerId) throw new Error("소속 센터 정보를 찾지 못했습니다.");
    const { count, error: countError } = await supabase.from("student_classes").select("student_id", { count: "exact", head: true }).eq("class_id", classItem.id);
    if (countError) throw new Error(countError.message);
    if (count) {
      await updateClass({ ...classItem, status: "inactive" });
      return;
    }
    const { error } = await supabase.from("classes").delete().eq("id", classItem.id).eq("center_id", centerId);
    if (error) throw new Error(error.message);
    await loadClasses(centerId);
  };
  const createVehicle = async (vehicle: Omit<VehicleOption, "id">) => {
    if (!centerId) throw new Error("소속 센터 정보를 찾지 못했습니다.");
    const { error } = await supabase.from("vehicles").insert({ center_id: centerId, name: vehicle.name, number: vehicle.number, model: vehicle.model, capacity: vehicle.capacity });
    if (error) throw new Error(error.message);
    await loadVehicles(centerId);
  };
  const saveRideSchedule = async (schedule: {
    student: Student;
    day: string;
    rides: Array<{
      direction: "pickup" | "dropoff";
      useType: "vehicle" | "individual";
      time: string;
      place: string;
      vehicle?: VehicleOption;
      teacherMemberId?: string;
      runId?: string;
      memo: string;
    }>;
  }) => {
    if (!centerId || !schedule.student.databaseId) throw new Error("학생 또는 센터 정보를 찾지 못했습니다.");
    const dayNumber: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
    if (schedule.rides.length !== 2) throw new Error("등원과 하원 정보를 모두 입력해주세요.");
    const rows = schedule.rides.map((ride) => ({
      center_id: centerId,
      student_id: schedule.student.databaseId,
      weekday: dayNumber[schedule.day],
      direction: ride.direction,
      ride_time: ride.time,
      place: ride.place,
      vehicle_id: ride.useType === "vehicle" ? ride.vehicle?.id ?? null : null,
      vehicle_name: ride.useType === "vehicle" ? ride.vehicle?.name ?? null : ride.direction === "pickup" ? "개별 등원" : "개별 하원",
      teacher_member_id: ride.teacherMemberId || null,
      run_id: ride.runId || null,
      special_note: ride.memo || null,
      status: "normal",
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("ride_schedules").upsert(rows, { onConflict: "student_id,weekday,direction" });
    if (error) throw new Error(error.message);
  };
  const fullScreenView = [
    "center-timetable",
    "calendar",
    "no-schedule",
    "same-day-date",
    "schedule",
    "same-day-schedule",
    "vehicle-schedule",
    "class-schedule",
    "same-day-class-schedule",
    "vehicle-class-schedule",
  ].includes(view);
  const selectVehicleDay = (date: Date) => {
    setSelected(date);
    setView("vehicle-view-choice");
  };
  const isOperator = currentRoles.includes("운영자");
  const navigationProps = {
    currentView: view,
    isOperator,
    navigate: setView,
  };
  const nav = <MobileNavigation {...navigationProps} />;
  const header = (
    <AppHeader
      onHome={() => setView("home")}
      onLogout={logout}
      centerName={centerName}
      navigation={<DesktopNavigation {...navigationProps} />}
    />
  );
  const activeClassroomIds = new Set(
    classroomOptions
      .filter((room) => room.status === "active" && room.name.trim())
      .map((room) => room.id),
  );
  const activeClassroomNames = new Set(
    classroomOptions
      .filter((room) => room.status === "active" && room.name.trim())
      .map((room) => room.name.trim()),
  );
  const activeClassOptions = classOptions.filter((item) => {
    if (item.status === "inactive") return false;
    if (item.classroomId) return activeClassroomIds.has(item.classroomId);
    return Boolean(item.venue.trim() && activeClassroomNames.has(item.venue.trim()));
  });
  if (view === "manager-invite-signup")
    return <ManagerInviteSignupPage />;
  if (!authReady)
    return <main className="auth-page"><div className="auth-center"><p>로그인 상태를 확인하고 있습니다.</p></div></main>;
  if (!loggedIn)
    return (
      <AuthPage
        view={authView}
        navigate={setAuthView}
        onLogin={() => setLoggedIn(true)}
      />
    );
  if (membershipStatus === "none")
    return <CenterConnectionPage onConnected={loadAccount} onLogout={() => void logout()} />;
  if (membershipStatus === "pending")
    return <PermissionWaitingPage centerName={centerName} onLogout={() => void logout()} />;
  if (view === "register-choice")
    return (
      <div className="app-shell">
        {header}
        <RegisterChoicePage choose={(nextView) => { if (nextView === "student-register") setStudentRegisterReturnView("register-choice"); setView(nextView); }} back={() => setView("home")} />
        {nav}
      </div>
    );
  if (view === "student-register")
    return (
      <div className="app-shell">
        {header}
        <StudentRegisterPage
          back={() => setView(studentRegisterReturnView)}
          onRegister={registerStudent}
          classOptions={activeClassOptions}
          studentRows={studentRows}
          classrooms={classroomOptions}
          teacherOptions={registeredManagers.filter((manager) => manager.status === "사용 중" && manager.roles.includes("담당 선생님")).map((manager) => ({ id: manager.id, name: manager.name }))}
          vehicleOptions={vehicleOptions}
          vehicleRuns={studentRegisterRuns}
          centerId={centerId}
          managers={registeredManagers.map((manager) => ({ id: manager.id, name: manager.name, phone: manager.phone }))}
          openSettings={() => setView("center-management")}
        />
        {nav}
      </div>
    );
  if (view === "companion-schedule-register")
    return (
      <div className="app-shell">
        {header}
        <CompanionScheduleRegisterPage
          back={() => setView("register-choice")}
          companionOptions={registeredManagers.filter((manager) => manager.roles.includes("동승자"))}
          assignments={companionAssignments}
          save={saveCompanionAssignments}
        />
        {nav}
      </div>
    );
  if (view === "students")
    return (
      <div className="app-shell">
        {header}
        <StudentListPage
          add={() => { setStudentRegisterReturnView("students"); setView("student-register"); }}
          studentRows={studentRows}
          setStudentRows={setStudentRows}
          openStudent={(student) => {
            setSelectedStudent(student);
            setView("student-detail");
          }}
        />
        {nav}
      </div>
    );
  if (view === "student-detail" && selectedStudent)
    return (
      <div className="app-shell">
        {header}
        <StudentDetailPage
          student={selectedStudent}
          centerId={centerId}
          classes={classOptions}
          vehicles={vehicleOptions}
          teachers={registeredManagers.filter((manager) => manager.status === "사용 중" && manager.roles.includes("담당 선생님")).map((manager) => ({ id: manager.id, name: manager.name }))}
          managers={registeredManagers}
          operatingHours={operatingHours}
          back={() => setView("students")}
          onSaved={refreshSelectedStudent}
        />
        {nav}
      </div>
    );
  if (view === "center-management" || view === "vehicles")
    return (
      <div className="app-shell">
        {header}
        <CenterManagementPage navigate={setView} />
        {nav}
      </div>
    );
  if (view === "settings")
    return (
      <div className="app-shell">
        {header}
        <SettingsPage
          centerId={centerId}
          centerName={centerName}
          managers={registeredManagers}
          onAccountDeleted={logout}
        />
        {nav}
      </div>
    );
  if (view === "center-settings")
    return (
      <div className="app-shell">
        {header}
        <CenterSettingsPage
          centerName={centerName}
          centerAddress={centerAddress}
          defaultClassDurationMinutes={defaultClassDurationMinutes}
          classDurationOptions={classDurationOptions}
          operatingHours={operatingHours}
          classrooms={classroomOptions}
          save={saveCenter}
          onCreateClassroom={createClassroom}
          onUpdateClassroom={updateClassroom}
          back={() => setView("center-management")}
        />
        {nav}
      </div>
    );
  if (view === "class-management")
    return (
      <div className="app-shell">
        {header}
        <ClassManagementPage classes={classOptions} classrooms={classroomOptions} defaultClassDurationMinutes={defaultClassDurationMinutes} classDurationOptions={classDurationOptions} operatingHours={operatingHours} onCreate={createClass} onUpdate={updateClass} back={() => setView("center-management")} />
        {nav}
      </div>
    );
  if (view === "vehicle-run-management")
    return (
      <div className="app-shell">
        {header}
        <VehicleRunManagementPage centerId={centerId} vehicles={vehicleOptions} managers={registeredManagers} operatingHours={operatingHours} back={() => setView("center-management")} />
        {nav}
      </div>
    );
  if (view === "vehicle-run-reassignment")
    return (
      <div className="app-shell">
        {header}
        <VehicleRunReassignmentPage centerId={centerId} vehicles={vehicleOptions} back={() => setView("center-management")} />
        {nav}
      </div>
    );
  if (view === "manager-register")
    return (
      <div className="app-shell">
        {header}
        <ManagerManagementPage
          centerId={centerId}
          registeredManagers={registeredManagers}
          onUpdateManager={updateManager}
        />
        {nav}
      </div>
    );
  if (view === "vehicle-register" || view === "driver-register")
    return (
      <div className="app-shell">
        {header}
        <SettingRegistrationPage
          view={view}
          back={() => setView("center-management")}
          vehicles={vehicleOptions}
          onRegisterVehicle={createVehicle}
        />
        {nav}
      </div>
    );
  return (
    <div className="app-shell">
      {fullScreenView ? <div className="desktop-only-header">{header}</div> : header}{" "}
      {view === "home" ? (
        <Home navigate={(nextView) => { if (nextView === "student-register") setStudentRegisterReturnView("home"); setView(nextView); }} userName={userName} />
      ) : view === "center-timetable" ? (
        <CenterTimetablePage
          centerId={centerId}
          classes={activeClassOptions}
          students={studentRows}
          classrooms={classroomOptions}
          vehicles={vehicleOptions}
          managers={registeredManagers}
          operatingHours={operatingHours}
          onCreateClass={createClass}
          onUpdateClass={updateClass}
          onDeleteClass={deleteOrDisableClass}
          back={() => setView("home")}
        />
      ) : view === "register" ? (
        <RegisterPage
          back={() => setView("home")}
          centerId={centerId}
          studentRows={studentRows}
          classes={activeClassOptions}
          vehicles={vehicleOptions}
          teachers={registeredManagers.filter((manager) => manager.status === "사용 중" && manager.roles.includes("담당 선생님")).map((manager) => ({ id: manager.id, name: manager.name }))}
          managers={registeredManagers}
          onSaveSchedule={saveRideSchedule}
        />
      ) : view === "calendar" ? (
        <CalendarPage
          selected={selected}
          onSelect={setSelected}
          onDateClick={(date) =>
            setView(date.getDay() === 0 ? "no-schedule" : "view-choice")
          }
          onConfirm={() => setView("view-choice")}
          back={() => setView("home")}
        />
      ) : view === "no-schedule" ? (
        <NoSchedulePage selected={selected} back={() => setView("calendar")} />
      ) : view === "same-day-date" ? (
        <CalendarPage
          selected={selected}
          onSelect={setSelected}
          onDateClick={() => setView("same-day-view-choice")}
          onConfirm={() => setView("same-day-view-choice")}
          back={() => setView("change-choice")}
          title="변경 날짜 선택"
        />
      ) : view === "view-choice" ? (
        <ViewChoicePage
          selected={selected}
          choose={setView}
          back={() => setView("calendar")}
        />
      ) : view === "same-day-view-choice" ? (
        <SameDayViewChoicePage
          selected={selected}
          choose={setView}
          back={() => setView("same-day-date")}
        />
      ) : view === "vehicle-day" ? (
        <VehicleDayPage
          selected={selected}
          onSelectDay={selectVehicleDay}
          back={() => setView("change-choice")}
        />
      ) : view === "vehicle-view-choice" ? (
        <VehicleViewChoicePage
          selected={selected}
          choose={setView}
          back={() => setView("vehicle-day")}
        />
      ) : view === "schedule" ||
        view === "same-day-schedule" ||
        view === "vehicle-schedule" ? (
        <TimelinePage
          selected={selected}
          centerId={centerId}
          manageMode={view !== "schedule"}
          companionAssignments={companionAssignments}
          vehicles={vehicleOptions}
          managers={registeredManagers}
          openStudent={(studentId) => {
            const student = studentRows.find((item) => item.databaseId === studentId);
            if (!student) return;
            setSelectedStudent(student);
            setView("student-detail");
          }}
          back={() =>
            setView(
              view === "same-day-schedule"
                ? "same-day-view-choice"
                : view === "vehicle-schedule"
                  ? "vehicle-view-choice"
                  : "view-choice",
            )
          }
        />
      ) : view === "class-schedule" ||
        view === "same-day-class-schedule" ||
        view === "vehicle-class-schedule" ? (
        <ClassSchedulePage
          selected={selected}
          centerId={centerId}
          classes={activeClassOptions}
          students={studentRows}
          classrooms={classroomOptions}
          manageMode={view !== "class-schedule"}
          onDateChange={setSelected}
          openStudent={(student) => {
            setSelectedStudent(student);
            setView("student-detail");
          }}
          back={() =>
            setView(
              view === "same-day-class-schedule"
                ? "same-day-view-choice"
                : view === "vehicle-class-schedule"
                  ? "vehicle-view-choice"
                  : "view-choice",
            )
          }
        />
      ) : view === "change-choice" ? (
        <ChangeChoicePage choose={setView} back={() => setView("home")} />
      ) : view === "change" || view === "history" ? (
        <SubPage view={view} selected={selected} back={() => setView("home")} />
      ) : null}{" "}
      {nav}
    </div>
  );
}
