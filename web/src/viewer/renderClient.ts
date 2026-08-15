import type {
  OpenReply,
  PageReply,
  CancelReply,
  ThumbReply,
  RenderReply,
  CropReply,
} from "./render.worker.ts";

export type RenderRequest = {
  level: number;
  col: number;
  row: number;
  size: number;
};

export type CropRequest = {
  x: number;
  y: number;
  w: number;
  h: number;
  dpi: number;
};

export function createRenderClient() {
  const worker = new Worker(new URL("./render.worker.ts", import.meta.url), {
    type: "module",
  });
  const pending = new Map<number, (reply: unknown) => void>();
  let nextId = 1;

  worker.onmessage = ({ data }) => {
    pending.get(data.id)?.(data);
    pending.delete(data.id);
  };

  const send = <T>(message: object) =>
    new Promise<T>((resolve) => {
      const id = nextId++;
      pending.set(id, resolve as (reply: unknown) => void);
      worker.postMessage({ ...message, id });
    });

  return {
    open: (bytes: Uint8Array) => send<OpenReply>({ type: "open", bytes }),
    page: (index: number) => send<PageReply>({ type: "page", index }),
    cancel: () => send<CancelReply>({ type: "cancel" }),
    thumb: (index: number, edge: number) =>
      send<ThumbReply>({ type: "thumb", index, edge }),
    render: (request: RenderRequest) =>
      send<RenderReply>({ type: "render", ...request }),
    crop: (request: CropRequest) => send<CropReply>({ type: "crop", ...request }),
    destroy: () => worker.terminate(),
  };
}
