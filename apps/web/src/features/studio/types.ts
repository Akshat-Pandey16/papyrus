export type ToolId = "compress" | "merge" | "split" | "rotate" | "reorder" | "ocr";

export type StudioFile = {
  id: string;
  file: File;
};

export type SingleToolProps = {
  file: File;
  onReplaceFile: (file: File) => void;
  onRemove: () => void;
  onLaunched: () => void;
};
