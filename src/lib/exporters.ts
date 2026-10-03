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
const FRAME_FALLBACK_MS = 100;

interface PreparedExport {
  host: HTMLDivElement;
  surface: HTMLElement;
  width: number;
  height: number;
}

export async function exportTreeElement(element: HTMLElement, projectName: string, format: ExportFormat): Promise<string | null> {
  const bridge = desktop();
  const prepared = prepareExportElement(element);
  document.body.appendChild(prepared.host);
  // Rasterising waits on the browser to decode an image, which it does not do
  // for a hidden window: switching away mid-export used to stall it.
  bridge.keepRendering(true);
  try {
    await document.fonts.ready;
    await nextFrame();
    await nextFrame();
    const data = await renderExport(prepared, format);
    return await bridge.exportFile({ data, format, suggestedName: safeFileName(projectName) });
  } finally {
    bridge.keepRendering(false);
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
  if (format === "svg") return pruneSvgStyles(decodeSvgDataUrl(await toSvg(prepared.surface, options)));

  const pngDataUrl = await toPng(prepared.surface, options);
  if (format === "png") return dataUrlToBytes(pngDataUrl);

  const { jsPDF } = await import("jspdf");
  const page = pdfPageSize(prepared.width, prepared.height);
  const pdf = new jsPDF({ orientation: page.width >= page.height ? "landscape" : "portrait", unit: "px", format: [page.width, page.height], compress: true });
  // Without a compression mode jsPDF stores the decoded pixels as they are,
  // which turned a 0.5 MB picture of a small tree into a 10 MB PDF.
  pdf.addImage(pngDataUrl, "PNG", 0, 0, page.width, page.height, undefined, "FAST");
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
    // Handles are invisible points in an export (their dots are hidden), but
    // each carried a copy of every CSS property for its ::after dot - 600 KB
    // of an 8-person SVG.
    filter: (node: HTMLElement) => !node.classList?.contains("no-export") && !node.classList?.contains("react-flow__handle"),
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

/** What the browser told us about how each CSS property behaves. */
export interface PropertyTraits {
  /** Properties a child takes from its parent when it does not set them. */
  inherited: ReadonlySet<string>;
  /** Properties that fall back to their default instead. */
  notInherited: ReadonlySet<string>;
  /** Properties whose default follows the element's own `color` (`currentcolor`). */
  followsColor: ReadonlySet<string>;
}

const NO_TRAITS: PropertyTraits = { inherited: new Set(), notInherited: new Set(), followsColor: new Set() };

/**
 * Properties the browser reports as measured lengths rather than as written:
 * `width: auto` reads back as "236px", `transform-origin: 50% 50%` as the
 * pixels of the element's own centre. Matching a default there means nothing,
 * so they are always kept.
 */
const LAYOUT_RESOLVED = /^(width|height|inline-size|block-size|top|right|bottom|left|inset-.+|margin-.+|padding-.+|transform-origin|perspective-origin)$/;
/**
 * Offsets, margins and paddings are reported as written when they are these
 * values, so they can be compared like anything else. Sizes never can: a
 * measured "0px" width is not the default "auto".
 */
const LAYOUT_LITERALS = new Set(["auto", "0px"]);
const SIZE = /^(width|height|inline-size|block-size|transform-origin|perspective-origin)$/;

/**
 * html-to-image writes every computed CSS property onto every element of an
 * SVG export - about 7 KB each, over 2 MB for the eight-person sample. Most of
 * it restates what the element would get anyway, and a declaration can go when
 * removing it leaves the element with the same value:
 *
 * - an inherited property that matches the parent's value;
 * - any other property that matches its default - including a colour that
 *   only repeats the element's own `color`, as borders and outlines do;
 * - for a property the browser did not classify, only a value that matches
 *   both, which is right whichever way it behaves.
 *
 * Custom properties are kept where they are first set and dropped below,
 * since the exported file has no stylesheet to define them.
 *
 * Three kinds are never removed: values measured from layout (see
 * `LAYOUT_RESOLVED`); properties the browser's own stylesheet sets for this
 * kind of element (`defaults` differs from `base`, the defaults of a plain
 * element) - a paragraph's margins are relative to the font in force and
 * would come back different; and inherited properties this kind of element
 * does not take from its parent (`overridden`) - a button's text colour comes
 * from the system's button colour, which is white in a dark theme.
 *
 * `parent` is undefined for the outermost element, which inherits the defaults.
 */
export function prunedDeclarations(
  own: ReadonlyMap<string, string>,
  parent: ReadonlyMap<string, string> | undefined,
  defaults: ReadonlyMap<string, string>,
  traits: PropertyTraits = NO_TRAITS,
  base: ReadonlyMap<string, string> = defaults,
  overridden: ReadonlySet<string> = new Set(),
): Map<string, string> {
  const isDefault = (name: string, value: string) =>
    defaults.get(name) === value ||
    (value === "initial" && traits.notInherited.has(name)) ||
    (traits.followsColor.has(name) && name !== "color" && value === own.get("color"));
  const measured = (name: string, value: string) => LAYOUT_RESOLVED.test(name) && (SIZE.test(name) || !LAYOUT_LITERALS.has(value));
  const isInherited = (name: string, value: string) => (parent ? parent.get(name) === value : isDefault(name, value));

  const kept = new Map<string, string>();
  for (const [name, value] of own) {
    // Custom properties always inherit and have no default outside the app's
    // stylesheet: kept where they are set, dropped where they would be inherited.
    if (name.startsWith("--")) {
      if (parent?.get(name) !== value) kept.set(name, value);
      continue;
    }
    const fixed = measured(name, value) || defaults.get(name) !== base.get(name) || overridden.has(name);
    const redundant =
      !fixed &&
      (traits.inherited.has(name)
        ? isInherited(name, value)
        : traits.notInherited.has(name)
          ? isDefault(name, value)
          : isDefault(name, value) && isInherited(name, value));
    if (!redundant) kept.set(name, value);
  }
  return kept;
}

/** Applies `prunedDeclarations` to every styled element of an exported SVG. */
function pruneSvgStyles(svg: string): string {
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (parsed.querySelector("parsererror")) return svg;

  const probe = new StyleProbe();
  const scratch = document.createElement("div");
  const read = (element: Element) => {
    const declarations = new Map<string, string>();
    // The browser's own parser, so values holding ";" (data URLs, quoted fonts) survive intact.
    scratch.setAttribute("style", element.getAttribute("style") ?? "");
    for (let index = 0; index < scratch.style.length; index += 1) {
      const name = scratch.style.item(index);
      const priority = scratch.style.getPropertyPriority(name);
      declarations.set(name, `${scratch.style.getPropertyValue(name)}${priority ? ` !${priority}` : ""}`);
    }
    return declarations;
  };

  try {
    const styled = [...parsed.querySelectorAll("[style]")];
    const declared = new Map(styled.map((element) => [element, read(element)]));
    const traits = probe.traits(declared.values(), styled);
    for (const element of styled) {
      const parent = element.parentElement?.closest("[style]") ?? undefined;
      const kept = prunedDeclarations(
        declared.get(element) ?? new Map(),
        parent ? declared.get(parent) : undefined,
        probe.defaultsOf(element),
        traits,
        probe.baseFor(element),
        traits.overriddenFor(element),
      );
      const text = [...kept].map(([name, value]) => `${name}: ${value}`).join("; ");
      if (text) element.setAttribute("style", text);
      else element.removeAttribute("style");
    }
  } finally {
    probe.dispose();
  }
  return new XMLSerializer().serializeToString(parsed);
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

/**
 * Asks the browser how CSS behaves with no author styles involved: elements
 * are measured inside a shadow root under a host reset with `all: initial`,
 * so none of the app's own CSS leaks into the answers. (`all` does not reset
 * custom properties, which is why `prunedDeclarations` never consults the
 * probe about them.)
 */
class StyleProbe {
  private readonly host = document.createElement("div");
  private readonly root: ShadowRoot;
  private readonly svgRoot = document.createElementNS(SVG_NAMESPACE, "svg");
  private readonly cache = new Map<string, Map<string, string>>();

  constructor() {
    this.host.style.cssText = "all: initial; position: fixed; left: -100000px; top: 0;";
    this.root = this.host.attachShadow({ mode: "open" });
    this.root.append(this.svgRoot);
    document.body.append(this.host);
  }

  /** The computed style an element of this kind gets from the browser alone. */
  defaultsOf(element: Element): Map<string, string> {
    const namespace = element.namespaceURI ?? HTML_NAMESPACE;
    const key = `${namespace} ${element.localName}`;
    let styles = this.cache.get(key);
    if (!styles) {
      const probe = document.createElementNS(namespace, element.localName);
      // SVG shapes only get their real defaults inside an <svg>.
      (namespace === SVG_NAMESPACE && element.localName !== "svg" ? this.svgRoot : this.root).append(probe);
      styles = computedMap(probe);
      probe.remove();
      this.cache.set(key, styles);
    }
    return styles;
  }

  /** Defaults of a plain element in the same namespace, which no browser stylesheet rule targets. */
  baseFor(element: Element): Map<string, string> {
    const namespace = element.namespaceURI ?? HTML_NAMESPACE;
    return this.defaultsOf(document.createElementNS(namespace, namespace === SVG_NAMESPACE ? "g" : "div"));
  }

  /**
   * Classifies every property used in the export. Each is set to one of the
   * export's own values on a parent: if the value takes and a plain child picks
   * it up, the property is inherited; if it takes and the child does not, it is
   * not. A value that does not take leaves the property unclassified. For an
   * inherited property, every kind of element in the export is checked too: one
   * that does not pick the value up has it overridden by the browser's own
   * stylesheet. Separately, a property whose default changes with `color`
   * follows it.
   */
  traits(declarations: Iterable<ReadonlyMap<string, string>>, elements: Element[]): PropertyTraits & { overriddenFor: (element: Element) => ReadonlySet<string> } {
    const parent = document.createElement("div");
    const child = document.createElement("div");
    const svg = document.createElementNS(SVG_NAMESPACE, "svg");
    parent.append(child, svg);
    this.root.append(parent);

    const kinds = new Map<string, Element>();
    for (const element of elements) {
      const namespace = element.namespaceURI ?? HTML_NAMESPACE;
      const key = `${namespace} ${element.localName}`;
      if (kinds.has(key)) continue;
      const probe = document.createElementNS(namespace, element.localName);
      (namespace === SVG_NAMESPACE && element.localName !== "svg" ? svg : parent).append(probe);
      kinds.set(key, probe);
    }

    const plainParent = computedMap(parent);
    const plain = computedMap(child);
    parent.style.color = "rgb(1, 2, 3)";
    const coloured = computedMap(child);
    parent.style.removeProperty("color");
    const followsColor = new Set([...coloured].filter(([name, value]) => plain.get(name) !== value).map(([name]) => name));

    const candidates = new Map<string, string>();
    for (const declared of declarations) {
      for (const [name, value] of declared) {
        if (!name.startsWith("--") && !candidates.has(name) && value !== plainParent.get(name)) candidates.set(name, value.replace(/ !important$/, ""));
      }
    }

    const inherited = new Set<string>();
    const notInherited = new Set<string>();
    const overridden = new Map<string, Set<string>>([...kinds.keys()].map((key) => [key, new Set<string>()]));
    for (const [name, value] of candidates) {
      parent.style.setProperty(name, value);
      const set = getComputedStyle(parent).getPropertyValue(name);
      if (set !== plainParent.get(name)) {
        if (getComputedStyle(child).getPropertyValue(name) === set) {
          inherited.add(name);
          for (const [key, probe] of kinds) {
            if (getComputedStyle(probe).getPropertyValue(name) !== set) overridden.get(key)?.add(name);
          }
        } else {
          notInherited.add(name);
        }
      }
      parent.style.removeProperty(name);
    }
    parent.remove();

    const none = new Set<string>();
    return {
      inherited,
      notInherited,
      followsColor,
      overriddenFor: (element) => overridden.get(`${element.namespaceURI ?? HTML_NAMESPACE} ${element.localName}`) ?? none,
    };
  }

  dispose(): void {
    this.host.remove();
  }
}

function computedMap(element: Element): Map<string, string> {
  const computed = getComputedStyle(element);
  const styles = new Map<string, string>();
  for (let index = 0; index < computed.length; index += 1) {
    const name = computed.item(index);
    styles.set(name, computed.getPropertyValue(name));
  }
  return styles;
}

function decodeSvgDataUrl(dataUrl: string): string {
  return decodeURIComponent(dataUrl.slice(dataUrl.indexOf(",") + 1));
}

/**
 * The next frame, or a moment later if no frame comes: Chromium stops drawing
 * frames for a window that is hidden or covered, and an export started just
 * before switching away would otherwise wait until the window came back.
 */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, FRAME_FALLBACK_MS);
    requestAnimationFrame(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}
