import { createFileRoute } from "@tanstack/react-router";
import { Sparkles, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ToolOptionsHeader, ToolPageShell } from "@/components/layout/tool-page-shell";
import { Button } from "@/components/ui/button";
import { ensureAnonymousSession } from "@/features/auth/ensure-session";
import {
  type CreateCompressionJobInput,
  useCreateCompressionJobMutation,
  useEstimateCompressionMutation,
} from "@/features/pdf-compress/api";
import { CompressionCard } from "@/features/pdf-compress/components/compression-card";
import { CompressionLevelSelector } from "@/features/pdf-compress/components/compression-level-selector";
import { CompressionOptionsPanel } from "@/features/pdf-compress/components/compression-options-panel";
import { EstimateResult } from "@/features/pdf-compress/components/estimate-result";
import { FileDropzone } from "@/features/pdf-compress/components/file-dropzone";
import { usePdfUpload } from "@/features/pdf-compress/hooks/use-pdf-upload";
import { useRecoverUploads } from "@/features/pdf-compress/hooks/use-recover-uploads";
import { DEFAULT_LEVEL, detectLevel, optionsForLevel } from "@/features/pdf-compress/presets";
import { useUploadStore } from "@/features/pdf-compress/store";
import type {
  CompressEstimate,
  CompressionLevel,
  CompressionOptions,
} from "@/features/pdf-compress/types";
import { PageThumbnails } from "@/features/pdf-tools/page-thumbnails";
import { ApiError } from "@/lib/api/client";
import { randomUUID } from "@/lib/uuid";

const PRESET_LEVELS: CompressionLevel[] = ["low", "medium", "high", "extreme"];

type CompressSearch = { level?: CompressionLevel };

export const Route = createFileRoute("/tools/compress")({
  validateSearch: (search: Record<string, unknown>): CompressSearch => {
    const raw = typeof search.level === "string" ? search.level : undefined;
    return raw && (PRESET_LEVELS as string[]).includes(raw)
      ? { level: raw as CompressionLevel }
      : {};
  },
  beforeLoad: async () => {
    await ensureAnonymousSession();
  },
  component: CompressPage,
});

function newClientUploadId(): string {
  return randomUUID();
}

function CompressPage() {
  useRecoverUploads();

  const initialLevel = Route.useSearch().level ?? DEFAULT_LEVEL;
  const [level, setLevel] = useState<CompressionLevel>(initialLevel);
  const [options, setOptions] = useState<CompressionOptions>(() => optionsForLevel(initialLevel));
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadedDoc, setUploadedDoc] = useState<{
    documentId: string;
    clientUploadId: string;
  } | null>(null);
  const [estimate, setEstimate] = useState<CompressEstimate | null>(null);

  const startUpload = useUploadStore((s) => s.start);
  const updateUpload = useUploadStore((s) => s.update);
  const removeUpload = useUploadStore((s) => s.remove);
  const uploadsMap = useUploadStore((s) => s.uploads);
  const { start, cancel } = usePdfUpload();
  const createJob = useCreateCompressionJobMutation();
  const estimateMutation = useEstimateCompressionMutation();

  useEffect(() => {
    setUploadedDoc(null);
    setEstimate(null);
  }, []);

  const onFile = useCallback((file: File) => {
    setPendingFile(file);
    setUploadedDoc(null);
    setEstimate(null);
  }, []);

  const onClearFile = useCallback(() => {
    setPendingFile(null);
    setUploadedDoc(null);
    setEstimate(null);
  }, []);

  const onLevelChange = useCallback((next: CompressionLevel) => {
    setLevel(next);
    setEstimate(null);
    if (next !== "custom") {
      setOptions(optionsForLevel(next));
    }
  }, []);

  const onOptionsChange = useCallback((next: CompressionOptions) => {
    setOptions(next);
    setLevel(detectLevel(next));
    setEstimate(null);
  }, []);

  const ensureUploaded = useCallback(
    async (file: File): Promise<{ documentId: string; clientUploadId: string } | null> => {
      if (uploadedDoc) {
        return uploadedDoc;
      }
      const clientUploadId = newClientUploadId();
      startUpload({
        clientUploadId,
        kind: "compress",
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        level,
        idempotencyKey: randomUUID(),
        phase: "preparing",
        bytesUploaded: 0,
        bytesTotal: file.size,
        createdAt: Date.now(),
      });
      try {
        const result = await start({ clientUploadId, file });
        updateUpload(clientUploadId, { documentId: result.documentId });
        const next = { documentId: result.documentId, clientUploadId };
        setUploadedDoc(next);
        return next;
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Upload failed.";
        const code =
          err instanceof ApiError
            ? err.code
            : err instanceof Error && err.message.includes("cancel")
              ? "cancelled"
              : "upload_failed";
        cancel(clientUploadId);
        updateUpload(clientUploadId, {
          phase: code === "cancelled" ? "cancelled" : "failed",
          errorCode: code,
          errorMessage: message,
        });
        if (code !== "cancelled") {
          toast.error(message);
        }
        return null;
      }
    },
    [uploadedDoc, startUpload, level, start, updateUpload, cancel],
  );

  const onEstimate = useCallback(async () => {
    if (!pendingFile || submitting || estimateMutation.isPending) return;
    const uploaded = await ensureUploaded(pendingFile);
    if (!uploaded) return;
    try {
      const next = await estimateMutation.mutateAsync({
        documentId: uploaded.documentId,
        compressionLevel: level,
        ...(level === "custom" ? { options } : {}),
      });
      setEstimate(next);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not estimate savings.";
      toast.error(message);
    }
  }, [pendingFile, submitting, estimateMutation, ensureUploaded, level, options]);

  const onSubmit = useCallback(async () => {
    if (!pendingFile || submitting) return;
    setSubmitting(true);
    try {
      const uploaded = await ensureUploaded(pendingFile);
      if (!uploaded) return;
      const idempotencyKey = randomUUID();
      updateUpload(uploaded.clientUploadId, { phase: "queued", idempotencyKey, level });

      const input: CreateCompressionJobInput = {
        documentId: uploaded.documentId,
        compressionLevel: level,
        idempotencyKey,
        ...(level === "custom" ? { options } : {}),
      };
      const job = await createJob.mutateAsync(input);
      updateUpload(uploaded.clientUploadId, { jobId: job.id, phase: "queued" });
      setPendingFile(null);
      setUploadedDoc(null);
      setEstimate(null);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Something went wrong.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [pendingFile, submitting, ensureUploaded, updateUpload, level, options, createJob]);

  const onRetry = useCallback(
    (id: string) => {
      removeUpload(id);
    },
    [removeUpload],
  );

  const sortedIds = useMemo(() => {
    return Object.values(uploadsMap)
      .filter((entry) => entry.kind === "compress" && entry.jobId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((entry) => entry.clientUploadId);
  }, [uploadsMap]);

  return (
    <ToolPageShell
      tag="Compress"
      title="Compress PDF"
      description="Drop a PDF, pick how hard to squeeze, save 20–80% on size. Files auto-delete in 24h."
      icon={Wand2}
      workspace={
        <>
          <FileDropzone
            onFile={onFile}
            selectedFile={pendingFile}
            onClear={onClearFile}
            disabled={submitting}
          />
          {pendingFile ? <PageThumbnails file={pendingFile} /> : null}
        </>
      }
      options={
        <>
          <ToolOptionsHeader title="Options" hint="Start with a preset, tune below." />
          <CompressionLevelSelector value={level} onChange={onLevelChange} disabled={submitting} />
          <CompressionOptionsPanel
            value={options}
            onChange={onOptionsChange}
            disabled={submitting}
          />
          {estimate ? <EstimateResult estimate={estimate} /> : null}
          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              onClick={onSubmit}
              disabled={!pendingFile || submitting}
              className="h-11"
            >
              <Sparkles className="mr-2 h-4 w-4" aria-hidden />
              {submitting ? "Starting…" : "Compress PDF"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onEstimate}
              disabled={!pendingFile || submitting || estimateMutation.isPending}
              className="h-9"
            >
              <Wand2 className="mr-2 h-3.5 w-3.5" aria-hidden />
              {estimateMutation.isPending ? "Estimating…" : "Preview savings"}
            </Button>
          </div>
        </>
      }
      active={
        sortedIds.length > 0 ? (
          <div className="flex flex-col gap-3">
            {sortedIds.map((id) => (
              <CompressionCard key={id} clientUploadId={id} onRetry={onRetry} />
            ))}
          </div>
        ) : null
      }
    />
  );
}
