"use client";

import { useCallback, useState } from "react";
import { Icon } from "../../components/common/Icon";
import { ClassSelectionSchedule } from "../../components/schedules/ClassSelectionSchedule";
import { StudentRideRegistration } from "../../components/schedules/StudentRideRegistration";
import type { Student, StudentRideRegistration as RideRegistration } from "../../types/student";
import type { ClassOption } from "../../types/class";
import type { ClassroomOption } from "../../types/classroom";
import type { VehicleOption } from "../../types/vehicle";
import type { VehicleRunOption } from "../../types/vehicleRun";
import "../../student-pages.css";

export function StudentRegisterPage({
  back,
  onRegister,
  classOptions,
  studentRows,
  classrooms,
  teacherOptions,
  vehicleOptions,
  vehicleRuns,
  centerId,
  managers,
  openSettings,
}: {
  back: () => void;
  onRegister: (student: Student) => void | Promise<void>;
  classOptions: ClassOption[];
  studentRows: Student[];
  classrooms: ClassroomOption[];
  teacherOptions: { id: string; name: string }[];
  vehicleOptions: VehicleOption[];
  vehicleRuns: VehicleRunOption[];
  centerId: string;
  managers: { id: string; name: string; phone: string }[];
  openSettings: () => void;
}) {
  const [classDays, setClassDays] = useState<string[]>([]);
  const [activeScheduleDay, setActiveScheduleDay] = useState("");
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [rideSchedules, setRideSchedules] = useState<RideRegistration[]>([]);
  const [rideInformationComplete, setRideInformationComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const selectedClasses = classOptions.filter((item) => selectedClassIds.includes(item.id));
  const handleRideChange = useCallback((rides: RideRegistration[], complete: boolean) => {
    setRideSchedules(rides);
    setRideInformationComplete(complete);
  }, []);
  const toggleDay = (day: string) => {
    setClassDays((days) => {
      if (!days.includes(day)) {
        const nextDays = [...days, day];
        if (!activeScheduleDay) setActiveScheduleDay(day);
        return nextDays;
      }
      const nextDays = days.filter((item) => item !== day);
      setSelectedClassIds((ids) => ids.filter((id) => {
        const classItem = classOptions.find((item) => item.id === id);
        return classItem?.days.some((classDay) => nextDays.includes(classDay));
      }));
      if (activeScheduleDay === day) setActiveScheduleDay(nextDays[0] ?? "");
      return nextDays;
    });
  };
  const moveScheduleDay = (amount: number) => {
    if (!classDays.length) return;
    const currentIndex = Math.max(classDays.indexOf(activeScheduleDay), 0);
    const nextIndex = (currentIndex + amount + classDays.length) % classDays.length;
    setActiveScheduleDay(classDays[nextIndex]);
  };
  const toggleClass = (classId: string) => {
    setSelectedClassIds((ids) => ids.includes(classId) ? ids.filter((id) => id !== classId) : [...ids, classId]);
  };
  return (
    <main className="register-page">
      <button className="back" onClick={back}>
        <Icon name="back" />
        이전 화면
      </button>
      <section className="register-head">
        <span>학생 등록</span>
        <h1>학생 정보를 입력해주세요</h1>
        <p>학생과 수업을 선택한 후 요일별 승·하원 정보를 모두 입력해주세요.</p>
      </section>
      <form
        className="register-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (classDays.length === 0 || selectedClassIds.length === 0) {
            setMessage("수업 요일과 클래스를 한 개 이상 선택해주세요.");
            return;
          }
          if (classDays.some((day) => !selectedClasses.some((item) => item.days.includes(day)))) {
            setMessage("선택한 각 요일에서 클래스를 한 개 이상 선택해주세요.");
            return;
          }
          if (!rideInformationComplete) {
            setMessage("선택한 모든 요일의 등원과 하원 정보를 입력해주세요.");
            return;
          }
          setSubmitting(true);
          setMessage("");
          const data = new FormData(event.currentTarget);
          const homeAddress = [data.get("homeAddress"), data.get("homeDetail")]
            .map((value) => String(value ?? "").trim())
            .filter(Boolean)
            .join(" ");
          const selectedClass = selectedClasses[0];
          const selectedDays = classDays.filter((day) => selectedClasses.some((item) => item.days.includes(day)));
          const firstPickup = rideSchedules.find((ride) => ride.direction === "pickup");
          const firstDropoff = rideSchedules.find((ride) => ride.direction === "dropoff");
          try {
            await onRegister({
              name: String(data.get("name") ?? "").trim(),
              id: `M${String(Date.now()).slice(-6)}`,
              birth: String(data.get("birth") ?? "").replaceAll("-", ". "),
              className: selectedClasses.map((item) => item.name).join(", "),
              classInfo: selectedDays.join("·"),
              classId: selectedClass?.id,
              classIds: selectedClassIds,
              classDays: selectedDays,
              pickupTime: firstPickup?.time,
              dropoffTime: firstDropoff?.time,
              vehicleId: firstPickup?.vehicleId || firstDropoff?.vehicleId,
              vehicleName: firstPickup?.vehicleName || firstDropoff?.vehicleName,
              pickupPlace: firstPickup?.place ?? "",
              pickupInfo: firstPickup?.useType === "vehicle" ? [firstPickup.time, firstPickup.vehicleName].filter(Boolean).join(" · ") : "개별 등원",
              dropoffPlace: firstDropoff?.place ?? "",
              dropoffInfo: firstDropoff?.useType === "vehicle" ? [firstDropoff.time, firstDropoff.vehicleName].filter(Boolean).join(" · ") : "개별 하원",
              guardian: String(data.get("guardian") ?? ""),
              phone: String(data.get("phone") ?? ""),
              homeAddress,
              handoffGuardian: String(data.get("handoffGuardian") ?? ""),
              rideNotes: String(data.get("rideNotes") ?? ""),
              generalNotes: String(data.get("generalNotes") ?? ""),
              rideSchedules,
              photoName: (data.get("photo") as File | null)?.name ?? "",
            });
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "학생을 등록하지 못했습니다.");
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {!classOptions.length && (
          <section className="schedule-action-notice" role="alert">
            <strong>학생 등록 전에 기본 설정이 필요합니다.</strong>
            <p>클래스를 먼저 등록해주세요.</p>
            <button type="button" onClick={openSettings}>설정으로 이동</button>
          </section>
        )}
        <section className="form-section">
          <h2>필수 정보 · 학생 및 수업</h2>
          <div className="form-grid">
            <label>
              <span>학생 이름</span>
              <input name="name" required placeholder="이름을 입력해주세요" />
            </label>
            <fieldset className="class-day-field wide">
              <legend>수업 요일</legend>
              <div className="class-day-buttons">
                {["월", "화", "수", "목", "금", "토"].map((day) => (
                  <button
                    type="button"
                    key={day}
                    className={classDays.includes(day) ? "active" : ""}
                    aria-pressed={classDays.includes(day)}
                    onClick={() => toggleDay(day)}
                  >
                    {day}
                  </button>
                ))}
              </div>
              {classDays.length === 0 && (
                <small>수업 요일을 한 개 이상 선택해주세요.</small>
              )}
            </fieldset>
            {!!classDays.length && (
              <section className="student-class-schedule wide" aria-label="요일별 수업 시간표">
                <header className="schedule-day-navigator">
                  <button type="button" onClick={() => moveScheduleDay(-1)} aria-label="이전 선택 요일">‹</button>
                  <div>
                    <strong>{activeScheduleDay}요일 센터 스케줄</strong>
                    <span>{classDays.indexOf(activeScheduleDay) + 1} / {classDays.length}</span>
                  </div>
                  <button type="button" onClick={() => moveScheduleDay(1)} aria-label="다음 선택 요일">›</button>
                </header>
                <ClassSelectionSchedule
                  day={activeScheduleDay}
                  classes={classOptions}
                  classrooms={classrooms}
                  students={studentRows}
                  teachers={teacherOptions}
                  selectedClassIds={selectedClassIds}
                  onToggleClass={toggleClass}
                />
                {!!selectedClasses.length && (
                  <div className="selected-class-summary">
                    <strong>선택한 수업 {selectedClasses.length}개</strong>
                    <div>{selectedClasses.map((item) => <span key={item.id}>{item.name} · {item.days.join("·")} · {item.startTime}</span>)}</div>
                  </div>
                )}
              </section>
            )}
          </div>
        </section>
        <section className="form-section place-section">
          <h2>필수 정보 · 승·하원</h2>
          <p className="form-section-description">요일별로 등원과 하원 방법을 모두 등록해야 학생 등록을 완료할 수 있습니다.</p>
          <StudentRideRegistration centerId={centerId} days={classDays} selectedClasses={selectedClasses} runs={vehicleRuns} vehicles={vehicleOptions} managers={managers} onChange={handleRideChange} />
        </section>
        <section className="form-section optional-section">
          <h2>선택 정보 · 보호자 및 인계</h2>
          <div className="form-grid">
            <label>
              <span>보호자 이름 또는 관계</span>
              <input name="guardian" placeholder="예: 김영희(어머니)" />
            </label>
            <label>
              <span>보호자 연락처</span>
              <input name="phone" type="tel" placeholder="010-0000-0000" />
            </label>
            <label className="wide">
              <span>인계 가능한 보호자 정보</span>
              <input name="handoffGuardian" placeholder="예: 어머니, 아버지, 할머니" />
            </label>
            <label className="wide">
              <span>승·하원 특이사항</span>
              <textarea
                name="rideNotes"
                rows={3}
                placeholder="예: 주로 할머니가 데리러 오심, 혼자 올라감"
              />
            </label>
          </div>
        </section>
        <section className="form-section optional-section">
          <h2>선택 정보</h2>
          <p className="form-section-description">회원관리와 수업 운영에 참고할 정보입니다. 나중에 학생 개인 페이지에서도 입력할 수 있습니다.</p>
          <div className="form-grid">
            <label>
              <span>학생 사진 (선택)</span>
              <input name="photo" type="file" accept="image/*" />
            </label>
            <label>
              <span>생년월일</span>
              <input name="birth" type="date" />
            </label>
            <label className="wide">
              <span>집 주소</span>
              <input name="homeAddress" placeholder="도로명 주소를 입력해주세요" />
            </label>
            <label className="wide">
              <span>상세 주소</span>
              <input name="homeDetail" placeholder="동·호수 등 상세 주소를 입력해주세요" />
            </label>
            <label className="wide">
              <span>알레르기 및 일반 특이사항</span>
              <textarea name="generalNotes" rows={3} placeholder="수업·생활 중 참고할 내용을 입력해주세요." />
            </label>
          </div>
        </section>
        {message && <p className="auth-message" role="alert">{message}</p>}
        <button className="register-submit" type="submit" disabled={submitting || !classOptions.length || !selectedClassIds.length || !rideInformationComplete}>
          <Icon name="edit" />
          {submitting ? "등록 중..." : "학생 등록하기"}
        </button>
      </form>
    </main>
  );
}
