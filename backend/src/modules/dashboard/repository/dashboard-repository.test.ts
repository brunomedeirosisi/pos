import { afterEach, describe, expect, it, vi } from "vitest";
import { query } from "../../../db.js";
import { PgDashboardRepository } from "./dashboard-repository.js";
import { dashboardFilterSchema } from "../contracts/dashboard-contracts.js";

vi.mock("../../../db.js", () => ({ query: vi.fn() }));
afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); });
describe("dashboard calendar-day query parameters", () => {
  it.each(["2026-10-29", "2018-11-04", "2024-02-29"])(
    "keeps %s date-only instead of letting pg convert it to the process timezone",
    async (day) => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: "SELECT",
        oid: 0,
        fields: [],
      });
      await new PgDashboardRepository().getSummary(
        dashboardFilterSchema.parse({
          startDate: day,
          endDate: day,
          timezone: "America/Sao_Paulo",
        }),
      );
      expect(vi.mocked(query).mock.calls[0][1]?.slice(0, 2)).toEqual([
        day,
        day,
      ]);
    },
  );
});
