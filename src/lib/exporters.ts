import { desktop } from "./desktop";
import { safeFileName } from "./projectFile";
import type { ExportFormat } from "../../shared/desktop";

export type { ExportFormat };

const EXPORT_PADDING = 56;
const MIN_EXPORT_WIDTH = 900;
const MIN_EXPORT_HEIGHT = 640;
/** Preferred sharpness; reduced for trees too large to rasterise at that scale. */
const PREFERRED_PIXEL_RATIO = 2;
/** Chromium refuses to create canvases much beyond these, and fails silently with a blank image. */
const MAX_CANVAS_SIDE = 16_384;
const MAX_CANVAS_PIXELS = 100_000_000;
/** PDF viewers cap a page at 200 inches, which is 14,400 points. */
const MAX_PDF_SIDE_POINTS = 14_400;
const PX_TO_POINTS = 0.75;

interface PreparedExport {
  host: HTMLDivElement;
  surface: HTMLElement;
  width: number;
  height: number;
}

export async function exportTreeElement(element: HTMLElement, projectName: string, format: ExportFormat): Promise<string | null> {
  const prepared = prepareExportElement(element);
  document.body.appendChild(prepared.host);
  try {
    await document.fonts.ready;
    await nextFrame();
    await nextFrame();
    const data = await renderExport(prepared, format);
    return await desktop().exportFile({ data, format, suggestedName: safeFileName(projectName) });
  } finally {
    prepared.host.remove();
  }
}

/**
 * The rasteriser and the PDF writer together weigh more than the editor
 * itself, so they are pulled in only when an export actually runs.
 */
async function renderExport(prepared: PreparedExport, format: ExportFormat): Promise<string | Uint8Array> {
  const { toPng, toSvg } = await import("html-to-image");
  const options = exportOptions(prepared.width, prepared.height);
  if (format === "svg") return decodeSvgDataUrl(await toSvg(prepared.surface, options));

  const pngDataUrl = await toPng(prepared.surface, options);
  if (format === "png") return dataUrlToBytes(pngDataUrl);

  const { jsPDF } = await import("jspdf");
  const page = pdfPageSize(prepared.width, prepared.height);
  const pdf = new jsPDF({ orientation: page.width >= page.height ? "landscape" : "portrait", unit: "px", format: [page.width, page.height] });
  pdf.addImage(pngDataUrl, "PNG", 0, 0, page.width, page.height);
  return new Uint8Array(pdf.output("arraybuffer"));
}

/**
 * Clones the live canvas into an off-screen host sized to the tree's bounding
 * box, so exports capture the whole family rather than the current viewport.
 */
function prepareExportElement(element: HTMLElement): PreparedExport {
  const nodeBounds = flowNodeBounds(element);
  const width = Math.ceil(Math.max(MIN_EXPORT_WIDTH, (nodeBounds?.width ?? element.clientWidth) + EXPORT_PADDING * 2));
  const height = Math.ceil(Math.max(MIN_EXPORT_HEIGHT, (nodeBounds?.height ?? element.clientHeight) + EXPORT_PADDING * 2));

  const host = document.createElement("div");
  host.className = "export-host";
  Object.assign(host.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    width: `${width}px`,
    height: `${height}px`,
    overflow: "hidden",
    pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>);

  const surface = element.cloneNode(true) as HTMLElement;
  surface.classList.add("is-exporting");
  Object.assign(surface.style, {
    width: `${width}px`,
    height: `${height}px`,
    minHeight: `${height}px`,
    overflow: "hidden",
  } satisfies Partial<CSSStyleDeclaration>);

  for (const item of surface.querySelectorAll<HTMLElement>(".react-flow, .react-flow__renderer, .react-flow__pane, .react-flow__viewport, .react-flow__container")) {
    item.style.width = `${width}px`;
    item.style.height = `${height}px`;
  }

  if (nodeBounds) {
    const viewport = surface.querySelector<HTMLElement>(".react-flow__viewport");
    if (viewport) viewport.style.transform = `translate(${EXPORT_PADDING - nodeBounds.minX}px, ${EXPORT_PADDING - nodeBounds.minY}px) scale(1)`;
  }

  host.appendChild(surface);
  return { host, surface, width, height };
}

function flowNodeBounds(element: HTMLElement): { minX: number; minY: number; width: number; height: number } | undefined {
  const nodes = element.querySelectorAll<HTMLElement>(".react-flow__node");
  if (nodes.length === 0) return undefined;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    const { x, y } = parseTranslate(node.style.transform);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + node.offsetWidth);
    maxY = Math.max(maxY, y + node.offsetHeight);
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

export function parseTranslate(value: string): { x: number; y: number } {
  const match = value.match(/translate(?:3d)?\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : { x: 0, y: 0 };
}

/**
 * Sharpness for a canvas of this size. A large family tree at 2x would exceed
 * what the browser can allocate and come out blank, so the ratio drops just
 * enough to stay inside the limits.
 */
export function exportPixelRatio(width: number, height: number): number {
  const bySide = MAX_CANVAS_SIDE / Math.max(width, height);
  const byArea = Math.sqrt(MAX_CANVAS_PIXELS / (width * height));
  return Math.max(0.1, Math.min(PREFERRED_PIXEL_RATIO, bySide, byArea));
}

/** The PDF page in pixels, scaled down proportionally if it would exceed the viewer limit. */
export function pdfPageSize(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height) * PX_TO_POINTS;
  const scale = longest > MAX_PDF_SIDE_POINTS ? MAX_PDF_SIDE_POINTS / longest : 1;
  return { width: Math.floor(width * scale), height: Math.floor(height * scale) };
}

function exportOptions(width: number, height: number) {
  return {
    cacheBust: true,
    width,
    height,
    pixelRatio: exportPixelRatio(width, height),
    filter: (node: HTMLElement) => !node.classList?.contains("no-export"),
    backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#101214",
  };
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function decodeSvgDataUrl(dataUrl: string): string {
  return decodeURIComponent(dataUrl.slice(dataUrl.indexOf(",") + 1));
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
