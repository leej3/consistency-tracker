import { expect, it } from "vitest";
import {
  BRISTOL_SCALE,
  buildDailySeries,
  getUtcWindowRange,
  toUtcHour,
  isCommentLengthValid,
} from "./consistency";
import type { WindowRange } from "../types";

const sampleRange: WindowRange = {
  ...getUtcWindowRange(5, 0),
  startDate: new Date(getUtcWindowRange(5, 0).start),
  endDateExclusive: new Date(getUtcWindowRange(5, 0).endExclusive),
  dayCount: 5,
};

it("builds UTC hour timestamps for entry form input", () => {
  expect(toUtcHour("2026-02-20", "13:00")).toBe("2026-02-20T13:00:00.000Z");
});

it("enforces hour-scale inputs", () => {
  expect(BRISTOL_SCALE).toEqual([1, 2, 3, 4, 5, 6, 7]);
});

it("rolls up daily averages and rolling score", () => {
  const entries = [
    {
      id: "1",
      person_id: "p",
      created_by: "u",
      at: `${sampleRange.start.slice(0, 10)}T10:00:00.000Z`,
      score: 6,
      comment: null,
      created_at: sampleRange.start,
      updated_at: sampleRange.start,
    },
    {
      id: "2",
      person_id: "p",
      created_by: "u",
      at: `${sampleRange.start.slice(0, 10)}T16:00:00.000Z`,
      score: 2,
      comment: null,
      created_at: sampleRange.start,
      updated_at: sampleRange.start,
    },
  ];

  const series = buildDailySeries(entries, sampleRange, 3);
  expect(series).toHaveLength(5);
  expect(series[0].count).toBe(2);
  expect(series[0].average).toBe(4);
  expect(series[0].hasLongGapWithoutEntry).toBe(false);
});

it("marks days that are part of >48h no-entry gaps", () => {
  const entries = [
    {
      id: "g1",
      person_id: "p",
      created_by: "u",
      at: `${sampleRange.start.slice(0, 10)}T00:00:00.000Z`,
      score: 4,
      comment: null,
      created_at: sampleRange.start,
      updated_at: sampleRange.start,
    },
  ];

  const series = buildDailySeries(entries, sampleRange, 3);
  expect(series[0].hasLongGapWithoutEntry).toBe(false);
  expect(series[1].hasLongGapWithoutEntry).toBe(false);
  expect(series[2].hasLongGapWithoutEntry).toBe(true);
  expect(series[3].hasLongGapWithoutEntry).toBe(true);
});

it("validates comment length", () => {
  expect(isCommentLengthValid("short")).toBe(true);
  expect(isCommentLengthValid("a".repeat(1000))).toBe(true);
  expect(isCommentLengthValid("a".repeat(1001))).toBe(false);
});
