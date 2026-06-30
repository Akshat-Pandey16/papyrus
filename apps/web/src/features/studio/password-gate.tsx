import { KeyRound, Lock } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  getFilePassword,
  PARSE_MAX_BYTES,
  probePdfNeedsPassword,
  setFilePassword,
  verifyPdfPassword,
} from "@/features/studio/page-canvas";

type GateState = "checking" | "locked" | "open";

export function PasswordGate({ file, children }: { file: File; children: ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputId = useId();

  useEffect(() => {
    let alive = true;
    setPassword("");
    setError(null);
    if (getFilePassword(file)) {
      setState("open");
      return;
    }
    if (file.size > PARSE_MAX_BYTES) {
      setState("open");
      return;
    }
    setState("checking");
    probePdfNeedsPassword(file)
      .then((needs) => {
        if (alive) setState(needs ? "locked" : "open");
      })
      .catch(() => {
        if (alive) setState("open");
      });
    return () => {
      alive = false;
    };
  }, [file]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    const ok = await verifyPdfPassword(file, password);
    setBusy(false);
    if (ok) {
      setFilePassword(file, password);
      setState("open");
    } else {
      setError("That password didn't unlock the file. Try again.");
    }
  };

  if (state === "open") return <>{children}</>;

  if (state === "checking") {
    return (
      <div className="grid min-h-[40vh] place-items-center text-muted-foreground">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-5 rounded-3xl border border-border/70 bg-card p-8 text-center shadow-clay-sm">
      <span className="grid size-14 place-items-center rounded-2xl bg-molten text-primary-foreground shadow-ember">
        <Lock className="size-6" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h3 className="font-display text-xl font-semibold">This PDF is password-protected</h3>
        <p className="text-sm text-muted-foreground">
          Enter the password to unlock it. It's used only to process your file and is never stored.
        </p>
      </div>
      <form onSubmit={submit} className="flex w-full flex-col gap-3">
        <Input
          id={inputId}
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Document password"
          aria-label="Document password"
          aria-invalid={error != null}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" variant="molten" size="lg" disabled={!password || busy}>
          {busy ? <Spinner /> : <KeyRound />}
          {busy ? "Unlocking…" : "Unlock"}
        </Button>
      </form>
    </div>
  );
}
