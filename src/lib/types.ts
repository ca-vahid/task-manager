import { Timestamp } from "firebase/firestore";

export interface Technician {
  id: string;
  name: string;
  email: string;
  agentId: string;
}

export interface Category {
  id: string;
  value: string;
  displayId: number;
}

// Interface for tickets
export interface Ticket {
  id: string;
  ticketNumber: string;
  createdAt: Timestamp;
  url: string;
}

// New interface for task groups
export interface Group {
  id: string;
  name: string;
  description: string;
}

export enum TaskStatus {
  Open = "Open",
  Pending = "Pending",
  Resolved = "Resolved",
}

export enum PriorityLevel {
  Low = "Low",
  Medium = "Medium",
  High = "High",
  Critical = "Critical",
}

// Control status enum used by Dashboard component
export enum ControlStatus {
  InProgress = "In Progress",
  InReview = "In Review",
  Complete = "Complete"
}

// Companies enum used in ReportGenerator
export enum Company {
  BGC = "BGC Engineering",
  Cambio = "Cambio Consulting",
  None = "None"
}

export interface Task {
  id: string;
  title: string;
  explanation: string;
  status: TaskStatus;
  priorityLevel: PriorityLevel | null;
  estimatedCompletionDate: Timestamp | null;
  assigneeId: string | null;
  order: number;
  tags: string[];
  progress: number;
  lastUpdated: Timestamp | null;
  externalUrl: string | null;
  groupId: string | null; // Group the task belongs to
  ticketNumber: string | null;
  ticketUrl: string | null;
  categoryId: string | null; // Category ID from Freshservice
}

// Interface for Control - used in Dashboard component
export interface Control {
  id: string;
  dcfId: string;
  title: string;
  status: ControlStatus;
  priorityLevel?: PriorityLevel | null;
  estimatedCompletionDate?: Timestamp | null;
  assigneeId?: string | null;
  company?: Company;
  tags?: string[];
  progress?: number;
  explanation?: string;
  lastUpdated?: Timestamp | null;
  externalUrl?: string | null;
  order?: number;
  ticketNumber?: string | null;
  ticketUrl?: string | null;
}

// Interface for search and filter options
export interface TaskFilters {
  search: string;
  status: TaskStatus[] | null;
  priority: PriorityLevel[] | null;
  assignee: string[] | null;
  tags: string[] | null;
  group: string[] | null; // Filter by group IDs
  dateRange: {
    start: Timestamp | null;
    end: Timestamp | null;
  } | null;
}

// Interface for batch operations
export interface BatchOperation {
  taskIds: string[];
  updates: Partial<Omit<Task, 'id'>>;
}

// Type for view mode
export type ViewMode = 'kanban' | 'timeline' | 'compact';

// Type for view density
export type ViewDensity = 'full' | 'medium' | 'compact'; 