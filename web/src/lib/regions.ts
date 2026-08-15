import type { Marker } from "./markers";

export type Pt = [number, number];
export type Box = { x: number; y: number; w: number; h: number };

export const rectPoints = (b: Box): Pt[] => [
  [b.x, b.y],
  [b.x + b.w, b.y],
  [b.x + b.w, b.y + b.h],
  [b.x, b.y + b.h],
];

export function bounds(pts: Pt[]): Box {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function pointInPolygon(pts: Pt[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

const centre = (m: Marker): Pt => [m.x + m.w / 2, m.y + m.h / 2];

export type Region = { id: string; geometry: Pt[] };
export type Counts = Map<string, Map<string, number>>;

const bump = (counts: Counts, regionId: string, entryId: string) => {
  let row = counts.get(regionId);
  if (!row) counts.set(regionId, (row = new Map()));
  row.set(entryId, (row.get(entryId) ?? 0) + 1);
};

export function tally(markers: Marker[], boxes: Region[], zones: Region[]) {
  const counts: Counts = new Map();
  const untracked: Marker[] = [];

  for (const m of markers) {
    const [x, y] = centre(m);
    const box = boxes.find((b) => pointInPolygon(b.geometry, x, y));
    if (!box) {
      untracked.push(m);
      continue;
    }
    const zone = zones.find((z) => pointInPolygon(z.geometry, x, y));
    bump(counts, zone ? zone.id : box.id, m.legend_entry_id);
  }

  return { counts, untracked };
}

export function untrackedByPage(
  markers: Array<Marker & { page_id: string }>,
  boxesByPage: Map<string, Region[]>,
) {
  const map = new Map<string, number>();
  for (const m of markers) {
    const boxes = boxesByPage.get(m.page_id);
    if (!boxes?.length) continue;
    const [x, y] = centre(m);
    if (regionAt(boxes, x, y)) continue;
    map.set(m.page_id, (map.get(m.page_id) ?? 0) + 1);
  }
  return map;
}

export function regionAt<T extends Region>(regions: T[], x: number, y: number) {
  for (let i = regions.length - 1; i >= 0; i--)
    if (pointInPolygon(regions[i].geometry, x, y)) return regions[i];
  return null;
}

export const total = (row: Map<string, number> | undefined) =>
  row ? [...row.values()].reduce((a, b) => a + b, 0) : 0;

export type Named = { id: string; name: string };
export type CountRow = { label: string; child: boolean; values: number[] };

export function countRows(
  boxes: Named[],
  zonesOfBox: Map<string, Named[]>,
  counts: Counts,
  entryIds: string[],
): CountRow[] {
  const at = (regionId: string, entryId: string) =>
    counts.get(regionId)?.get(entryId) ?? 0;
  const rows: CountRow[] = [];

  for (const box of boxes) {
    const zones = zonesOfBox.get(box.id) ?? [];
    const own = entryIds.map((e) => at(box.id, e));
    rows.push({
      label: box.name,
      child: false,
      values: entryIds.map(
        (e, i) => own[i] + zones.reduce((a, z) => a + at(z.id, e), 0),
      ),
    });
    for (const z of zones)
      rows.push({
        label: z.name,
        child: true,
        values: entryIds.map((e) => at(z.id, e)),
      });
    if (zones.length && own.some((n) => n))
      rows.push({ label: "(unzoned)", child: true, values: own });
  }

  return rows;
}

export function polygonCentroid(pts: Pt[]): Pt {
  const n = pts.length || 1;
  return [
    pts.reduce((a, p) => a + p[0], 0) / n,
    pts.reduce((a, p) => a + p[1], 0) / n,
  ];
}

export function zonesByBox<T extends Region>(boxes: Region[], zones: T[]) {
  const out = new Map<string, T[]>(boxes.map((b) => [b.id, []]));
  for (const z of zones) {
    const [x, y] = polygonCentroid(z.geometry);
    const box = boxes.find((b) => pointInPolygon(b.geometry, x, y));
    if (box) out.get(box.id)?.push(z);
  }
  return out;
}
