import { useState } from "react";
import { Button } from "@/components/ui/button";
import { boxAssignment, isBox, type Section } from "../lib/sections";

type Props = {
  box: Section;
  sections: Section[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (building: string, floor: string) => void;
};

function Column({
  title,
  names,
  value,
  disabled,
  onPick,
  onNew,
}: {
  title: string;
  names: string[];
  value: string;
  disabled?: boolean;
  onPick: (name: string) => void;
  onNew: (name: string) => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{title}</span>
      <ul className="h-48 overflow-y-auto rounded-md border">
        {names.map((n) => (
          <li key={n}>
            <button
              type="button"
              onClick={() => onPick(n)}
              className={`w-full truncate px-2 py-1 text-left text-sm ${
                n === value ? "bg-accent font-medium" : "hover:bg-accent/50"
              }`}
            >
              {n}
            </button>
          </li>
        ))}
        {!names.length && (
          <li className="px-2 py-1 text-xs text-muted-foreground">
            {disabled ? "pick a building first" : "none yet"}
          </li>
        )}
      </ul>
      {adding ? (
        <input
          autoFocus
          placeholder={`new ${title.toLowerCase()}…`}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") setAdding(false);
            if (e.key !== "Enter") return;
            const name = e.currentTarget.value.trim();
            if (name) onNew(name);
            setAdding(false);
          }}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name) onNew(name);
            setAdding(false);
          }}
          className="rounded border bg-background px-1.5 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      ) : (
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={() => setAdding(true)}
        >
          New {title}…
        </Button>
      )}
    </div>
  );
}

export function AssignDialog({
  box,
  sections,
  busy,
  onCancel,
  onConfirm,
}: Props) {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const [current, setCurrent] = useState<[string, string]>(() => {
    const [b, f] = boxAssignment(box, byId);
    return [b, f];
  });
  const [building, floor] = current;
  const [extraBuildings, setExtraBuildings] = useState<string[]>([]);
  const [extraFloors, setExtraFloors] = useState<string[]>([]);

  const groups = (parentId: string | null) =>
    sections
      .filter((s) => !isBox(s) && s.parent_id === parentId)
      .map((s) => s.name);

  const buildingNode = sections.find(
    (s) => !isBox(s) && s.parent_id === null && s.name === building,
  );

  const buildings = [...new Set([...groups(null), ...extraBuildings])];
  const floors = [
    ...new Set([
      ...(buildingNode ? groups(buildingNode.id) : []),
      ...extraFloors,
    ]),
  ];

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30">
      <div
        data-ui
        className="w-[32rem] rounded-lg border bg-background p-4 shadow-xl"
      >
        <div className="mb-3 text-sm font-medium">Assign section</div>
        <div className="flex gap-4">
          <Column
            title="Building"
            names={buildings}
            value={building}
            onPick={(name) => {
              setExtraFloors([]);
              setCurrent([name, ""]);
            }}
            onNew={(name) => {
              setExtraBuildings((b) => [...b, name]);
              setExtraFloors([]);
              setCurrent([name, ""]);
            }}
          />
          <Column
            title="Floor"
            names={floors}
            value={floor}
            disabled={!building}
            onPick={(name) => setCurrent([building, name])}
            onNew={(name) => {
              setExtraFloors((f) => [...f, name]);
              setCurrent([building, name]);
            }}
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onCancel}>
            cancel
          </Button>
          <Button
            size="sm"
            disabled={!building || busy}
            onClick={() => onConfirm(building, floor)}
          >
            {busy ? "…" : "ok"}
          </Button>
        </div>
      </div>
    </div>
  );
}
