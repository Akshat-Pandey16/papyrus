import { Stamp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useCreateWatermarkJobMutation } from "@/features/pdf-tools/api";
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

export function WatermarkTool({ file, onReplaceFile, onRemove, onLaunched }: SingleToolProps) {
  const { pageCount } = useFilePageCount(file);
  const [text, setText] = useState("CONFIDENTIAL");
  const [opacity, setOpacity] = useState(25);
  const [size, setSize] = useState(48);
  const [rotation, setRotation] = useState(45);
  const [tile, setTile] = useState(true);
  const [font, setFont] = useState<string>("Helvetica-Bold");
  const [color, setColor] = useState<Rgb>([0.6, 0.6, 0.6]);
  const create = useCreateWatermarkJobMutation();
  const { run, submitting } = useSingleFileJobRunner();

  const canRun = text.trim().length > 0 && !submitting;

  const onRun = async () => {
    if (!canRun) return;
    const result = await run({
      file,
      kind: "watermark",
      createJob: async (documentId, idempotencyKey) => {
        const job = await create.mutateAsync({
          documentId,
          text: text.trim(),
          color,
          opacity: opacity / 100,
          size,
          rotation,
          tile,
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
          instruction="Your watermark is stamped onto every page. Tiling repeats it diagonally for tamper resistance."
        />
      }
      inspector={
        <InspectorFrame
          toolId="watermark"
          footer={
            <Button
              variant="molten"
              size="lg"
              onClick={onRun}
              disabled={!canRun}
              className="w-full"
            >
              {submitting ? <Spinner /> : <Stamp />}
              {submitting ? "Starting…" : "Apply watermark"}
            </Button>
          }
        >
          <InspectorSection label="Text">
            <FormField id="wm-text" label="Watermark text">
              <Input
                id="wm-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={120}
                placeholder="e.g. DRAFT"
              />
            </FormField>
          </InspectorSection>

          <InspectorSection label="Style">
            <LabeledSlider
              label="Opacity"
              value={opacity}
              onChange={setOpacity}
              min={5}
              max={100}
              step={5}
              display={`${opacity}%`}
            />
            <LabeledSlider
              label="Size"
              value={size}
              onChange={setSize}
              min={12}
              max={120}
              step={2}
              display={`${size}pt`}
            />
            <LabeledSlider
              label="Angle"
              value={rotation}
              onChange={setRotation}
              min={-90}
              max={90}
              step={5}
              display={`${rotation}°`}
            />
            <FormField id="wm-font" label="Font">
              <Select id="wm-font" value={font} onChange={(e) => setFont(e.target.value)}>
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
            <label htmlFor="wm-tile" className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium">Tile across the page</span>
              <Switch id="wm-tile" checked={tile} onCheckedChange={setTile} />
            </label>
          </InspectorSection>
        </InspectorFrame>
      }
    />
  );
}
