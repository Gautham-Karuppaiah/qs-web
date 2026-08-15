export function createTileCache(budgetBytes: number, tileSize: number) {
  const map = new Map<string, ImageBitmap>();
  const pinned = new Set<string>();
  const cost = tileSize * tileSize * 4;
  let bytes = 0;

  const evict = () => {
    while (bytes > budgetBytes) {
      let victim: string | null = null;
      for (const k of map.keys()) {
        if (!pinned.has(k)) {
          victim = k;
          break;
        }
      }
      if (!victim) return;
      map.get(victim)!.close();
      map.delete(victim);
      bytes -= cost;
    }
  };

  return {
    get(key: string) {
      const bitmap = map.get(key);
      if (!bitmap) return undefined;
      map.delete(key);
      map.set(key, bitmap);
      return bitmap;
    },
    put(key: string, bitmap: ImageBitmap, pin = false) {
      map.get(key)?.close();
      if (!map.delete(key)) bytes += cost;
      map.set(key, bitmap);
      if (pin) pinned.add(key);
      evict();
    },
    clear() {
      for (const bitmap of map.values()) bitmap.close();
      map.clear();
      pinned.clear();
      bytes = 0;
    },
    has(key: string) {
      return map.has(key);
    },
    get count() {
      return map.size;
    },
    get bytes() {
      return bytes;
    },
  };
}
