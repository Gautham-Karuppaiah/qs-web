import { useRef } from "react";

export function Handle({
  axis,
  onResize,
}: {
  axis: "x" | "y";
  onResize: (delta: number) => void;
}) {
  const last = useRef(0);
  return (
    <div
      data-ui
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        last.current = axis === "x" ? e.clientX : e.clientY;
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const now = axis === "x" ? e.clientX : e.clientY;
        onResize(now - last.current);
        last.current = now;
      }}
      onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
      className={`shrink-0 bg-border transition-colors hover:bg-primary/50 ${
        axis === "x" ? "w-px cursor-col-resize" : "h-px cursor-row-resize"
      }`}
      style={axis === "x" ? { width: 4 } : { height: 4 }}
    />
  );
}

export function Rename({
  value,
  onDone,
}: {
  value: string;
  onDone: (name: string | null) => void;
}) {
  return (
    <input
      autoFocus
      defaultValue={value}
      onBlur={(e) => {
        const name = e.target.value.trim();
        onDone(name && name !== value ? name : null);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.currentTarget.value = value;
          e.currentTarget.blur();
        }
      }}
      className="w-full rounded border bg-background px-1.5 py-0.5 text-sm outline-none focus:ring-1 focus:ring-ring"
    />
  );
}

export function RowButtons({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
      {children}
    </div>
  );
}

export function IconButton({
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded px-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-30 ${
        danger ? "hover:text-destructive" : ""
      }`}
    >
      {children}
    </button>
  );
}
