import { describe, expect, it } from "vitest";
import {
  formatDateDdMmYyyy,
  formatDateTimeDdMmYyyy,
  getTodayIsoDate,
  isValidIsoDate,
  parseDateInput,
  hasValidDateFilters,
  formatDateInputText,
} from "./date";

describe("date utils", () => {
  it.each([
    ["30102026", "30/10/2026"],
    ["301", "30/1"],
    ["30/10/", "30/10/"],
    ["30/", "30/"],
    ["", ""],
  ])("formats numeric typing %s", (text, expected) => {
    expect(formatDateInputText(text)).toBe(expected);
  });
  it.each([
    ["30/10/2026", "2026-10-30"],
    ["10/11/2026", "2026-11-10"],
    ["29/02/2024", "2024-02-29"],
    ["01/01/0001", "0001-01-01"],
  ])("parses fixed day/month/year %s", (text, iso) => {
    expect(parseDateInput(text)).toBe(iso);
  });
  it.each([
    "10/30/2026",
    "29/02/2026",
    "31/04/2026",
    "1/1/2026",
    "30/10/",
    "01/01/0000",
    "2026-10-30",
  ])("rejects malformed input %s", (text) => {
    expect(parseDateInput(text)).toBeNull();
  });
  it("does not query with partially typed or impossible date filters", () => {
    expect(hasValidDateFilters({ from: "30/10/" })).toBe(false);
    expect(hasValidDateFilters({ start_date: "31/02/2026" })).toBe(false);
    expect(
      hasValidDateFilters({ from: "2026-10-30", to: "", search: "query" }),
    ).toBe(true);
  });
  it.each([
    "2024-02-29",
    "2000-02-29",
    "2018-11-04",
    "0001-01-01",
    "2026-10-29",
  ])("validates calendar date %s independently of timezone", (day) => {
    expect(isValidIsoDate(day)).toBe(true);
  });
  it.each([
    "",
    "2026-02-29",
    "1900-02-29",
    "2026-04-31",
    "2026-00-10",
    "2026-13-01",
    "2026-01-00",
    "0000-01-01",
    "10000-01-01",
    "29/10/2026",
    "2026-1-1",
    "2026-10-29T00:00:00Z",
  ])("rejects invalid sale date %s", (day) => {
    expect(isValidIsoDate(day)).toBe(false);
  });
  it("preserves four-digit years below 100 when formatting a selected date", () => {
    expect(formatDateDdMmYyyy("0001-01-01")).toBe("01/01/0001");
  });
  it("formats ISO date-only values as dd/mm/yyyy", () => {
    expect(formatDateDdMmYyyy("2026-04-26")).toBe("26/04/2026");
  });

  it("formats ISO datetime values with dd/mm/yyyy hh:mm", () => {
    expect(formatDateTimeDdMmYyyy("2026-04-26T10:35:00")).toBe(
      "26/04/2026 10:35",
    );
  });

  it.each([
    ["2026-01-01", "01/01/2026"],
    ["2018-11-04", "04/11/2018"],
    ["2024-02-29", "29/02/2024"],
    ["04/11/2018", "04/11/2018"],
  ])("does not invent a time for calendar date %s", (date, expected) => {
    expect(formatDateTimeDdMmYyyy(date)).toBe(expected);
  });

  it("keeps invalid values untouched", () => {
    expect(formatDateDdMmYyyy("not-a-date")).toBe("not-a-date");
  });

  it("builds local ISO date without UTC shift", () => {
    const reference = new Date(2026, 3, 26, 23, 59, 59);
    expect(getTodayIsoDate(reference)).toBe("2026-04-26");
  });
});
