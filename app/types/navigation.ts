export type View =
  | "home"
  | "center-timetable"
  | "students"
  | "student-detail"
  | "vehicles"
  | "center-management"
  | "settings"
  | "manager-register"
  | "manager-invite-signup"
  | "vehicle-register"
  | "driver-register"
  | "center-settings"
  | "class-management"
  | "vehicle-run-management"
  | "vehicle-run-reassignment"
  | "register-choice"
  | "student-register"
  | "register"
  | "companion-schedule-register"
  | "calendar"
  | "no-schedule"
  | "view-choice"
  | "schedule"
  | "class-schedule"
  | "change-choice"
  | "same-day-date"
  | "same-day-view-choice"
  | "same-day-schedule"
  | "same-day-class-schedule"
  | "vehicle-day"
  | "vehicle-view-choice"
  | "vehicle-schedule"
  | "vehicle-class-schedule"
  | "change"
  | "history";

export type NavigationItem = {
  view: View;
  label: string;
  icon: string;
  activeViews: View[];
  operatorOnly?: boolean;
};

export const navigationItems: NavigationItem[] = [
  { view: "home", label: "홈", icon: "⌂", activeViews: ["home", "center-timetable"] },
  {
    view: "calendar",
    label: "운행 관리",
    icon: "▤",
    activeViews: ["calendar", "no-schedule", "view-choice", "schedule", "class-schedule", "change-choice", "same-day-date", "same-day-view-choice", "same-day-schedule", "same-day-class-schedule", "vehicle-day", "vehicle-view-choice", "vehicle-schedule", "vehicle-class-schedule", "change", "history"],
  },
  {
    view: "students",
    label: "학생 관리",
    icon: "☷",
    activeViews: ["students", "student-detail", "student-register"],
  },
  {
    view: "center-management",
    label: "센터 관리",
    icon: "▦",
    activeViews: ["center-management", "vehicles", "center-settings", "class-management", "vehicle-run-management", "vehicle-run-reassignment", "manager-register", "vehicle-register", "driver-register"],
    operatorOnly: true,
  },
  {
    view: "settings",
    label: "설정",
    icon: "⚙",
    activeViews: ["settings"],
  },
];
