import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { compressKeys, mapJob, requestSseTicket, useJobQuery } from "@/features/pdf-compress/api";
import type { Job } from "@/features/pdf-compress/types";
import { mergeKeys } from "@/features/pdf-merge/api";
import { env } from "@/lib/env";

const MAX_RETRIES = 3;
const STABLE_OPEN_MS = 4000;
const TICKET_MIN_INTERVAL_MS = 3000;
const TERMINAL: ReadonlySet<Job["status"]> = new Set(["succeeded", "failed", "cancelled"]);

type ApiJobPayload = Parameters<typeof mapJob>[0];

type IncomingEvent =
  | { status: Job["status"]; payload: { phase?: string; [k: string]: unknown }; job_id: string }
  | ApiJobPayload;

function looksLikeApiJob(value: unknown): value is ApiJobPayload {
  if (!value || typeof value !== "object") return false;
  return "id" in value && "kind" in value && "status" in value;
}

export function useJobStream(jobId: string | null) {
  const qc = useQueryClient();
  const [pollFallback, setPollFallback] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    if (!jobId || pollFallback) return;

    let attempts = 0;
    let es: EventSource | null = null;
    let closed = false;
    let retryTimer: number | null = null;
    let stableTimer: number | null = null;
    let lastTicketAt = 0;

    const clearStableTimer = () => {
      if (stableTimer !== null) {
        window.clearTimeout(stableTimer);
        stableTimer = null;
      }
    };

    const close = () => {
      closed = true;
      if (es) {
        try {
          es.close();
        } catch {}
        es = null;
      }
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
      clearStableTimer();
    };

    const handleState = (data: string) => {
      try {
        const parsed = JSON.parse(data) as IncomingEvent | unknown;
        let updated: Job | null = null;
        if (looksLikeApiJob(parsed)) {
          updated = mapJob(parsed);
        } else if (parsed && typeof parsed === "object" && "status" in parsed) {
          const prev = qc.getQueryData<Job>(compressKeys.job(jobId));
          if (prev) {
            const status = (parsed as { status: Job["status"] }).status;
            const payload = (parsed as { payload?: Record<string, unknown> }).payload ?? {};
            const phase = typeof payload.phase === "string" ? payload.phase : prev.phase;
            updated = { ...prev, status, phase };
            const out = payload.output_size_bytes;
            const ratio = payload.compression_ratio;
            const oid = payload.output_object_id;
            const ec = payload.error_code;
            const em = payload.error_message;
            if (typeof out === "number") updated.outputSizeBytes = out;
            if (typeof ratio === "number") updated.compressionRatio = ratio;
            if (typeof oid === "string") updated.outputObjectId = oid;
            if (typeof ec === "string") updated.errorCode = ec;
            if (typeof em === "string") updated.errorMessage = em;
            if (TERMINAL.has(status) && !updated.finishedAt) {
              updated.finishedAt = new Date().toISOString();
            }
          }
        }
        if (updated) {
          qc.setQueryData(compressKeys.job(jobId), updated);
          if (TERMINAL.has(updated.status)) {
            qc.invalidateQueries({ queryKey: compressKeys.all });
            qc.invalidateQueries({ queryKey: mergeKeys.all });
            qc.invalidateQueries({ queryKey: ["jobs-feed"] });
          }
        }
      } catch {}
    };

    const open = async () => {
      const now = Date.now();
      if (now - lastTicketAt >= TICKET_MIN_INTERVAL_MS) {
        lastTicketAt = now;
        try {
          await requestSseTicket(jobId);
        } catch {}
      }
      if (closed) return;

      const url = `${env.VITE_API_BASE_URL}/api/v1/jobs/${jobId}/events`;
      es = new EventSource(url, { withCredentials: true });

      clearStableTimer();
      stableTimer = window.setTimeout(() => {
        stableTimer = null;
        if (!closed) attempts = 0;
      }, STABLE_OPEN_MS);

      es.addEventListener("state", (e) => {
        handleState((e as MessageEvent).data);
      });
      es.addEventListener("terminal", (e) => {
        handleState((e as MessageEvent).data);
        close();
      });
      es.onerror = () => {
        if (closed) return;
        clearStableTimer();
        if (es) {
          try {
            es.close();
          } catch {}
          es = null;
        }
        attempts += 1;
        if (attempts >= MAX_RETRIES) {
          setPollFallback(true);
          return;
        }
        const delay = Math.min(1000 * 2 ** attempts, 8000);
        retryTimer = window.setTimeout(() => {
          if (!closed) void open();
        }, delay);
      };
    };

    void open();
    return () => {
      close();
    };
  }, [jobId, pollFallback, qc]);

  return useJobQuery(jobId, {
    refetchInterval: pollFallback && jobId ? 2000 : false,
  });
}
