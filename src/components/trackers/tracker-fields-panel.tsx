"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  addFieldAction,
  removeFieldAction,
  renameFieldAction,
} from "@/app/(app)/trackers/actions";
import type { TrackerField } from "@/lib/queries/trackers";
import { cn } from "@/lib/utils";

interface Props {
  trackerId: string;
  fields: TrackerField[];
}

export function TrackerFieldsPanel({ trackerId, fields }: Props) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--card)] p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
          Columns
        </h3>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1.5 rounded-full border border-[var(--hairline-strong)] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className={cn("h-3 w-3 transition-transform", adding && "rotate-45")} />
          {adding ? "Cancel" : "Add"}
        </button>
      </div>

      {adding && (
        <AddRow
          trackerId={trackerId}
          onDone={() => setAdding(false)}
        />
      )}

      <div className="space-y-1">
        {fields.map((f) => (
          <FieldRow
            key={f.key}
            trackerId={trackerId}
            field={f}
            editing={editingKey === f.key}
            onEdit={() => setEditingKey(f.key)}
            onCancel={() => setEditingKey(null)}
          />
        ))}
        {fields.length === 0 && (
          <div className="py-2 text-[13px] text-muted-foreground">
            No columns yet. Add one above to start logging.
          </div>
        )}
      </div>
    </div>
  );
}

function FieldRow({
  trackerId,
  field,
  editing,
  onEdit,
  onCancel,
}: {
  trackerId: string;
  field: TrackerField;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(field.label);
  const [isPending, startTransition] = useTransition();

  function commit() {
    if (value.trim() === field.label || value.trim() === "") {
      onCancel();
      return;
    }
    const fd = new FormData();
    fd.set("trackerId", trackerId);
    fd.set("key", field.key);
    fd.set("newLabel", value.trim());
    startTransition(async () => {
      await renameFieldAction(fd);
      onCancel();
    });
  }

  function remove() {
    const fd = new FormData();
    fd.set("trackerId", trackerId);
    fd.set("key", field.key);
    startTransition(async () => {
      await removeFieldAction(fd);
    });
  }

  return (
    <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--secondary)]/40">
      {editing ? (
        <>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") onCancel();
            }}
            className="flex-1 rounded-sm border-b border-foreground bg-transparent px-1 py-0.5 text-[14px] text-foreground focus:outline-none"
          />
          <button
            type="button"
            onClick={commit}
            disabled={isPending}
            className="rounded-full p-1 text-foreground hover:bg-foreground/10"
            aria-label="Save"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full p-1 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
            aria-label="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <>
          <span className="flex-1 truncate text-[14px] text-foreground">
            {field.label}
            {field.unit && (
              <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
                {field.unit}
              </span>
            )}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
            {field.type}
          </span>
          <button
            type="button"
            onClick={onEdit}
            className="rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
            aria-label="Rename"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={isPending}
            className="rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
            aria-label="Remove"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </>
      )}
    </div>
  );
}

function AddRow({
  trackerId,
  onDone,
}: {
  trackerId: string;
  onDone: () => void;
}) {
  const [label, setLabel] = useState("");
  const [unit, setUnit] = useState("");
  const [type, setType] = useState<"number" | "text" | "duration">("number");
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!label.trim()) return;
    const fd = new FormData();
    fd.set("trackerId", trackerId);
    fd.set("label", label.trim());
    fd.set("type", type);
    fd.set("unit", unit.trim());
    startTransition(async () => {
      await addFieldAction(fd);
      setLabel("");
      setUnit("");
      onDone();
    });
  }

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-dashed border-[var(--hairline-strong)] p-2">
      <input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Column name"
        className="min-w-[140px] flex-1 rounded-sm bg-transparent px-1 py-0.5 text-[14px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value as "number" | "text" | "duration")}
        className="rounded-sm border border-[var(--hairline-strong)] bg-transparent px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground focus:outline-none"
      >
        <option value="number">number</option>
        <option value="duration">duration</option>
        <option value="text">text</option>
      </select>
      <input
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        placeholder="unit"
        className="w-20 rounded-sm border border-[var(--hairline-strong)] bg-transparent px-1.5 py-0.5 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
      />
      <button
        type="button"
        onClick={submit}
        disabled={isPending || !label.trim()}
        className="rounded-full bg-foreground px-3 py-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-background transition-opacity disabled:opacity-40"
      >
        {isPending ? "Adding…" : "Add"}
      </button>
    </div>
  );
}
