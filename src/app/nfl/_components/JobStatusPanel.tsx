"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type JobState = {
  id?: string;
  status?: string;
  total?: number;
  processed?: number;
  error?: string;
};

type Props = {
  jobId?: string;
  initialStatus?: string;
  initialProcessed?: number;
  initialTotal?: number;
};

export default function JobStatusPanel({ jobId, initialStatus, initialProcessed, initialTotal }: Props) {
  const router = useRouter();
  const [job, setJob] = useState<JobState>({
    id: jobId,
    status: initialStatus,
    processed: initialProcessed,
    total: initialTotal,
  });
  const [streamError, setStreamError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/stats/jobs/${jobId}/stream`);
    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as JobState;
        setJob(payload);
        setStreamError(null);
        if (payload.status === "completed") {
          es.close();
          router.refresh();
        }
      } catch (err) {
        setStreamError(err instanceof Error ? err.message : "Stream parse error");
      }
    };
    es.onerror = () => {
      setStreamError("Stream disconnected");
      es.close();
    };
    return () => es.close();
  }, [jobId, router]);

  if (!jobId) {
    return <div>Job ID missing.</div>;
  }

  const processed = job.processed ?? 0;
  const total = job.total ?? 0;

  return (
    <div>
      <div>Job status: {job.status ?? "unknown"}</div>
      <div>
        Processed {processed} / {total}
      </div>
      {job.error ? <div className="mt-2 text-red-500">Error: {job.error}</div> : null}
      {streamError ? <div className="mt-2 text-amber-500">Stream: {streamError}</div> : null}
    </div>
  );
}
