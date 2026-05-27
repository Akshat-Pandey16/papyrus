import { Gauge, SlidersHorizontal, Sparkles, TrendingDown } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  useCreateCompressionJobMutation,
  useEstimateCompressionMutation,
} from "@/features/pdf-compress/api";
import { formatBytes, formatPercent } from "@/features/pdf-compress/format";
import { usePdfUpload } from "@/features/pdf-compress/hooks/use-pdf-upload";
import { DEFAULT_LEVEL, detectLevel, optionsForLevel } from "@/features/pdf-compress/presets";
import { useUploadStore } from "@/features/pdf-compress/store";
import type {
  CompressEstimate,
  CompressionLevel,
  CompressionOptions,
} from "@/features/pdf-compress/types";
import { useFilePageCount } from "@/features/pdf-tools/use-file-page-count";
import { InspectorFrame, InspectorSection } from "@/features/studio/inspector-frame";
import { StageCanvas } from "@/features/studio/stage-canvas";
import { StudioLayout } from "@/features/studio/studio-layout";
import type { SingleToolProps } from "@/features/studio/types";
import { ApiError } from "@/lib/api/client";
import { randomUUID } from "@/lib/uuid";

const PRESETS: { value: Exclude<CompressionLevel, "custom">; label: string }[] = [
  { value: "low", label: "Light" },
  { value: "medium", label: "Balanced" },
  { value: "high", label: "Strong" },
  { value: "extreme", label: "Max" },
];

export function CompressTool({ file, onReplaceFile, onRemove, onLaunched }: SingleToolProps) {
  const { pageCount } = useFilePageCount(file);
  const [level, setLevel] = useState<CompressionLevel>(DEFAULT_LEVEL);
  const [options, setOptions] = useState<CompressionOptions>(() => optionsForLevel(DEFAULT_LEVEL));
  const [estimate, setEstimate] = useState<CompressEstimate | null>(null);
  const [uploadedDocId, setUploadedDocId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { start } = usePdfUpload();
  const startUpload = useUploadStore((s) => s.start);
  const updateUpload = useUploadStore((s) => s.update);
  const createJob = useCreateCompressionJobMutation();
  const estimateMutation = useEstimateCompressionMutation();

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset upload/estimate cache on new file
  useEffect(() => {
    setEstimate(null);
    setUploadedDocId(null);
  }, [file]);

  const onLevelChange = (next: Exclude<CompressionLevel, "custom">) => {
    setLevel(next);
    setOptions(optionsForLevel(next));
    setEstimate(null);
  };

  const patchOptions = (patch: Partial<CompressionOptions>) => {
    const next = { ...options, ...patch };
    setOptions(next);
    setLevel(detectLevel(next));
    setEstimate(null);
  };

  const ensureUploaded = async (): Promise<string | null> => {
    if (uploadedDocId) return uploadedDocId;
    try {
      const result = await start({ clientUploadId: randomUUID(), file });
      setUploadedDocId(result.documentId);
      return result.documentId;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Upload failed.");
      return null;
    }
  };

  const onEstimate = async () => {
    if (submitting || estimateMutation.isPending) return;
    const documentId = await ensureUploaded();
    if (!documentId) return;
    try {
      const next = await estimateMutation.mutateAsync({
        documentId,
        compressionLevel: level,
        ...(level === "custom" ? { options } : {}),
      });
      setEstimate(next);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not estimate savings.");
    }
  };

  const onRun = async () => {
    if (submitting) return;
    setSubmitting(true);
    const clientUploadId = randomUUID();
    const idempotencyKey = randomUUID();
    startUpload({
      clientUploadId,
      kind: "compress",
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      level,
      idempotencyKey,
      phase: uploadedDocId ? "queued" : "preparing",
      bytesUploaded: 0,
      bytesTotal: file.size,
      createdAt: Date.now(),
    });
    try {
      let documentId = uploadedDocId;
      if (!documentId) {
        const result = await start({ clientUploadId, file });
        documentId = result.documentId;
        setUploadedDocId(documentId);
      } else {
        updateUpload(clientUploadId, { documentId, phase: "queued" });
      }
      const job = await createJob.mutateAsync({
        documentId,
        compressionLevel: level,
        idempotencyKey,
        ...(level === "custom" ? { options } : {}),
      });
      updateUpload(clientUploadId, { jobId: job.id, phase: "queued" });
      onLaunched();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Something went wrong.";
      updateUpload(clientUploadId, {
        phase: "failed",
        errorCode: err instanceof ApiError ? err.code : "upload_failed",
        errorMessage: message,
      });
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StudioLayout
      canvas={
        <StageCanvas
          file={file}
          pageCount={pageCount}
          onReplaceFile={onReplaceFile}
          onRemove={onRemove}
          instruction="Pick how hard to squeeze. Preview the savings before you commit — no surprises."
        />
      }
      inspector={
        <InspectorFrame
          toolId="compress"
          footer={
            <div className="flex flex-col gap-2">
              <Button
                variant="molten"
                size="lg"
                onClick={onRun}
                disabled={submitting}
                className="w-full"
              >
                {submitting ? <Spinner /> : <Sparkles />}
                {submitting ? "Starting…" : "Compress PDF"}
              </Button>
              <Button
                variant="outline"
                onClick={onEstimate}
                disabled={submitting || estimateMutation.isPending}
                className="w-full"
              >
                {estimateMutation.isPending ? <Spinner /> : <Gauge />}
                {estimateMutation.isPending ? "Estimating…" : "Preview savings"}
              </Button>
            </div>
          }
        >
          <InspectorSection
            label="Strength"
            hint="Light keeps quality; Max squeezes hardest (may grayscale)."
          >
            <Segmented<Exclude<CompressionLevel, "custom">>
              value={level === "custom" ? "medium" : level}
              onChange={onLevelChange}
              ariaLabel="Compression strength"
              options={PRESETS}
            />
            {level === "custom" ? (
              <Badge tone="primary" className="self-start">
                <SlidersHorizontal />
                Custom settings
              </Badge>
            ) : null}
          </InspectorSection>

          {estimate ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-success/30 bg-success/8 p-4">
              <div className="flex items-center gap-2">
                <TrendingDown className="size-4 text-success" />
                <span className="font-display text-2xl font-semibold text-success">
                  {formatPercent(estimate.projectedRatio)}
                </span>
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                {formatBytes(estimate.inputSizeBytes)} →{" "}
                {formatBytes(estimate.projectedOutputSizeBytes)} · projected from{" "}
                {estimate.samplePageCount} sample page{estimate.samplePageCount === 1 ? "" : "s"}
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAdvanced((v) => !v)}
              className="self-start text-muted-foreground"
            >
              <SlidersHorizontal />
              {showAdvanced ? "Hide advanced" : "Advanced options"}
            </Button>
            {showAdvanced ? (
              <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-muted/30 p-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">Image quality</span>
                    <span className="font-mono text-muted-foreground">{options.imageQuality}</span>
                  </div>
                  <Slider
                    value={[options.imageQuality]}
                    onValueChange={([v]) =>
                      patchOptions({ imageQuality: v ?? options.imageQuality })
                    }
                    min={20}
                    max={100}
                    step={1}
                  />
                </div>
                <AdvancedToggle
                  label="Recompress images"
                  checked={options.recompressImages}
                  onChange={(v) => patchOptions({ recompressImages: v })}
                />
                <AdvancedToggle
                  label="Convert to grayscale"
                  checked={options.colorMode === "grayscale"}
                  onChange={(v) => patchOptions({ colorMode: v ? "grayscale" : "preserve" })}
                />
                <AdvancedToggle
                  label="Strip metadata"
                  checked={options.stripMetadata}
                  onChange={(v) => patchOptions({ stripMetadata: v })}
                />
              </div>
            ) : null}
          </div>
        </InspectorFrame>
      }
    />
  );
}

function AdvancedToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = `adv-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-3">
      <span className="text-xs font-medium">{label}</span>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
