import { save } from "@tauri-apps/plugin-dialog";
import { writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { toPng, toSvg } from "html-to-image";
import { jsPDF } from "jspdf";
import { safeFileName } from "./projectIO";

export type ExportFormat = "png" | "svg" | "pdf";

export async function exportTreeElement(element: HTMLElement, projectName: string, format: ExportFormat): Promise<string | null> {
  const selected = await save({ defaultPath: `${safeFileName(projectName)}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
  if (!selected) return null;
  const prepared = prepareExportElement(element);
  document.body.appendChild(prepared.host);
  try {
    await document.fonts.ready;
    await nextFrame();
    await nextFrame();
    if (format === "svg") {
      const svgDataUrl = await toSvg(prepared.surface, exportOptions(prepared.width, prepared.height));
      await writeTextFile(selected, decodeSvgDataUrl(svgDataUrl));
      return selected;
    }
    const pngDataUrl = await toPng(prepared.surface, exportOptions(prepared.width, prepared.height));
    if (format === "png") {
      await writeFile(selected, dataUrlToBytes(pngDataUrl));
      return selected;
    }
    const width = prepared.width;
    const height = prepared.height;
    const pdf = new jsPDF({ orientation: width >= height ? "landscape" : "portrait", unit: "px", format: [width, height] });
    pdf.addImage(pngDataUrl, "PNG", 0, 0, width, height);
    await writeFile(selected, new Uint8Array(pdf.output("arraybuffer")));
    return selected;
  } finally {
    prepared.host.remove();
  }
}

function prepareExportElement(element: HTMLElement): { host: HTMLDivElement; surface: HTMLElement; width: number; height: number } {
  const padding = 56;
  const nodeBounds = flowNodeBounds(element);
  const width = Math.ceil(Math.max(900, (nodeBounds?.width ?? element.clientWidth) + padding * 2));
  const height = Math.ceil(Math.max(640, (nodeBounds?.height ?? element.clientHeight) + padding * 2));
  const host = document.createElement("div");
  host.className = "export-host";
  host.style.position = "fixed";
  host.style.left = "-100000px";
  host.style.top = "0";
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  host.style.overflow = "hidden";
  host.style.pointerEvents = "none";

  const surface = element.cloneNode(true) as HTMLElement;
  surface.classList.add("is-exporting");
  surface.style.width = `${width}px`;
  surface.style.height = `${height}px`;
  surface.style.minHeight = `${height}px`;
  surface.style.overflow = "hidden";

  const flow = surface.querySelector<HTMLElement>(".react-flow");
  if (flow) {
    flow.style.width = `${width}px`;
    flow.style.height = `${height}px`;
  }
  for (const item of surface.querySelectorAll<HTMLElement>(".react-flow__renderer, .react-flow__pane, .react-flow__viewport, .react-flow__container")) {
    item.style.width = `${width}px`;
    item.style.height = `${height}px`;
  }

  if (nodeBounds) {
    const viewport = surface.querySelector<HTMLElement>(".react-flow__viewport");
    if (viewport) viewport.style.transform = `translate(${padding - nodeBounds.minX}px, ${padding - nodeBounds.minY}px) scale(1)`;
  }

  host.appendChild(surface);
  return { host, surface, width, height };
}

function flowNodeBounds(element: HTMLElement): { minX: number; minY: number; width: number; height: number } | undefined {
  const nodes = [...element.querySelectorAll<HTMLElement>(".react-flow__node")];
  if (nodes.length === 0) return undefined;
  const rects = nodes.map((node) => {
    const position = parseTranslate(node.style.transform || node.getAttribute("style") || "");
    return { x: position.x, y: position.y, width: node.offsetWidth, height: node.offsetHeight };
  });
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function parseTranslate(value: string): { x: number; y: number } {
  const translate = value.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
  if (translate) return { x: Number(translate[1]), y: Number(translate[2]) };
  const translate3d = value.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px/);
  if (translate3d) return { x: Number(translate3d[1]), y: Number(translate3d[2]) };
  return { x: 0, y: 0 };
}

function exportOptions(width: number, height: number) {
  return {
    cacheBust: true,
    width,
    height,
    pixelRatio: 2,
    filter: (node: HTMLElement) => !node.classList?.contains("no-export"),
    backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#101214",
  };
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function decodeSvgDataUrl(dataUrl: string): string {
  const encoded = dataUrl.split(",")[1] ?? "";
  return decodeURIComponent(encoded);
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}