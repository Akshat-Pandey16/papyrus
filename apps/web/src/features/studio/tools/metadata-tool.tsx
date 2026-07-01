import { FileCog } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useCreateMetadataJobMutation } from "@/features/pdf-tools/api";
import { type PdfMetadata, useFileMetadata } from "@/features/pdf-tools/use-file-metadata";
import { useFilePageCount } from "@/features/pdf-tools/use-file-page-count";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";
import { InspectorFrame, InspectorSection } from "@/features/studio/inspector-frame";
import { StageCanvas } from "@/features/studio/stage-canvas";
import { StudioLayout } from "@/features/studio/studio-layout";
import type { SingleToolProps } from "@/features/studio/types";

export function MetadataTool({ file, onReplaceFile, onRemove, onLaunched }: SingleToolProps) {
  const { pageCount } = useFilePageCount(file);
  const { metadata: loaded } = useFileMetadata(file);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [subject, setSubject] = useState("");
  const [keywords, setKeywords] = useState("");
  const [stripAll, setStripAll] = useState(false);
  const applied = useRef<PdfMetadata | null>(null);
  const create = useCreateMetadataJobMutation();
  const { run, submitting } = useSingleFileJobRunner();

  useEffect(() => {
    if (applied.current === loaded) return;
    applied.current = loaded;
    setTitle(loaded.title);
    setAuthor(loaded.author);
    setSubject(loaded.subject);
    setKeywords(loaded.keywords);
  }, [loaded]);

  const onRun = async () => {
    const result = await run({
      file,
      kind: "metadata",
      createJob: async (documentId, idempotencyKey) => {
        const job = await create.mutateAsync({
          documentId,
          title: stripAll ? null : title,
          author: stripAll ? null : author,
          subject: stripAll ? null : subject,
          keywords: stripAll ? null : keywords,
          stripAll,
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
          instruction="Edit the document properties, or wipe every trace of metadata before you share."
        />
      }
      inspector={
        <InspectorFrame
          toolId="metadata"
          footer={
            <Button
              variant="molten"
              size="lg"
              onClick={onRun}
              disabled={submitting}
              className="w-full"
            >
              {submitting ? <Spinner /> : <FileCog />}
              {submitting ? "Starting…" : stripAll ? "Remove all metadata" : "Save metadata"}
            </Button>
          }
        >
          <InspectorSection label="Privacy" hint="Strip hidden author, software and timestamps.">
            <label htmlFor="md-strip" className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium">Remove all metadata</span>
              <Switch id="md-strip" checked={stripAll} onCheckedChange={setStripAll} />
            </label>
          </InspectorSection>

          <InspectorSection label="Document properties" hint="Prefilled from the current file.">
            <FormField id="md-title" label="Title">
              <Input
                id="md-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={500}
                disabled={stripAll}
                placeholder="Untitled"
              />
            </FormField>
            <FormField id="md-author" label="Author">
              <Input
                id="md-author"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                maxLength={500}
                disabled={stripAll}
                placeholder="Unknown"
              />
            </FormField>
            <FormField id="md-subject" label="Subject">
              <Input
                id="md-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={1000}
                disabled={stripAll}
                placeholder="—"
              />
            </FormField>
            <FormField id="md-keywords" label="Keywords">
              <Input
                id="md-keywords"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                maxLength={2000}
                disabled={stripAll}
                placeholder="comma, separated"
              />
            </FormField>
          </InspectorSection>
        </InspectorFrame>
      }
    />
  );
}
