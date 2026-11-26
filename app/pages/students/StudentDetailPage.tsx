"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../src/lib/supabase";
import { Icon } from "../../components/common/Icon";
import type { ClassOption } from "../../types/class";
import type { Student } from "../../types/student";
import type { VehicleOption } from "../../types/vehicle";
import type { OperatingHours } from "../settings/SettingsPages";
import { StudentEditPage } from "./StudentEditPage";
import "../../student-pages.css";

type StudentClassDetail = { id: string; name: string; days: string[]; startTime: string; endTime: string; venue: string };
type RideScheduleDetail = { id: string; weekday: number; direction: "pickup" | "dropoff"; rideTime: string; place: string; vehicleId: string; vehicleName: string; runId: string; runName: string; teacherMemberId: string; handoffGuardian: string; specialNote: string };
const weekdayNames = ["일", "월", "화", "수", "목", "금", "토"];
const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];

function calculateSchoolGrade(birthYear: number | null) {
  if (!birthYear) return "미등록";
  const grade = new Date().getFullYear() - birthYear - 6;
  if (grade <= -1) return "미취학";
  if (grade === 0) return "7세 · 취학 예정";
  if (grade <= 6) return `초등학교 ${grade}학년`;
  if (grade <= 9) return `중학교 ${grade - 6}학년`;
  if (grade <= 12) return `고등학교 ${grade - 9}학년`;
  return `${birthYear}년생`;
}

function formatEnrollmentDate(value: string) {
  if (!value) return "미등록";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${year}년 ${Number(month)}월 ${Number(day)}일` : value;
}

export function StudentDetailPage({
  student,
  centerId,
  classes,
  vehicles,
  teachers,
  managers,
  operatingHours,
  back,
  onSaved,
}: {
  student: Student;
  centerId: string;
  classes: ClassOption[];
  vehicles: VehicleOption[];
  teachers: { id: string; name: string }[];
  managers: { id: string; name: string; phone: string; roles: string[] }[];
  operatingHours: OperatingHours;
  back: () => void;
  onSaved: () => Promise<void>;
}) {
  const [editingSection, setEditingSection] = useState<"student" | "guardian" | "class" | "ride" | null>(null);
  const [classDetails, setClassDetails] = useState<StudentClassDetail[]>([]);
  const [guardians, setGuardians] = useState<Array<{ id: string; name: string; relationship: string; phone: string; is_primary: boolean }>>([]);
  const [rideSchedules, setRideSchedules] = useState<RideScheduleDetail[]>([]);
  const [registeredBirth, setRegisteredBirth] = useState(student.birth === "-" ? "" : student.birth);
  const [registeredBirthYear, setRegisteredBirthYear] = useState<number | null>(student.birth && student.birth !== "-" ? Number(student.birth.slice(0, 4)) : null);
  const [enrollmentDate, setEnrollmentDate] = useState("");

  const loadDetail = async () => {
    if (!student.databaseId) return;
    const [classResult, guardianResult, rideResult, studentResult] = await Promise.all([
      supabase.from("student_classes").select("classes(id,name,days,start_time,end_time,venue)").eq("student_id", student.databaseId),
      supabase.from("student_guardians").select("id,name,relationship,phone,is_primary").eq("student_id", student.databaseId).order("is_primary", { ascending: false }),
      supabase.from("ride_schedules").select("id,weekday,direction,ride_time,place,vehicle_id,vehicle_name,run_id,teacher_member_id,handoff_guardian,special_note,vehicle_runs(name)").eq("student_id", student.databaseId).eq("is_active", true),
      supabase.from("students").select("birth,birth_year,enrollment_date,created_at").eq("id", student.databaseId).maybeSingle(),
    ]);
    const details = (classResult.data ?? []).flatMap((item) => {
      const joined = item.classes as { id?: string; name?: string; days?: string[]; start_time?: string; end_time?: string; venue?: string } | { id?: string; name?: string; days?: string[]; start_time?: string; end_time?: string; venue?: string }[] | null;
      const value = Array.isArray(joined) ? joined[0] : joined;
      return value?.id && value.name ? [{ id: value.id, name: value.name, days: value.days ?? [], startTime: value.start_time?.slice(0, 5) ?? "", endTime: value.end_time?.slice(0, 5) ?? "", venue: value.venue ?? "" }] : [];
    });
    setClassDetails(details.length ? details : classes.filter((item) => item.id === student.classId));
    setGuardians(guardianResult.data ?? []);
    setRideSchedules((rideResult.data ?? []).map((item) => {
      const run = Array.isArray(item.vehicle_runs) ? item.vehicle_runs[0] : item.vehicle_runs;
      return { id: item.id, weekday: item.weekday, direction: item.direction as "pickup" | "dropoff", rideTime: item.ride_time?.slice(0, 5) ?? "", place: item.place ?? "", vehicleId: item.vehicle_id ?? "", vehicleName: item.vehicle_name ?? "", runId: item.run_id ?? "", runName: run?.name ?? "", teacherMemberId: item.teacher_member_id ?? "", handoffGuardian: item.handoff_guardian ?? "", specialNote: item.special_note ?? "" };
    }));
    setRegisteredBirth(studentResult.data?.birth ?? "");
    setRegisteredBirthYear(studentResult.data?.birth_year ?? (studentResult.data?.birth ? Number(studentResult.data.birth.slice(0, 4)) : null));
    setEnrollmentDate(studentResult.data?.enrollment_date ?? studentResult.data?.created_at?.slice(0, 10) ?? "");
  };

  useEffect(() => { void loadDetail(); }, [student.databaseId]);

  const scheduledWeekdays = [...new Set([...rideSchedules.map((item) => item.weekday), ...classDetails.flatMap((item) => item.days.map((day) => weekdayNames.indexOf(day))).filter((day) => day >= 0)])].sort((a, b) => weekdayOrder.indexOf(a) - weekdayOrder.indexOf(b));
  const teacherName = (memberId: string) => teachers.find((item) => item.id === memberId)?.name || "미지정";
  const vehicleName = (schedule: RideScheduleDetail) => schedule.vehicleId ? vehicles.find((item) => item.id === schedule.vehicleId)?.name || schedule.vehicleName || "차량 미지정" : schedule.vehicleName || (schedule.direction === "pickup" ? "개별 등원" : "개별 하원");
  const schoolGrade = calculateSchoolGrade(registeredBirthYear);

  return (
    <>
    <main className="student-detail-page">
      <div className="student-title-actions">
        <button className="student-back-button" onClick={back}><Icon name="back" />학생 명단으로</button>
      </div>
      <section className="student-profile-head">
        <span className="student-profile-avatar">{student.name[0]}</span>
        <div className="student-profile-copy">
          <h1>{student.name}</h1>
          <p>{classDetails.length ? `${classDetails.length}개 클래스 소속` : "소속 클래스 미등록"}</p>
        </div>
      </section>
      <section className="student-detail-grid">
        <article className="student-info-card">
          <div className="detail-card-heading"><h2>학생 정보</h2><button type="button" onClick={() => setEditingSection("student")}>수정하기</button></div>
          <dl>
            <div>
              <dt>생년월일</dt>
              <dd>{registeredBirth || (registeredBirthYear ? `${registeredBirthYear}년생` : "미등록")}</dd>
            </div>
            <div>
              <dt>학년</dt>
              <dd>{schoolGrade}</dd>
            </div>
            <div>
              <dt>학원 등록일</dt>
              <dd>{formatEnrollmentDate(enrollmentDate)}</dd>
            </div>
            <div>
              <dt>집 주소</dt>
              <dd>{student.homeAddress || "미등록"}</dd>
            </div>
          </dl>
        </article>
        <article className="student-info-card">
          <div className="detail-card-heading"><h2>보호자 정보</h2><button type="button" onClick={() => setEditingSection("guardian")}>수정하기</button></div>
          <dl>{guardians.length ? guardians.map((guardian) => <div key={guardian.id}><dt>{guardian.relationship || "보호자"}{guardian.is_primary ? " · 대표" : ""}</dt><dd>{guardian.name} · {guardian.phone}</dd></div>) : <><div><dt>보호자 관계</dt><dd>{student.guardian}</dd></div><div><dt>연락처</dt><dd>{student.phone}</dd></div></>}</dl>
        </article>
        <article className="student-class-summary-card">
          <div className="detail-card-heading"><div><h2>클래스 정보</h2><p>{classDetails.length}개 클래스 소속</p></div><button type="button" onClick={() => setEditingSection("class")}>수정하기</button></div>
          <div className="class-summary-list">
            {classDetails.map((item, index) => <section key={item.id}><div><span>{index === 0 ? "대표" : "추가"}</span><strong>{item.name}</strong></div><p>{item.days.join(" · ") || "요일 미등록"}</p><small>{item.startTime && item.endTime ? `${item.startTime} ~ ${item.endTime}` : "시간 미등록"}{item.venue ? ` · ${item.venue}` : ""}</small></section>)}
            {!classDetails.length && <p className="detail-empty-state">등록된 클래스가 없습니다.</p>}
          </div>
        </article>
        <article className="ride-detail-card weekday-ride-card">
          <div className="detail-card-heading"><div><h2>승·하원 정보</h2><p>요일별 등원부터 수업, 하원까지 순서대로 표시됩니다.</p></div><button type="button" onClick={() => setEditingSection("ride")}>수정하기</button></div>
          <div className="weekday-ride-list">
            {scheduledWeekdays.map((day) => {
              const pickup = rideSchedules.find((item) => item.weekday === day && item.direction === "pickup");
              const dropoff = rideSchedules.find((item) => item.weekday === day && item.direction === "dropoff");
              const dayClasses = classDetails.filter((item) => item.days.includes(weekdayNames[day])).sort((a, b) => a.startTime.localeCompare(b.startTime));
              const renderRideStep = (schedule: RideScheduleDetail | undefined, label: string) => <section className={`student-day-step ride-step ${!schedule ? "empty" : ""}`}><div className="day-step-label"><span>{label}</span></div>{schedule ? schedule.vehicleId ? <div><strong>{schedule.rideTime || "시간 미등록"}</strong><p>{schedule.place || "장소 미등록"}</p><small>{vehicleName(schedule)} · {schedule.runName || "회차 미배정"} · 담당 {teacherName(schedule.teacherMemberId)}</small>{schedule.specialNote && <em>특이사항 · {schedule.specialNote}</em>}</div> : <div><strong>개별 {label}</strong>{schedule.handoffGuardian && <p>인계 보호자 · {schedule.handoffGuardian}</p>}{schedule.specialNote && <em>특이사항 · {schedule.specialNote}</em>}</div> : <div><strong>등록된 정보 없음</strong><p>수정하기에서 추가할 수 있습니다.</p></div>}</section>;
              return <section className="weekday-ride-group student-day-card" key={day}><header><strong>{weekdayNames[day]}요일</strong><span>{dayClasses.length}개 수업</span></header><div className="student-day-flow">{renderRideStep(pickup, "등원")}{dayClasses.map((item) => <section className="student-day-step class-step" key={item.id}><div className="day-step-label"><span>수업</span></div><div><strong>{item.name}</strong><p>{item.startTime && item.endTime ? `${item.startTime} ~ ${item.endTime}` : "시간 미등록"}</p><small>{item.venue || "장소 미등록"} · 담당 {teacherName(student.teacherMemberId ?? "")}</small></div></section>)}{renderRideStep(dropoff, "하원")}</div></section>;
            })}
            {!scheduledWeekdays.length && <div className="detail-empty-state ride-empty-state"><strong>등록된 승·하원 스케줄이 없습니다.</strong><p>요일별 승하원 추가 버튼을 눌러 첫 스케줄을 등록해주세요.</p></div>}
          </div>
          {(student.handoffGuardian || student.rideNotes) && <dl className="ride-extra-details">{student.handoffGuardian && <div><dt>인계 가능 보호자</dt><dd>{student.handoffGuardian}</dd></div>}{student.rideNotes && <div><dt>공통 특이사항</dt><dd>{student.rideNotes}</dd></div>}</dl>}
        </article>
        {student.generalNotes && <article className="ride-detail-card"><h2>일반 특이사항</h2><p className="general-note-copy">{student.generalNotes}</p></article>}
      </section>
    </main>
    {editingSection && (
      <StudentEditPage
        student={student}
        centerId={centerId}
        classes={classes}
        vehicles={vehicles}
        teachers={teachers}
        managers={managers}
        operatingHours={operatingHours}
        initialSection={editingSection}
        modal
        back={() => setEditingSection(null)}
        onSaved={async () => { await onSaved(); await loadDetail(); }}
      />
    )}
    </>
  );
}
