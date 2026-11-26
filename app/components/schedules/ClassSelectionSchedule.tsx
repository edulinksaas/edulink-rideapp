"use client";

import { useEffect, useMemo, useState } from "react";
import type { Student } from "../../types/student";
import type { ClassOption } from "../../types/class";
import type { ClassroomOption } from "../../types/classroom";

type TeacherOption = { id: string; name: string };

export function ClassSelectionSchedule({
  day,
  classes,
  classrooms,
  students,
  teachers,
  selectedClassIds,
  onToggleClass,
}: {
  day: string;
  classes: ClassOption[];
  classrooms: ClassroomOption[];
  students: Student[];
  teachers: TeacherOption[];
  selectedClassIds: string[];
  onToggleClass: (classId: string) => void;
}) {
  const [venue, setVenue] = useState("all");
  const dayClasses = useMemo(
    () => classes
      .filter((item) => item.status !== "inactive" && item.days.includes(day))
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [classes, day],
  );
  const classroomNames = useMemo(() => {
    const activeRooms = classrooms.filter((room) => room.status === "active").map((room) => room.name);
    if (activeRooms.length) return activeRooms;
    return Array.from(new Set(dayClasses.map((item) => item.venue).filter(Boolean)));
  }, [classrooms, dayClasses]);
  const visibleVenues = venue === "all" ? classroomNames : [venue];
  const scheduleRows = useMemo(() => Array.from(
    new Set(dayClasses.map((item) => `${item.startTime}~${item.endTime}`)),
  ).sort().map((time) => {
    const cells = Object.fromEntries(classroomNames.map((name) => [name, []])) as Record<string, ClassOption[]>;
    dayClasses.filter((item) => `${item.startTime}~${item.endTime}` === time).forEach((item) => {
      const roomName = classrooms.find((room) => room.id === item.classroomId)?.name ?? item.venue;
      if (roomName) cells[roomName] = [...(cells[roomName] ?? []), item];
    });
    return { time, cells };
  }), [classroomNames, classrooms, dayClasses]);

  useEffect(() => {
    if (venue !== "all" && !classroomNames.includes(venue)) setVenue("all");
  }, [classroomNames, venue]);

  const getClassInfo = (classItem: ClassOption) => {
    const enrolledStudents = students.filter((student) =>
      student.classIds?.includes(classItem.id) || student.classId === classItem.id,
    );
    const classroom = classrooms.find((item) => item.id === classItem.classroomId);
    const teacherIds = Array.from(new Set(
      enrolledStudents.map((student) => student.teacherMemberId).filter(Boolean),
    )) as string[];
    const teacherNames = teacherIds
      .map((teacherId) => teachers.find((teacher) => teacher.id === teacherId)?.name)
      .filter(Boolean) as string[];
    return {
      currentCount: enrolledStudents.length,
      capacity: classroom?.capacity,
      teacherName: teacherNames.length ? teacherNames.join(", ") : "담당 선생님 미등록",
    };
  };

  return (
    <div className="class-selection-schedule">
      <nav className="registration-venue-tabs" aria-label="강의실 선택">
        {["all", ...classroomNames].map((item) => (
          <button
            type="button"
            key={item}
            className={venue === item ? "active" : ""}
            onClick={() => setVenue(item)}
          >
            {item === "all" ? "전체 강의실" : item}
          </button>
        ))}
      </nav>
      {!scheduleRows.length ? (
        <p className="registration-schedule-empty">{day}요일에 등록된 클래스 스케줄이 없습니다.</p>
      ) : (
        <div className="registration-schedule-scroll">
          <section
            className="registration-schedule-table"
            style={{ "--room-count": Math.max(visibleVenues.length, 1) } as React.CSSProperties}
          >
            <div className="registration-schedule-head">
              <strong>시간</strong>
              {visibleVenues.map((item) => <strong key={item}>{item}<small>강의실</small></strong>)}
            </div>
            {scheduleRows.map((row) => (
              <div className="registration-schedule-row" key={row.time}>
                <div className="registration-time-cell">{row.time}</div>
                {visibleVenues.map((roomName) => {
                  const lessons = row.cells[roomName] ?? [];
                  return (
                    <div className="registration-lesson-cell" key={roomName}>
                      {!lessons.length && <span className="registration-empty-card" />}
                      {lessons.map((lesson) => {
                        const active = selectedClassIds.includes(lesson.id);
                        const info = getClassInfo(lesson);
                        return (
                          <button
                            type="button"
                            key={lesson.id}
                            className={`registration-lesson-card ${active ? "active" : ""}`}
                            aria-pressed={active}
                            onClick={() => onToggleClass(lesson.id)}
                          >
                            <strong>{lesson.name}</strong>
                            <span>{lesson.startTime}~{lesson.endTime}</span>
                            <small>{info.currentCount}명 / {info.capacity ? `${info.capacity}명` : "정원 미등록"}</small>
                            <em>{info.teacherName}</em>
                            <b>{active ? "✓ 선택됨" : "선택"}</b>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
