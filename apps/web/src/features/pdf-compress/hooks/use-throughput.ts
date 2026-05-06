import { useEffect, useRef, useState } from "react";

export function useThroughput(bytesUploaded: number, active: boolean): number | null {
  const samplesRef = useRef<Array<{ ts: number; bytes: number }>>([]);
  const [bps, setBps] = useState<number | null>(null);

  useEffect(() => {
    if (!active) {
      samplesRef.current = [];
      setBps(null);
      return;
    }
    const now = performance.now();
    samplesRef.current.push({ ts: now, bytes: bytesUploaded });
    const cutoff = now - 3000;
    samplesRef.current = samplesRef.current.filter((s) => s.ts >= cutoff);
    if (samplesRef.current.length >= 2) {
      const first = samplesRef.current[0];
      const last = samplesRef.current[samplesRef.current.length - 1];
      if (first && last && last.ts > first.ts) {
        const dt = (last.ts - first.ts) / 1000;
        const db = last.bytes - first.bytes;
        if (dt > 0 && db > 0) {
          setBps(db / dt);
          return;
        }
      }
    }
  }, [bytesUploaded, active]);

  return bps;
}
