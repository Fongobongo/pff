import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { statsJobs } from "@/db/schema";

export type JobStatus = "pending" | "running" | "completed" | "failed";

export type Job<T> = {
  id: string;
  key: string;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  total?: number;
  processed?: number;
  error?: string;
  result?: T;
};

const jobs = new Map<string, Job<unknown>>();
const jobsByKey = new Map<string, string>();

const JOB_TTL_MS = 1000 * 60 * 60;

function pruneExpired() {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.updatedAt > JOB_TTL_MS) {
      jobs.delete(id);
      if (jobsByKey.get(job.key) === id) {
        jobsByKey.delete(job.key);
      }
    }
  }
}

function safeDb() {
  try {
    return getDb();
  } catch {
    return null;
  }
}

function rowToJob<T>(row: typeof statsJobs.$inferSelect): Job<T> {
  return {
    id: row.id,
    key: row.key,
    status: row.status as JobStatus,
    createdAt: row.createdAt?.getTime?.() ?? Date.now(),
    updatedAt: row.updatedAt?.getTime?.() ?? Date.now(),
    total: row.total ?? undefined,
    processed: row.processed ?? undefined,
    error: row.error ?? undefined,
    result: row.result as T,
  };
}

function normalizeUpdate<T>(patch: Partial<Job<T>>) {
  const update: Partial<typeof statsJobs.$inferInsert> = {};
  if (patch.status) update.status = patch.status;
  if ("total" in patch) update.total = patch.total ?? null;
  if ("processed" in patch) update.processed = patch.processed ?? null;
  if ("error" in patch) update.error = patch.error ?? null;
  if ("result" in patch) update.result = patch.result ?? null;
  update.updatedAt = new Date();
  return update;
}

export async function getJob<T>(id: string): Promise<Job<T> | undefined> {
  const db = safeDb();
  if (!db) {
    pruneExpired();
    return jobs.get(id) as Job<T> | undefined;
  }

  const rows = await db.select().from(statsJobs).where(eq(statsJobs.id, id)).limit(1);
  const row = rows[0];
  return row ? rowToJob<T>(row) : undefined;
}

export async function getJobByKey<T>(key: string): Promise<Job<T> | undefined> {
  const db = safeDb();
  if (!db) {
    pruneExpired();
    const id = jobsByKey.get(key);
    if (!id) return undefined;
    return jobs.get(id) as Job<T> | undefined;
  }

  const rows = await db.select().from(statsJobs).where(eq(statsJobs.key, key)).limit(1);
  const row = rows[0];
  return row ? rowToJob<T>(row) : undefined;
}

export async function createJob<T>(key: string, total?: number): Promise<Job<T>> {
  const db = safeDb();
  if (!db) {
    pruneExpired();
    const existingId = jobsByKey.get(key);
    if (existingId) {
      const existing = jobs.get(existingId) as Job<T> | undefined;
      if (existing && existing.status !== "failed") {
        return existing;
      }
    }

    const job: Job<T> = {
      id: randomUUID(),
      key,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      total,
      processed: 0,
    };

    jobs.set(job.id, job);
    jobsByKey.set(key, job.id);
    return job;
  }

  const existingRows = await db.select().from(statsJobs).where(eq(statsJobs.key, key)).limit(1);
  const existingRow = existingRows[0];
  if (existingRow && existingRow.status !== "failed") {
    return rowToJob<T>(existingRow);
  }

  if (existingRow && existingRow.status === "failed") {
    const [updated] = await db
      .update(statsJobs)
      .set({
        status: "pending",
        total: total ?? existingRow.total,
        processed: 0,
        error: null,
        result: null,
        updatedAt: new Date(),
      })
      .where(eq(statsJobs.id, existingRow.id))
      .returning();
    return rowToJob<T>(updated ?? existingRow);
  }

  const id = randomUUID();
  const [row] = await db
    .insert(statsJobs)
    .values({
      id,
      key,
      status: "pending",
      total: total ?? null,
      processed: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return rowToJob<T>(row);
}

export async function updateJob<T>(id: string, patch: Partial<Job<T>>) {
  const db = safeDb();
  if (!db) {
    const job = jobs.get(id) as Job<T> | undefined;
    if (!job) return;
    jobs.set(id, {
      ...job,
      ...patch,
      updatedAt: Date.now(),
    });
    return;
  }

  const update = normalizeUpdate(patch);
  await db.update(statsJobs).set(update).where(eq(statsJobs.id, id));
}

export async function completeJob<T>(id: string, result: T) {
  await updateJob(id, { status: "completed", result });
}

export async function failJob(id: string, error: string) {
  await updateJob(id, { status: "failed", error });
}
