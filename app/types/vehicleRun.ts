export type VehicleRun = {
  id: string;
  centerId: string;
  name: string;
  days: number[];
  vehicleId: string;
  startTime: string;
  endTime: string;
  driverMemberId?: string;
  companionMemberId?: string;
  status: "active" | "inactive";
};

export type VehicleRunOption = Pick<
  VehicleRun,
  "id" | "name" | "days" | "vehicleId" | "startTime" | "endTime" | "status"
> & {
  driverMemberId?: string;
  companionMemberId?: string;
};
