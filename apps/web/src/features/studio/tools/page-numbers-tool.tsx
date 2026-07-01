import { Hash } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useCreatePageNumbersJobMutation } from "@/features/pdf-tools/api";
import { useFilePageCount } from "@/features/pdf-tools/use-file-page-count";
import { useSingleFileJobRunner } from "@/features/pdf-tools/use-single-file-job";
import { InspectorFrame, InspectorSection } from "@/features/studio/inspector-frame";
import { StageCanvas } from "@/features/studio/stage-canvas";
import { StudioLayout } from "@/features/studio/studio-layout";
import {
  ColorPicker,
  FONT_OPTIONS,
  LabeledSlider,
  type Rgb,
} from "@/features/studio/tools/overlay-shared";
import type { SingleToolProps } from "@/features/studio/types";

const FORMATS = [
  { value: "{n}", label: "1, 2, 3" },
  { value: "{n} / {total}", label: "1 / 10" },
  { value: "Page {n}", label: "Page 1" },
  { value: "Page {n} of {total}", label: "Page 1 of 10" },
];

const POSITIONS = [
  { value: "bottom-center", label: "Bottom center" },
  { value: "bottom-right", label: "Bottom right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "top-center", label: "Top center" },
  { value: "top-right", label: "Top right" },
  { value: "top-left", label: "Top left" },
];

export function PageNumbersTool({ file, onReplaceFile, onRemove, onLaunched }: SingleToolProps) {
  const { pageCount } = useFilePageCount(file);
  const [format, setFormat] = useState("{n}");
  const [position, setPosition] = useState("bottom-center");
  const [startAt, setStartAt] = useState(1);
  const [size, setSize] = useState(11);
  const [font, setFont] = useState<string>("Helvetica");
  const [color, setColor] = useState<Rgb>([0.1, 0.1, 0.1]);
  const create = useCreatePageNumbersJobMutation();
  const { run, submitting } = useSingleFileJobRunner();

  const onRun = async () => {
    const result = await run({
      file,
      kind: "page_numbers",
      createJob: async (documentId, idempotencyKey) => {
        const job = await create.mutateAsync({
          documentId,
          format,
          position,
          startAt,
          size,
          color,
          font,
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
          instruction="Page numbers are drawn onto every page in the position you choose."
        />
      }
      inspector={
        <InspectorFrame
          toolId="page_numbers"
          footer={
            <Button
              variant="molten"
              size="lg"
              onClick={onRun}
              disabled={submitting}
              className="w-full"
            >
              {submitting ? <Spinner /> : <Hash />}
              {submitting ? "Starting…" : "Add page numbers"}
            </Button>
          }
        >
          <InspectorSection label="Format">
            <FormField id="pn-format" label="Style">
              <Select id="pn-format" value={format} onChange={(e) => setFormat(e.target.value)}>
                {FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="pn-position" label="Position">
              <Select
                id="pn-position"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              >
                {POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium">Start at</span>
              <NumberInput
                value={startAt}
                onChange={setStartAt}
                min={0}
                max={100000}
                ariaLabel="Start numbering at"
              />
            </div>
          </InspectorSection>

          <InspectorSection label="Style">
            <LabeledSlider
              label="Size"
              value={size}
              onChange={setSize}
              min={7}
              max={36}
              step={1}
              display={`${size}pt`}
            />
            <FormField id="pn-font" label="Font">
              <Select id="pn-font" value={font} onChange={(e) => setFont(e.target.value)}>
                {FONT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium">Colour</span>
              <ColorPicker value={color} onChange={setColor} />
            </div>
          </InspectorSection>
        </InspectorFrame>
      }
    />
  );
}
