import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Stage, Layer, Rect, Line, Text } from "react-konva";
import Konva from "konva";
import type { createRenderClient } from "./renderClient";
import { createTileCache } from "./tileCache";
import type { Marker } from "../lib/markers";
import { bounds, type Pt } from "../lib/regions";

Konva.autoDrawEnabled = false;

export type Doc = { width: number; height: number; index: number };
export type Box = { x: number; y: number; w: number; h: number };
export type Tool =
  | "pan"
  | "entry"
  | "mark"
  | "erase"
  | "section"
  | "zone"
  | "poly"
  | "delzone";

const drawsBand = (t: Tool) => t === "entry" || t === "section" || t === "zone";
const isPoint = (t: Tool) => t === "mark" || t === "erase" || t === "delzone";

export type Shape = { id: string; name: string; geometry: Pt[] };

const SECTION = { stroke: "#2563eb", fill: "rgba(37,99,235,0.05)" };
const ZONE = { stroke: "#16a34a", fill: "rgba(22,163,74,0.07)" };
const LABEL = "region-label";

const TILE = 512;
const BUDGET = 1024 * 1024 * 1024;
const COARSE_TARGET = 1024;
const PREFETCH = 2;
const SETTLE_MS = 150;
const MAX_INFLIGHT = 6;

type Props = {
  doc: Doc | null;
  client: ReturnType<typeof createRenderClient> | null;
  tool: Tool;
  box: Box | null;
  markers: Marker[];
  boxes: Shape[];
  zones: Shape[];
  colorOf: Map<string, string>;
  onPoint: (pos: { x: number; y: number }) => void;
  onBox: (box: Box | null) => void;
  onPolygon: (points: Pt[]) => void;
  onPainted: (ms: number) => void;
  overlay: ReactNode;
};

function RegionShape({
  shape,
  style,
}: {
  shape: Shape;
  style: { stroke: string; fill: string };
}) {
  const b = bounds(shape.geometry);
  return (
    <>
      <Line
        points={shape.geometry.flat()}
        closed
        stroke={style.stroke}
        strokeWidth={1.5}
        strokeScaleEnabled={false}
        fill={style.fill}
        listening={false}
      />
      {shape.name && (
        <Text
          name={LABEL}
          x={b.x}
          y={b.y}
          offsetY={14}
          text={shape.name}
          fontSize={12}
          fill={style.stroke}
          listening={false}
        />
      )}
    </>
  );
}

export function Canvas({
  doc,
  client,
  tool,
  box,
  markers,
  boxes,
  zones,
  colorOf,
  onPoint,
  onBox,
  onPolygon,
  onPainted,
  overlay,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const bandRef = useRef<Konva.Rect>(null);
  const polyLineRef = useRef<Konva.Line>(null);
  const polyRef = useRef<Pt[]>([]);
  const overlayRef = useRef<HTMLDivElement>(null);
  const view = useRef({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const anchor = useRef<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [painted, setPainted] = useState(false);

  const boxRef = useRef(box);
  boxRef.current = box;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const shapesRef = useRef(false);
  shapesRef.current = markers.length + boxes.length + zones.length > 0;
  const cb = useRef({ onPoint, onBox, onPolygon, onPainted });
  cb.current = { onPoint, onBox, onPolygon, onPainted };

  const drawPoly = (cursor?: Pt) => {
    const line = polyLineRef.current;
    if (!line) return;
    const pts = polyRef.current;
    line.points([...pts.flat(), ...(cursor ?? [])]);
    line.visible(pts.length > 0);
    line.getLayer()?.batchDraw();
  };

  const resetPoly = () => {
    polyRef.current = [];
    drawPoly();
  };

  useEffect(() => {
    if (tool !== "poly") resetPoly();
  }, [tool]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (toolRef.current !== "poly") return;
      if (e.key === "Escape") return resetPoly();
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (polyRef.current.length < 3) return;
      cb.current.onPolygon(polyRef.current);
      resetPoly();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const k = (window.devicePixelRatio || 1) / view.current.scale;
    for (const node of stage.find(`.${LABEL}`)) node.scale({ x: k, y: k });
    stage.batchDraw();
  }, [markers, boxes, zones, colorOf, size]);

  useEffect(() => {
    if (box) return;
    bandRef.current?.visible(false);
    bandRef.current?.getLayer()?.batchDraw();
  }, [box]);


  const positionOverlay = () => {
    const el = overlayRef.current;
    const b = boxRef.current;
    if (!el || !b) return;
    const dpr = window.devicePixelRatio || 1;
    const { scale, x, y } = view.current;
    el.style.left = `${(b.x * scale + x) / dpr}px`;
    el.style.top = `${((b.y + b.h) * scale + y) / dpr + 8}px`;
  };

  useLayoutEffect(positionOverlay, [box, overlay]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!doc || !client || !canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const cache = createTileCache(BUDGET, TILE);
    const pending = new Set<string>();
    const started = performance.now();
    setPainted(false);
    let cancelled = false;
    let width = 0;
    let height = 0;
    let frame = 0;

    const coarseLevel = Math.floor(
      Math.log2(COARSE_TARGET / Math.max(doc.width, doc.height)),
    );
    const maxLevel = coarseLevel + 12;
    const key = (level: number, col: number, row: number) =>
      `${level}/${col}/${row}`;
    const gridCols = (level: number) =>
      Math.ceil((doc.width * 2 ** level) / TILE);
    const gridRows = (level: number) =>
      Math.ceil((doc.height * 2 ** level) / TILE);

    const resize = () => {
      width = Math.floor(canvas.clientWidth * dpr);
      height = Math.floor(canvas.clientHeight * dpr);
      canvas.width = width;
      canvas.height = height;
      setSize({ w: canvas.clientWidth, h: canvas.clientHeight });
    };

    const fitScale = () => Math.min(width / doc.width, height / doc.height);

    const clamp = () => {
      const v = view.current;
      const pw = doc.width * v.scale;
      const ph = doc.height * v.scale;
      v.x =
        pw <= width ? (width - pw) / 2 : Math.min(0, Math.max(width - pw, v.x));
      v.y =
        ph <= height
          ? (height - ph) / 2
          : Math.min(0, Math.max(height - ph, v.y));
    };

    const request = (level: number, col: number, row: number) => {
      const k = key(level, col, row);
      if (pending.has(k) || pending.size >= MAX_INFLIGHT) return;
      pending.add(k);
      client.render({ level, col, row, size: TILE }).then(({ bitmap, index }) => {
        pending.delete(k);
        if (!bitmap) return;
        if (cancelled || index !== doc.index) return bitmap.close();
        cache.put(k, bitmap, level === coarseLevel);
        setPainted(true);
        cb.current.onPainted(Math.round(performance.now() - started));
        schedule();
      });
    };

    const levelFor = (scale: number) =>
      Math.min(maxLevel, Math.max(coarseLevel, Math.ceil(Math.log2(scale))));

    let reqLevel: number | null = null;
    let pendingLevel: number | null = null;
    let settle = 0;

    const onSettle = () => {
      settle = 0;
      if (cancelled || levelFor(view.current.scale) !== pendingLevel) return;
      reqLevel = pendingLevel;
      schedule();
    };

    const compose = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { scale, x, y } = view.current;

      const stage = stageRef.current;
      if (stage) {
        stage.position({ x: x / dpr, y: y / dpr });
        stage.scale({ x: scale / dpr, y: scale / dpr });
        const k = dpr / scale;
        for (const node of stage.find(`.${LABEL}`)) node.scale({ x: k, y: k });
        if (
          boxRef.current ||
          anchor.current ||
          shapesRef.current ||
          polyRef.current.length
        )
          stage.batchDraw();
      }

      positionOverlay();

      const level = levelFor(scale);
      const span = (TILE * scale) / 2 ** level;
      const cols = gridCols(level);
      const rows = gridRows(level);

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, doc.width * scale, doc.height * scale);
      ctx.clip();
      ctx.fillStyle = "#fff";
      ctx.fillRect(x, y, doc.width * scale, doc.height * scale);

      const cv0 = Math.max(0, Math.floor(-x / span));
      const cv1 = Math.min(cols - 1, Math.floor((width - x) / span));
      const rv0 = Math.max(0, Math.floor(-y / span));
      const rv1 = Math.min(rows - 1, Math.floor((height - y) / span));

      const c0 = Math.max(0, cv0 - PREFETCH);
      const c1 = Math.min(cols - 1, cv1 + PREFETCH);
      const r0 = Math.max(0, rv0 - PREFETCH);
      const r1 = Math.min(rows - 1, rv1 + PREFETCH);

      const misses: Array<[number, number, number]> = [];

      for (let col = c0; col <= c1; col++) {
        for (let row = r0; row <= r1; row++) {
          const dx = x + col * span;
          const dy = y + row * span;
          const hit = cache.get(key(level, col, row));
          if (hit) {
            ctx.drawImage(hit, dx, dy, span, span);
            continue;
          }
          const ring = Math.max(0, cv0 - col, col - cv1, rv0 - row, row - rv1);
          misses.push([col, row, ring]);
          for (let up = 1; level - up >= coarseLevel; up++) {
            const step = 2 ** up;
            const ac = Math.floor(col / step);
            const ar = Math.floor(row / step);
            const ancestor = cache.get(key(level - up, ac, ar));
            if (!ancestor) continue;
            const src = TILE / step;
            ctx.drawImage(
              ancestor,
              (col / step - ac) * TILE,
              (row / step - ar) * TILE,
              src,
              src,
              dx,
              dy,
              span,
              span,
            );
            break;
          }
        }
      }

      ctx.restore();

      if (misses.length) {
        if (level === reqLevel) {
          misses.sort((a, b) => a[2] - b[2]);
          for (const [col, row] of misses) request(level, col, row);
        } else {
          pendingLevel = level;
          if (settle) clearTimeout(settle);
          settle = window.setTimeout(onSettle, SETTLE_MS);
        }
      }

    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!cancelled) compose();
      });
    };

    const toPage = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const v = view.current;
      return {
        x: ((e.clientX - rect.left) * dpr - v.x) / v.scale,
        y: ((e.clientY - rect.top) * dpr - v.y) / v.scale,
      };
    };

    const drawBand = (
      a: { x: number; y: number },
      b: { x: number; y: number },
    ) => {
      const band = bandRef.current;
      if (!band) return null;
      const rect = {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        w: Math.abs(b.x - a.x),
        h: Math.abs(b.y - a.y),
      };
      band.setAttrs({
        x: rect.x,
        y: rect.y,
        width: rect.w,
        height: rect.h,
        visible: true,
      });
      band.getLayer()?.batchDraw();
      return rect;
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      const onSurface = target === container || target.tagName === "CANVAS";
      if (!onSurface || e.button !== 0) return;
      e.preventDefault();
      container.setPointerCapture(e.pointerId);

      if (toolRef.current === "poly") {
        const p = toPage(e);
        polyRef.current = [...polyRef.current, [p.x, p.y]];
        drawPoly();
        return;
      }

      if (drawsBand(toolRef.current)) {
        anchor.current = toPage(e);
        cb.current.onBox(null);
        return;
      }

      if (isPoint(toolRef.current)) {
        cb.current.onPoint(toPage(e));
        return;
      }

      drag.current = { x: e.clientX, y: e.clientY };
      container.style.cursor = "grabbing";
    };

    const onPointerMove = (e: PointerEvent) => {
      if (toolRef.current === "poly") {
        if (polyRef.current.length) {
          const p = toPage(e);
          drawPoly([p.x, p.y]);
        }
        return;
      }
      if (anchor.current) {
        drawBand(anchor.current, toPage(e));
        return;
      }
      if (!drag.current) return;
      view.current.x += (e.clientX - drag.current.x) * dpr;
      view.current.y += (e.clientY - drag.current.y) * dpr;
      drag.current = { x: e.clientX, y: e.clientY };
      clamp();
      schedule();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (anchor.current) {
        const rect = drawBand(anchor.current, toPage(e));
        anchor.current = null;
        const kept = rect && rect.w >= 1 && rect.h >= 1 ? rect : null;
        if (!kept) {
          bandRef.current?.visible(false);
          bandRef.current?.getLayer()?.batchDraw();
        }
        cb.current.onBox(kept);
        return;
      }
      if (!drag.current) return;
      drag.current = null;
      container.style.cursor = "";
      schedule();
    };

    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest("[data-ui]")) return;
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * dpr;
      const my = (e.clientY - rect.top) * dpr;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1;
      const v = view.current;
      const fit = fitScale();
      const scale = Math.min(
        Math.max(v.scale * Math.exp(-e.deltaY * unit * 0.002), fit * 0.25),
        fit * 64,
      );
      const k = scale / v.scale;
      v.x = mx - (mx - v.x) * k;
      v.y = my - (my - v.y) * k;
      v.scale = scale;
      clamp();
      schedule();
    };

    const onDoubleClick = () => {
      view.current.scale = fitScale();
      clamp();
      schedule();
    };

    const onResize = () => {
      if (
        Math.floor(canvas.clientWidth * dpr) === width &&
        Math.floor(canvas.clientHeight * dpr) === height
      )
        return;
      resize();
      clamp();
      compose();
    };

    const observer = new ResizeObserver(onResize);
    observer.observe(canvas);

    resize();
    view.current.scale = fitScale();
    clamp();
    reqLevel = levelFor(view.current.scale);
    for (let col = 0; col < gridCols(coarseLevel); col++)
      for (let row = 0; row < gridRows(coarseLevel); row++)
        request(coarseLevel, col, row);
    compose();

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointercancel", onPointerUp);
    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("dblclick", onDoubleClick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (settle) clearTimeout(settle);
      cache.clear();
      client.cancel();
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      setPainted(false);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointercancel", onPointerUp);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("dblclick", onDoubleClick);
      observer.disconnect();
    };
  }, [doc, client]);

  return (
    <div
      ref={containerRef}
      className={`relative min-h-0 min-w-0 flex-1 touch-none select-none ${
        tool === "pan" ? "cursor-grab" : "cursor-crosshair"
      }`}
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none block h-full w-full"
      />

      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        className="absolute inset-0"
      >
        <Layer listening={false} visible={painted}>
          {boxes.map((s) => (
            <RegionShape key={s.id} shape={s} style={SECTION} />
          ))}
          {zones.map((z) => (
            <RegionShape key={z.id} shape={z} style={ZONE} />
          ))}
          {markers.map((m) => (
            <Rect
              key={m.id}
              x={m.x + m.w / 2}
              y={m.y + m.h / 2}
              offsetX={m.w / 2}
              offsetY={m.h / 2}
              width={m.w}
              height={m.h}
              rotation={m.angle}
              stroke={colorOf.get(m.legend_entry_id) ?? "#888"}
              strokeWidth={2}
              strokeScaleEnabled={false}
              listening={false}
            />
          ))}
          <Line
            ref={polyLineRef}
            points={[]}
            visible={false}
            listening={false}
            stroke={ZONE.stroke}
            strokeWidth={1.5}
            strokeScaleEnabled={false}
            fill={ZONE.fill}
            closed
          />
          <Rect
            ref={bandRef}
            visible={false}
            listening={false}
            stroke="#888"
            strokeWidth={1}
            strokeScaleEnabled={false}
            dash={[4, 4]}
            dashEnabled
            fill="rgba(128,128,128,0.12)"
          />
        </Layer>
      </Stage>

      {overlay && (
        <div ref={overlayRef} data-ui className="absolute flex gap-2">
          {overlay}
        </div>
      )}

    </div>
  );
}
