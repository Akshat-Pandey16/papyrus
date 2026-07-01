export type ToolId =
  | "compress"
  | "merge"
  | "split"
  | "rotate"
  | "reorder"
  | "ocr"
  | "protect"
  | "unlock"
  | "watermark"
  | "page_numbers"
  | "crop"
  | "pdf_to_images"
  | "images_to_pdf"
  | "sign"
  | "redact"
  | "edit"
  | "convert"
  | "pdf_to_word";

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
