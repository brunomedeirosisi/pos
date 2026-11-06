import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
const { archive } = vi.hoisted(() => ({ archive: vi.fn() }));
vi.mock("../../src/utils/backup.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/utils/backup.js")>()),
  createBackupArchive: archive,
  BACKUP_RETENTION_COUNT: 365,
}));
import { query, closeDatabase, acquireDatabaseClient } from "../../src/db.js";
import {
  initializeRecoveryControl,
  acquireRecoveryLease,
} from "../../src/services/recovery-control.js";
import { runScheduledBackup } from "../../src/services/backup-scheduler.js";
import { BACKUP_LOCK_KEY } from "../../src/services/backup-lock.js";
import { getBackupSchedule } from "../../src/modules/backup/repository/backup-schedule-repository.js";
import { backupRouter } from "../../src/modules/backup/http/backup-router.js";
import { listsRouter } from "../../src/routes/lists.js";
import { errorHandler } from "../../src/middleware/error-handler.js";
import { prepareDatabase } from "../support/database.js";

const actorId = randomUUID();
let permissions = ["*"];
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = {
    id: actorId,
    email: "schedule@example.test",
    fullName: "Synthetic scheduler",
    role: "test",
    permissions,
    discountLimit: 0,
  };
  next();
});
app.use("/admin", backupRouter);
app.use("/lists", listsRouter);
app.use(errorHandler);
beforeAll(async () => {
  await prepareDatabase();
  await initializeRecoveryControl();
  await query(
    "insert into app_user(id,email,password_hash,full_name) values($1,$2,'synthetic','Synthetic scheduler')",
    [actorId, actorId + "@example.test"],
  );
});
beforeEach(async () => {
  permissions = ["*"];
  archive.mockReset();
  archive.mockImplementation(async () => ({
    filename: "scheduled-test-" + randomUUID() + ".zip",
    sizeBytes: 100,
    checksum: "a".repeat(64),
    metadata: { generatedBy: "pos-backend" },
  }));
  await query(
    "update pos_recovery.backup_schedule set enabled=false,daily_time='03:00',next_run_at=null where singleton",
  );
});
afterEach(async () => {
  await query(
    "delete from system_backup_operation where requested_by=$1 or details->>'prefix' in ('automatic','schedule-test')",
    [actorId],
  );
  await query(
    "delete from system_backup where filename like 'scheduled-test-%'",
  );
  await query("delete from pos_recovery.backup_run");
  await query(
    "update pos_recovery.backup_schedule set enabled=false,daily_time='03:00',next_run_at=null where singleton",
  );
  await query("delete from audit_log where user_id=$1 or action=$2", [
    actorId,
    "BACKUP_CREATE",
  ]);
});
afterAll(async () => {
  await query("delete from app_user where id=$1", [actorId]);
  await closeDatabase();
});
const save = (enabled = true, time = "03:00") =>
  request(app).patch("/admin/backup/schedule").send({ enabled, time });
async function due() {
  await save();
  await query(
    "update pos_recovery.backup_schedule set next_run_at=now()-interval '2 days' where singleton",
  );
}
async function rows() {
  return (
    await query("select * from pos_recovery.backup_run order by started_at")
  ).rows;
}
describe("durable daily backup scheduler and authorization", () => {
  it("defaults off, saves preferences across sessions and disables only automatic runs", async () => {
    expect((await getBackupSchedule()).enabled).toBe(false);
    const saved = await save(true, "23:59");
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body).toMatchObject({ enabled: true, time: "23:59" });
    expect(new Date(saved.body.nextRunAt).getTime()).toBeGreaterThan(
      Date.now(),
    );
    const other = await acquireDatabaseClient();
    try {
      expect(
        (
          await other.query(
            "select enabled,daily_time::text from pos_recovery.backup_schedule",
          )
        ).rows[0],
      ).toMatchObject({ enabled: true, daily_time: "23:59:00" });
    } finally {
      other.release();
    }
    const disabled = await save(false, "23:59");
    expect(disabled.body.nextRunAt).toBeNull();
    await runScheduledBackup();
    expect(archive).not.toHaveBeenCalled();
    const manual = await request(app).post("/admin/backup");
    expect(manual.status).toBe(201);
    expect(archive).toHaveBeenCalledTimes(1);
  });
  it.each([
    "24:00",
    "23:60",
    "3:00",
    "03:0",
    "12:30:00",
    "12:30 PM",
    "",
    null,
    12,
  ])("rejects invalid time %j without changing preferences", async (time) => {
    expect(
      (
        await request(app)
          .patch("/admin/backup/schedule")
          .send({ enabled: true, time })
      ).status,
    ).toBe(400);
    expect((await getBackupSchedule()).enabled).toBe(false);
  });
  it("requires the explicit schedule permission, independent of manual create permission", async () => {
    permissions = ["system:backup:read", "system:backup:create"];
    expect((await save()).status).toBe(403);
    expect((await request(app).get("/admin/backup/schedule")).status).toBe(200);
    permissions = ["system:backup:read", "system:backup:schedule"];
    expect((await save()).status).toBe(200);
    permissions = [];
    expect((await request(app).get("/admin/backup/schedule")).status).toBe(403);
  });
  it("catches up once after several missed days, persists the result and advances to a future slot", async () => {
    await due();
    await runScheduledBackup();
    await runScheduledBackup();
    expect(archive).toHaveBeenCalledTimes(1);
    expect((await rows()).map((r) => r.status)).toEqual(["completed"]);
    const state = await getBackupSchedule();
    expect(state.lastRun?.type).toBe("automatic");
    expect(state.lastRun?.filename).toMatch(/^scheduled-test-/);
    expect(new Date(state.nextRunAt!).getTime()).toBeGreaterThan(Date.now());
    const history = await request(app).get("/lists/backup-executions");
    expect(history.status, JSON.stringify(history.body)).toBe(200);
    expect(
      history.body.items.filter(
        (r: { type: string }) => r.type === "automatic",
      ),
    ).toHaveLength(1);
    expect(
      (
        await query(
          "select metadata->>'trigger' as trigger from system_backup where filename=$1",
          [state.lastRun!.filename],
        )
      ).rows[0].trigger,
    ).toBe("automatic");
  });
  it("prevents duplicates between worker instances and permits disabling during a running backup", async () => {
    await due();
    let release!: (backup: unknown) => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    archive.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
          started();
        }),
    );
    const first = runScheduledBackup();
    await startedPromise;
    await runScheduledBackup();
    expect(archive).toHaveBeenCalledTimes(1);
    expect((await getBackupSchedule()).lastRun?.status).toBe("running");
    expect((await save(false)).status).toBe(200);
    release({
      filename: "scheduled-test-" + randomUUID() + ".zip",
      sizeBytes: 100,
      checksum: "a".repeat(64),
      metadata: {},
    });
    await first;
    expect((await rows())[0].status).toBe("completed");
    expect((await getBackupSchedule()).enabled).toBe(false);
  });
  it("leaves a due run pending while manual backup or restore owns its lock", async () => {
    await due();
    const lock = await acquireDatabaseClient();
    try {
      await lock.query("select pg_advisory_lock($1)", [BACKUP_LOCK_KEY]);
      await runScheduledBackup();
      expect(await rows()).toHaveLength(0);
    } finally {
      await lock.query("select pg_advisory_unlock($1)", [BACKUP_LOCK_KEY]);
      lock.release();
    }
    const restore = await acquireRecoveryLease(true);
    try {
      await runScheduledBackup();
      expect(await rows()).toHaveLength(0);
    } finally {
      await restore.release();
    }
    await runScheduledBackup();
    expect(archive).toHaveBeenCalledTimes(1);
  });
  it("records failure without disabling tomorrow and a later due execution succeeds", async () => {
    await due();
    archive.mockRejectedValueOnce(new Error("Synthetic disk failure"));
    await runScheduledBackup();
    expect((await rows())[0]).toMatchObject({
      status: "failed",
      error_message: "Synthetic disk failure",
    });
    expect((await getBackupSchedule()).enabled).toBe(true);
    await query(
      "update pos_recovery.backup_schedule set next_run_at=now()-interval '1 minute' where singleton",
    );
    await runScheduledBackup();
    expect((await rows()).map((r) => r.status)).toEqual([
      "failed",
      "completed",
    ]);
  });
  it("reconciles interrupted runs from a previous process without creating duplicates", async () => {
    const abandoned = randomUUID(),
      published = randomUUID();
    await query(
      "insert into pos_recovery.backup_run(id,scheduled_for,status) values($1,now()-interval '2 days','running'),($2,now()-interval '1 day','running')",
      [abandoned, published],
    );
    await query(
      "insert into system_backup(filename,checksum,metadata) values('scheduled-test-recovered.zip',$1,$2::jsonb)",
      ["a".repeat(64), JSON.stringify({ automaticRunId: published })],
    );
    const manual = randomUUID();
    await query("insert into system_backup_operation(id,operation_type,status,requested_by,details) values($1,'backup','running',$2,'{}')", [manual,actorId]);
    await query("insert into system_backup(filename,checksum,metadata) values('scheduled-test-manual.zip',$1,$2::jsonb)", ['a'.repeat(64),JSON.stringify({operationId:manual})]);
    await runScheduledBackup();
    expect((await query('select status,backup_filename from system_backup_operation where id=$1',[manual])).rows[0]).toEqual({status:'completed',backup_filename:'scheduled-test-manual.zip'});
    expect((await rows()).find((r) => r.id === abandoned)).toMatchObject({
      status: "failed",
      error_message: "automatic_backup_interrupted",
    });
    expect((await rows()).find((r) => r.id === published)).toMatchObject({
      status: "completed",
      backup_filename: "scheduled-test-recovered.zip",
    });
    expect(archive).not.toHaveBeenCalled();
  });
  it("updates the next occurrence after editing the time and rejects extra config fields", async () => {
    const first = await save(true, "00:01"),
      second = await save(true, "23:59");
    expect(second.body.nextRunAt).not.toBe(first.body.nextRunAt);
    expect(
      (
        await request(app)
          .patch("/admin/backup/schedule")
          .send({ enabled: true, time: "03:00", timezone: "UTC" })
      ).status,
    ).toBe(400);
  });
  it.each([
    [
      "03:00",
      "2026-10-30T05:59:00Z",
      "America/Recife",
      "2026-10-30T06:00:00.000Z",
    ],
    [
      "03:00",
      "2026-10-30T06:00:00Z",
      "America/Recife",
      "2026-10-31T06:00:00.000Z",
    ],
    [
      "00:30",
      "2018-11-04T02:59:00Z",
      "America/Sao_Paulo",
      "2018-11-04T03:30:00.000Z",
    ],
    [
      "00:30",
      "2018-11-04T03:31:00Z",
      "America/Sao_Paulo",
      "2018-11-05T02:30:00.000Z",
    ],
    [
      "01:30",
      "2026-11-01T04:00:00Z",
      "America/New_York",
      "2026-11-01T06:30:00.000Z",
    ],
  ])(
    "calculates %s after %s using %s calendar rules",
    async (time, reference, zone, expected) => {
      const result = (
        await query(
          "select pos_recovery.next_backup_at($1::time,$2::timestamptz,$3) as next",
          [time, reference, zone],
        )
      ).rows[0].next;
      expect(new Date(result).toISOString()).toBe(expected);
    },
  );
});
