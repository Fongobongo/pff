import { randomUUID } from "node:crypto";

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

export function getJob<T>(id: string): Job<T> | undefined {
  pruneExpired();
  return jobs.get(id) as Job<T> | undefined;
}

export function getJobByKey<T>(key: string): Job<T> | undefined {
  pruneExpired();
  const id = jobsByKey.get(key);
  if (!id) return undefined;
  return jobs.get(id) as Job<T> | undefined;
}

export function createJob<T>(key: string, total?: number): Job<T> {
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

export function updateJob<T>(id: string, patch: Partial<Job<T>>) {
  const job = jobs.get(id) as Job<T> | undefined;
  if (!job) return;
  jobs.set(id, {
    ...job,
    ...patch,
    updatedAt: Date.now(),
  });
}

export function completeJob<T>(id: string, result: T) {
  updateJob(id, { status: "completed", result });
}

export function failJob(id: string, error: string) {
  updateJob(id, { status: "failed", error });
}
