import { useEffect, useRef, useState } from "react";

export function useThroughput(bytesUploaded: number, active: boolean): number | null {
  const samplesRef = useRef<Array<{ ts: number; bytes: number }>>([]);
  const lastBytesRef = useRef(0);
  const [bps, setBps] = useState<number | null>(null);

  useEffect(() => {
    if (!active) {
      samplesRef.current = [];
      lastBytesRef.current = 0;
      setBps(null);
      return;
    }

    if (bytesUploaded < lastBytesRef.current) {
      samplesRef.current = [];
    }
    lastBytesRef.current = bytesUploaded;

    const now = performance.now();
    samplesRef.current.push({ ts: now, bytes: bytesUploaded });
    const cutoff = now - 3000;
    samplesRef.current = samplesRef.current.filter((s) => s.ts >= cutoff);
    if (samplesRef.current.length < 2) return;

    const first = samplesRef.current[0];
    const last = samplesRef.current[samplesRef.current.length - 1];
    if (!first || !last || last.ts <= first.ts) return;
    const dt = (last.ts - first.ts) / 1000;
    const db = last.bytes - first.bytes;
    if (dt > 0 && db > 0) {
      setBps(db / dt);
    }
  }, [bytesUploaded, active]);

  return bps;
}
