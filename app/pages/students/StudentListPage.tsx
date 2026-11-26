"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import type { Student } from "../../types/student";

export function StudentListPage({
  add,
  openStudent,
  studentRows,
  setStudentRows,
}: {
  add: () => void;
  openStudent: (student: Student) => void;
  studentRows: Student[];
  setStudentRows: (students: Student[]) => void;
}) {
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [dragging, setDragging] = useState(false);
  const readCell = (row: Record<string, unknown>, names: string[]) =>
    String(
      names
        .map((name) => row[name])
        .find((value) => value !== undefined && value !== null) ?? "",
    ).trim();
  const importExcel = async (file: File) => {
    setExcelFile(file);
    setUploadMessage("파일을 읽고 있습니다...");
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      });
      const imported = rows
        .map((row, index) => {
          const name = readCell(row, [
            "학생 이름",
            "학생이름",
            "회원 이름",
            "회원이름",
            "이름",
          ]);
          const className = readCell(row, [
            "클래스 정보",
            "클래스정보",
            "소속 클래스",
            "클래스",
          ]);
          return {
            name,
            id:
              readCell(row, ["회원번호", "학생번호", "ID", "id"]) ||
              `M${String(index + 1).padStart(3, "0")}`,
            birth: readCell(row, ["생년월일", "생일"]) || "-",
            className: className || "미등록",
            classInfo: readCell(row, [
              "수업 정보",
              "수업정보",
              "담당 선생님",
              "담당선생님",
              "담당",
            ]),
            pickupPlace:
              readCell(row, [
                "승원 장소",
                "승원장소",
                "승원 정보",
                "승원정보",
                "등원 장소",
                "등원장소",
              ]) || "미등록",
            pickupInfo: readCell(row, [
              "승원 시간",
              "승원시간",
              "등원 시간",
              "등원시간",
              "승원 차량",
              "등원 차량",
            ]),
            dropoffPlace:
              readCell(row, [
                "하원 장소",
                "하원장소",
                "하원 정보",
                "하원정보",
              ]) || "미등록",
            dropoffInfo: readCell(row, ["하원 시간", "하원시간", "하원 차량"]),
            guardian:
              readCell(row, ["보호자 관계", "보호자관계", "보호자"]) || "-",
            phone:
              readCell(row, [
                "보호자 연락처",
                "보호자연락처",
                "연락처",
                "전화번호",
              ]) || "-",
          };
        })
        .filter((student) => student.name);
      if (!imported.length) throw new Error("학생 이름 열을 찾지 못했습니다.");
      setStudentRows(imported);
      setUploadMessage(
        `${imported.length}명의 학생 명단이 자동으로 업데이트되었습니다.`,
      );
    } catch (error) {
      setUploadMessage(
        error instanceof Error
          ? error.message
          : "파일을 읽지 못했습니다. 엑셀 형식을 확인해주세요.",
      );
    }
  };
  return (
    <main className="student-table-page">
      <section className="student-table-title">
        <div>
          <span>총 {studentRows.length}명</span>
          <h1>학생 명단</h1>
        </div>
        <div className="student-title-actions">
          <label className="excel-upload-button">
            ⇧ 엑셀 업로드
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importExcel(file);
              }}
            />
          </label>
          <button onClick={add}>＋ 학생 등록</button>
        </div>
      </section>
      <label
        className={`excel-drop-zone ${dragging ? "dragging" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) void importExcel(file);
        }}
      >
        <span>⇧</span>
        <strong>엑셀 파일을 이곳에 놓으면 명단이 자동 업데이트됩니다.</strong>
        <small>
          학생 이름, 클래스 정보, 승원 장소, 하원 장소 열을 자동으로 인식합니다.
        </small>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importExcel(file);
          }}
        />
      </label>
      {excelFile && (
        <section className="excel-upload-status" aria-live="polite">
          <span className="excel-file-icon">X</span>
          <div>
            <strong>{excelFile.name}</strong>
            <small>{uploadMessage}</small>
          </div>
          <b>{uploadMessage.includes("업데이트") ? "반영 완료" : "확인 중"}</b>
        </section>
      )}
      <section className="student-table" aria-label="학생 승하원 정보">
        <div className="student-table-head">
          <strong>학생 이름</strong>
          <strong>클래스 정보</strong>
          <strong>승원</strong>
          <strong>하원</strong>
        </div>
        {!studentRows.length && <p className="empty-state">등록된 학생이 없습니다.</p>}
        {studentRows.map((student) => (
          <div className="student-table-row" key={student.id}>
            <button
              className="student-name-link"
              onClick={() => openStudent(student)}
              aria-label={`${student.name} 개인 페이지 열기`}
            >
              <strong>{student.name}</strong>
              <small>{student.id}</small>
            </button>
            <span>
              <strong>{student.className}</strong>
              <small>{student.classInfo}</small>
            </span>
            <span>
              <strong>{student.pickupPlace}</strong>
              <small>{student.pickupInfo}</small>
            </span>
            <span>
              <strong>{student.dropoffPlace}</strong>
              <small>{student.dropoffInfo}</small>
            </span>
          </div>
        ))}
      </section>
    </main>
  );
}
