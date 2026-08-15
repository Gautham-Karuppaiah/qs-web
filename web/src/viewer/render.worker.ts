import { init } from "@embedpdf/pdfium";
import wasmUrl from "@embedpdf/pdfium/pdfium.wasm?url";

export type OpenMessage = { id: number; type: "open"; bytes: Uint8Array };
export type PageMessage = { id: number; type: "page"; index: number };
export type CancelMessage = { id: number; type: "cancel" };
export type RenderMessage = {
  id: number;
  type: "render";
  level: number;
  col: number;
  row: number;
  size: number;
};
export type CropMessage = {
  id: number;
  type: "crop";
  x: number;
  y: number;
  w: number;
  h: number;
  dpi: number;
};
export type ThumbMessage = {
  id: number;
  type: "thumb";
  index: number;
  edge: number;
};
export type ThumbReply = { id: number; jpeg: ArrayBuffer | null };
export type WorkerMessage =
  | OpenMessage
  | PageMessage
  | CancelMessage
  | ThumbMessage
  | RenderMessage
  | CropMessage;
export type PageSize = { width: number; height: number };
export type OpenReply = { id: number; sizes: PageSize[] };
export type PageReply = { id: number; index: number };
export type CancelReply = { id: number };
export type RenderReply = {
  id: number;
  index: number;
  bitmap: ImageBitmap | null;
};
export type CropReply = { id: number; png: ArrayBuffer; w: number; h: number };

const REVERSE_BYTE_ORDER = 0x10;

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

type Pdfium = Awaited<ReturnType<typeof init>>;

const heap = (p: Pdfium) =>
  (p.pdfium as unknown as { HEAPU8: Uint8Array }).HEAPU8;

let pdfium: Pdfium | null = null;
let filePtr = 0;
let docPtr = 0;
let pagePtr = 0;
let pageIndex = -1;

const ready = (async () => {
  const wasmBinary = await fetch(wasmUrl).then((r) => r.arrayBuffer());
  pdfium = await init({ wasmBinary });
  pdfium.PDFiumExt_Init();
})();

type Job = Exclude<WorkerMessage, CancelMessage>;

const jobs: Job[] = [];
const lowJobs: Job[] = [];
let running = false;

const abandon = (job: Job) => {
  if (job.type === "render")
    scope.postMessage({ id: job.id, index: -1, bitmap: null });
  else if (job.type === "thumb") scope.postMessage({ id: job.id, jpeg: null });
};

const drain = () => {
  for (const job of jobs) abandon(job);
  for (const job of lowJobs) abandon(job);
  jobs.length = 0;
  lowJobs.length = 0;
};

scope.onmessage = ({ data }) => {
  if (data.type === "cancel") {
    drain();
    scope.postMessage({ id: data.id });
    return;
  }
  (data.type === "thumb" ? lowJobs : jobs).push(data);
  pump();
};

const pump = async () => {
  if (running) return;
  running = true;
  await ready;
  for (;;) {
    const job = jobs.shift() ?? lowJobs.shift();
    if (!job) break;
    try {
      await handle(job);
    } catch (e) {
      console.error("render worker", job.type, e);
      abandon(job);
    }
  }
  running = false;
};

const handle = async (data: Job) => {
  const p = pdfium!;

  if (data.type === "open") {
    if (pagePtr) p.FPDF_ClosePage(pagePtr);
    if (docPtr) p.FPDF_CloseDocument(docPtr);
    if (filePtr) p.pdfium.wasmExports.free(filePtr);

    filePtr = p.pdfium.wasmExports.malloc(data.bytes.length);
    heap(p).set(data.bytes, filePtr);
    docPtr = p.FPDF_LoadMemDocument(filePtr, data.bytes.length, "");
    pagePtr = 0;
    pageIndex = -1;
    const count = p.FPDF_GetPageCount(docPtr);

    const sizePtr = p.pdfium.wasmExports.malloc(8);
    const sizes: PageSize[] = [];
    for (let i = 0; i < count; i++) {
      const ok = p.FPDF_GetPageSizeByIndexF(docPtr, i, sizePtr);
      const f = new Float32Array(heap(p).buffer, sizePtr, 2);
      sizes.push(ok ? { width: f[0], height: f[1] } : { width: 0, height: 0 });
    }
    p.pdfium.wasmExports.free(sizePtr);

    scope.postMessage({ id: data.id, sizes });
    return;
  }

  if (data.type === "thumb") {
    const page = p.FPDF_LoadPage(docPtr, data.index);
    const pw = p.FPDF_GetPageWidthF(page);
    const ph = p.FPDF_GetPageHeightF(page);
    const s = data.edge / Math.max(pw, ph);
    const bw = Math.max(1, Math.round(pw * s));
    const bh = Math.max(1, Math.round(ph * s));

    const ptr = p.FPDFBitmap_Create(bw, bh, 0);
    p.FPDFBitmap_FillRect(ptr, 0, 0, bw, bh, 0xffffffff);
    p.FPDF_RenderPageBitmap(ptr, page, 0, 0, bw, bh, 0, REVERSE_BYTE_ORDER);

    const buf = p.FPDFBitmap_GetBuffer(ptr);
    const stride = p.FPDFBitmap_GetStride(ptr);
    const pixels = new Uint8ClampedArray(
      heap(p).buffer,
      buf,
      stride * bh,
    ).slice();
    p.FPDFBitmap_Destroy(ptr);
    p.FPDF_ClosePage(page);

    const surface = new OffscreenCanvas(bw, bh);
    surface
      .getContext("2d")!
      .putImageData(new ImageData(pixels, stride / 4, bh), 0, 0);
    const jpeg = await (
      await surface.convertToBlob({ type: "image/jpeg", quality: 0.72 })
    ).arrayBuffer();

    scope.postMessage({ id: data.id, jpeg }, [jpeg]);
    return;
  }

  if (data.type === "page") {
    if (pageIndex !== data.index) {
      if (pagePtr) p.FPDF_ClosePage(pagePtr);
      pagePtr = p.FPDF_LoadPage(docPtr, data.index);
      pageIndex = data.index;
    }
    scope.postMessage({ id: data.id, index: pageIndex });
    return;
  }

  if (data.type === "crop") {
    const s = data.dpi / 72;
    const bw = Math.max(1, Math.round(data.w * s));
    const bh = Math.max(1, Math.round(data.h * s));
    const ptr = p.FPDFBitmap_Create(bw, bh, 0);
    p.FPDFBitmap_FillRect(ptr, 0, 0, bw, bh, 0xffffffff);
    p.FPDF_RenderPageBitmap(
      ptr,
      pagePtr,
      -Math.round(data.x * s),
      -Math.round(data.y * s),
      Math.round(p.FPDF_GetPageWidthF(pagePtr) * s),
      Math.round(p.FPDF_GetPageHeightF(pagePtr) * s),
      0,
      REVERSE_BYTE_ORDER,
    );

    const cropBuf = p.FPDFBitmap_GetBuffer(ptr);
    const cropStride = p.FPDFBitmap_GetStride(ptr);
    const cropPixels = new Uint8ClampedArray(
      heap(p).buffer,
      cropBuf,
      cropStride * bh,
    ).slice();
    p.FPDFBitmap_Destroy(ptr);

    const surface = new OffscreenCanvas(bw, bh);
    surface
      .getContext("2d")!
      .putImageData(new ImageData(cropPixels, cropStride / 4, bh), 0, 0);
    const png = await (
      await surface.convertToBlob({ type: "image/png" })
    ).arrayBuffer();

    scope.postMessage({ id: data.id, png, w: bw, h: bh }, [png]);
    return;
  }

  const { level, col, row, size } = data;
  const scale = 2 ** level;
  const bitmapPtr = p.FPDFBitmap_Create(size, size, 0);
  p.FPDFBitmap_FillRect(bitmapPtr, 0, 0, size, size, 0xffffffff);
  p.FPDF_RenderPageBitmap(
    bitmapPtr,
    pagePtr,
    -col * size,
    -row * size,
    Math.round(p.FPDF_GetPageWidthF(pagePtr) * scale),
    Math.round(p.FPDF_GetPageHeightF(pagePtr) * scale),
    0,
    REVERSE_BYTE_ORDER,
  );

  const buf = p.FPDFBitmap_GetBuffer(bitmapPtr);
  const stride = p.FPDFBitmap_GetStride(bitmapPtr);
  const pixels = new Uint8ClampedArray(
    heap(p).buffer,
    buf,
    stride * size,
  ).slice();
  p.FPDFBitmap_Destroy(bitmapPtr);

  const bitmap = await createImageBitmap(new ImageData(pixels, stride / 4, size));
  scope.postMessage({ id: data.id, index: pageIndex, bitmap }, [bitmap]);
};
