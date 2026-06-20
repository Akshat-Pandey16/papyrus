import { Lock } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useCreateProtectJobMutation } from "@/features/pdf-tools/api";
import { useFilePageCount } from "@/features/pdf-tools/use-file-page-count";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";
import { InspectorFrame, InspectorSection } from "@/features/studio/inspector-frame";
import { StageCanvas } from "@/features/studio/stage-canvas";
import { StudioLayout } from "@/features/studio/studio-layout";
import type { SingleToolProps } from "@/features/studio/types";

export function ProtectTool({ file, onReplaceFile, onRemove, onLaunched }: SingleToolProps) {
  const { pageCount } = useFilePageCount(file);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [allowPrinting, setAllowPrinting] = useState(true);
  const [allowCopying, setAllowCopying] = useState(false);
  const create = useCreateProtectJobMutation();
  const { run, submitting } = useSingleFileJobRunner();

  const mismatch = confirm.length > 0 && password !== confirm;
  const canRun = password.length > 0 && password === confirm && !submitting;

  const onRun = async () => {
    if (!canRun) return;
    const result = await run({
      file,
      kind: "protect",
      createJob: async (documentId, idempotencyKey) => {
        const job = await create.mutateAsync({
          documentId,
          password,
          ownerPassword: null,
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
            <FormField id="protect-pw" label="New password">
              <Input
                id="protect-pw"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 1 character"
              />
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

          <InspectorSection label="Permissions">
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
          </InspectorSection>
        </InspectorFrame>
      }
    />
  );
}
