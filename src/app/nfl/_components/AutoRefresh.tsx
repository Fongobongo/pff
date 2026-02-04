"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Props = {
  enabled?: boolean;
  intervalMs?: number;
};

export default function AutoRefresh({ enabled = true, intervalMs = 10000 }: Props) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, router]);

  return null;
}
