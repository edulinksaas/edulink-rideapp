export type ClassOption = {
  id: string;
  name: string;
  days: string[];
  startTime: string;
  endTime: string;
  venue: string;
  classroomId?: string;
  status: "active" | "inactive";
};