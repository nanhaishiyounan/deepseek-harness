export type UserRef = {
  id: string | number;
  nickname?: string | null;
  username?: string | null;
  email?: string | null;
};

export type ProjectRecord = {
  id: string | number;
  name?: string;
  code?: string | null;
  status?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  owner?: UserRef | null;
  createdAt?: string;
  updatedAt?: string;
  completed_at?: string | null;
};

export type ProjectFormValues = {
  name: string;
  code: string;
  status: string;
  start_date: string | null;
  due_date: string | null;
  owner_id: string | null;
};

export type TaskRecord = {
  id: string | number;
  title?: string;
  status?: string | null;
  priority?: string | null;
  due_date?: string | null;
  project?: ProjectRecord | null;
  assignee?: UserRef | null;
  createdAt?: string;
  updatedAt?: string;
  completed_at?: string | null;
};

export type TaskFormValues = {
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  project_id: string | null;
  assignee_id: string | null;
};

export type MilestoneRecord = {
  id: string | number;
  name?: string;
  due_date?: string | null;
  done?: boolean | null;
  project?: ProjectRecord | null;
  createdAt?: string;
  completed_at?: string | null;
};

export type MilestoneFormValues = {
  name: string;
  due_date: string | null;
  done: boolean;
  project_id: string | null;
};

export type ChecklistRecord = {
  id: string | number;
  title?: string;
  done?: boolean | null;
  task?: TaskRecord | null;
  createdAt?: string;
};

export type ChecklistFormValues = {
  title: string;
  done: boolean;
  task_id: string | null;
};
