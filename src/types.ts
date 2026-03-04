export type Person = {
  id: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type ConsistencyEntry = {
  id: string;
  person_id: string;
  created_by: string;
  at: string;
  score: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

export type DailySeriesPoint = {
  date: string;
  label: string;
  count: number;
  average: number | null;
  rollingAverage: number | null;
  hasLongGapWithoutEntry: boolean;
};

export type WindowRange = {
  start: string;
  endExclusive: string;
  startDate: Date;
  endDateExclusive: Date;
  displayStartLabel: string;
  displayEndLabel: string;
  dayCount: number;
};
