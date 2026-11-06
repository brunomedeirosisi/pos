import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../errors.js";
const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  finish: vi.fn(),
  create: vi.fn(),
  lock: vi.fn(),
  recovery: vi.fn(),
}));
vi.mock("../modules/backup/repository/backup-schedule-repository.js", () => ({
  claimScheduledBackup: mocks.claim,
  finishScheduledBackup: mocks.finish,
}));
vi.mock("./backup-restore-service.js", () => ({
  createManagedBackup: mocks.create,
}));
vi.mock("./backup-lock.js", () => ({ withBackupLock: mocks.lock }));
vi.mock("./recovery-control.js", () => ({
  acquireRecoveryLease: mocks.recovery,
}));
vi.mock("../observability/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));
import {
  runScheduledBackup,
  startBackupScheduler,
} from "./backup-scheduler.js";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.claim.mockResolvedValue({
    id: "run-1",
    scheduledFor: "2026-10-30T06:00:00Z",
  });
  mocks.finish.mockResolvedValue(undefined);
  mocks.create.mockResolvedValue({ filename: "synthetic.zip" });
  mocks.lock.mockImplementation(async (fn) =>
    fn({
      signal: new AbortController().signal,
      backendPid: 1,
      assertHeld: vi.fn(),
    }),
  );
  mocks.recovery.mockResolvedValue({
    signal: new AbortController().signal,
    assertHeld: vi.fn(),
    release: vi.fn(),
  });
});
afterEach(() => vi.useRealTimers());
describe("automatic backup worker", () => {
  it("reuses the managed backup with the existing lease and a system actor", async () => {
    await runScheduledBackup();
    expect(mocks.create).toHaveBeenCalledWith(
      { userId: null },
      "automatic",
      expect.objectContaining({
        automatic: { runId: "run-1", scheduledFor: "2026-10-30T06:00:00Z" },
        lease: expect.objectContaining({ backendPid: 1 }),
      }),
    );
    expect(mocks.finish).toHaveBeenCalledWith("run-1", "synthetic.zip", null);
  });
  it("records a failure and permits a later tick to succeed", async () => {
    mocks.create.mockRejectedValueOnce(new Error("Synthetic storage failure"));
    await runScheduledBackup();
    expect(mocks.finish).toHaveBeenCalledWith(
      "run-1",
      null,
      "Synthetic storage failure",
    );
    await runScheduledBackup();
    expect(mocks.finish).toHaveBeenLastCalledWith(
      "run-1",
      "synthetic.zip",
      null,
    );
  });
  it.each(["backup_operation_in_progress", "database_restore_in_progress"])(
    "leaves due work pending while %s",
    async (message) => {
      if (message === "backup_operation_in_progress")
        mocks.lock.mockRejectedValue(new HttpError(409, message));
      else mocks.recovery.mockRejectedValue(new HttpError(503, message));
      await expect(runScheduledBackup()).resolves.toBeUndefined();
      expect(mocks.claim).not.toHaveBeenCalled();
    },
  );
  it("never overlaps ticks and resumes after a rejected iteration", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const run = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error("Synthetic outage"))
      .mockResolvedValue(undefined);
    const stop = startBackupScheduler(run, 1000);
    await vi.advanceTimersByTimeAsync(10000);
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(3);
    stop();
    await vi.advanceTimersByTimeAsync(10000);
    expect(run).toHaveBeenCalledTimes(3);
  });
});
