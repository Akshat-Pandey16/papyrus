import { LockOpen } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useCreateUnlockJobMutation } from "@/features/pdf-tools/api";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";
import { InspectorFrame, InspectorSection } from "@/features/studio/inspector-frame";
import { StageCanvas } from "@/features/studio/stage-canvas";
import { StudioLayout } from "@/features/studio/studio-layout";
import type { SingleToolProps } from "@/features/studio/types";

export function UnlockTool({ file, onReplaceFile, onRemove, onLaunched }: SingleToolProps) {
  const [password, setPassword] = useState("");
  const create = useCreateUnlockJobMutation();
  const { run, submitting } = useSingleFileJobRunner();

  const canRun = password.length > 0 && !submitting;

  const onRun = async () => {
    if (!canRun) return;
    const result = await run({
      file,
      kind: "unlock",
      createJob: async (documentId, idempotencyKey) => {
        const job = await create.mutateAsync({ documentId, password, idempotencyKey });
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
          pageCount={null}
          onReplaceFile={onReplaceFile}
          onRemove={onRemove}
          instruction="Enter the password you already know. We use it to decrypt the file, then write a copy with no password."
        />
      }
      inspector={
        <InspectorFrame
          toolId="unlock"
          footer={
            <Button
              variant="molten"
              size="lg"
              onClick={onRun}
              disabled={!canRun}
              className="w-full"
            >
              {submitting ? <Spinner /> : <LockOpen />}
              {submitting ? "Starting…" : "Unlock PDF"}
            </Button>
          }
        >
          <InspectorSection label="Current password" hint="The password this PDF is locked with.">
            <FormField id="unlock-pw" label="Password">
              <Input
                id="unlock-pw"
                type="password"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter the document password"
              />
            </FormField>
          </InspectorSection>
          <p className="rounded-xl border border-border/60 bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
            We can only remove a password you already have. This does not break encryption on files
            you don't own the password to.
          </p>
        </InspectorFrame>
      }
    />
  );
}
