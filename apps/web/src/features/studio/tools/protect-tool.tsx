import { ChevronRight, Lock } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordStrengthMeter } from "@/components/ui/password-strength";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useCreateProtectJobMutation } from "@/features/pdf-tools/api";
import { useFilePageCount } from "@/features/pdf-tools/use-file-page-count";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";
import { InspectorFrame, InspectorSection } from "@/features/studio/inspector-frame";
import { StageCanvas } from "@/features/studio/stage-canvas";
import { StudioLayout } from "@/features/studio/studio-layout";
import type { SingleToolProps } from "@/features/studio/types";

const MIN_PASSWORD_LENGTH = 6;

export function ProtectTool({ file, onReplaceFile, onRemove, onLaunched }: SingleToolProps) {
  const { pageCount } = useFilePageCount(file);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [allowPrinting, setAllowPrinting] = useState(true);
  const [allowCopying, setAllowCopying] = useState(false);
  const create = useCreateProtectJobMutation();
  const { run, submitting } = useSingleFileJobRunner();

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canRun = password.length >= MIN_PASSWORD_LENGTH && password === confirm && !submitting;

  const onRun = async () => {
    if (!canRun) return;
    const result = await run({
      file,
      kind: "protect",
      createJob: async (documentId, idempotencyKey) => {
        const job = await create.mutateAsync({
          documentId,
          password,
          ownerPassword: ownerPassword.length > 0 ? ownerPassword : null,
          allowPrinting,
          allowCopying,
          idempotencyKey,
        });
        return { id: job.id };
      },
    });
    if (result) onLaunched();
  };

  return (
    <StudioLayout
      canvas={
        <StageCanvas
          file={file}
          pageCount={pageCount}
          onReplaceFile={onReplaceFile}
          onRemove={onRemove}
          instruction="We encrypt with AES-256. The password is sent once over TLS, used by the worker, and never stored."
        />
      }
      inspector={
        <InspectorFrame
          toolId="protect"
          footer={
            <Button
              variant="molten"
              size="lg"
              onClick={onRun}
              disabled={!canRun}
              className="w-full"
            >
              {submitting ? <Spinner /> : <Lock />}
              {submitting ? "Starting…" : "Protect PDF"}
            </Button>
          }
        >
          <InspectorSection label="Password" hint="You'll need this to open the PDF afterwards.">
            <FormField
              id="protect-pw"
              label="New password"
              {...(tooShort
                ? { hint: <span className="text-warning-foreground">Use 6+ characters</span> }
                : {})}
            >
              <Input
                id="protect-pw"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
              <PasswordStrengthMeter password={password} className="mt-2" />
            </FormField>
            <FormField
              id="protect-confirm"
              label="Confirm password"
              error={mismatch ? "Passwords don't match." : undefined}
            >
              <Input
                id="protect-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                aria-invalid={mismatch}
              />
            </FormField>
          </InspectorSection>

          <InspectorSection
            label="Permissions"
            {...(ownerPassword.length > 0
              ? {}
              : {
                  hint: "Set an owner password below to enforce these on compliant readers.",
                })}
          >
            <label htmlFor="protect-print" className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium">Allow printing</span>
              <Switch
                id="protect-print"
                checked={allowPrinting}
                onCheckedChange={setAllowPrinting}
              />
            </label>
            <label htmlFor="protect-copy" className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium">Allow copying text</span>
              <Switch id="protect-copy" checked={allowCopying} onCheckedChange={setAllowCopying} />
            </label>

            <details className="group mt-1 rounded-2xl border border-border/60 bg-card/40">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl p-3 text-xs font-semibold select-none hover:bg-muted/40">
                <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
                Advanced: owner password
              </summary>
              <div className="flex flex-col gap-2 border-t border-border/60 p-3">
                <FormField
                  id="protect-owner-pw"
                  label="Owner password"
                  hint={<span className="text-muted-foreground">Optional</span>}
                >
                  <Input
                    id="protect-owner-pw"
                    type="password"
                    autoComplete="new-password"
                    value={ownerPassword}
                    onChange={(e) => setOwnerPassword(e.target.value)}
                    placeholder="Controls permissions"
                  />
                </FormField>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  The owner password unlocks full editing and enforces the permission toggles above.
                  Leave it empty to just require the open password.
                </p>
              </div>
            </details>
          </InspectorSection>
        </InspectorFrame>
      }
    />
  );
}
