export type DepartmentRecord = {
  id: string | number;
  name?: string;
  code?: string | null;
  parentId?: string | number | null;
  parent?: DepartmentRecord | null;
  createdAt?: string;
};

export type DepartmentFormValues = {
  name: string;
  code: string;
  parentId: string | null;
};

/** NocoBase audit stamps, appended on the detail surfaces. */
export type UserStamp = {
  id: string | number;
  nickname?: string | null;
  username?: string | null;
};

export type EmployeeStatus = "active" | "onleave" | "terminated";

export type EmployeeRecord = {
  id: string | number;
  name?: string;
  email?: string | null;
  job_title?: string | null;
  status?: string | null;
  hire_date?: string | null;
  department_id?: string | number | null;
  department?: DepartmentRecord | null;
  manager_id?: string | number | null;
  manager?: EmployeeRecord | null;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: UserStamp | null;
  updatedBy?: UserStamp | null;
};

export type EmployeeFormValues = {
  name: string;
  email: string;
  job_title: string;
  status: string;
  hire_date: string | null;
  department_id: string | null;
  manager_id: string | null;
};

export type LeaveType = "annual" | "sick" | "unpaid";
export type LeaveStatus = "pending" | "approved" | "rejected";

export type LeaveRequestRecord = {
  id: string | number;
  type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  days?: number | null;
  reason?: string | null;
  status?: string | null;
  employee_id?: string | number | null;
  employee?: EmployeeRecord | null;
  approver_id?: string | number | null;
  approver?: UserStamp | null;
  approved_at?: string | null;
  decision_comment?: string | null;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: UserStamp | null;
  updatedBy?: UserStamp | null;
};

export type LeaveRequestFormValues = {
  employee_id: string | null;
  type: string;
  start_date: string | null;
  end_date: string | null;
  days: number | null;
  reason: string;
  status: string;
};
