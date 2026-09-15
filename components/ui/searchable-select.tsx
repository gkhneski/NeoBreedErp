"use client";

import { ChevronDown, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

export interface SearchableOption {
  value: string;
  label: string;
  /** Extra text matched by the search but not shown (e.g. barcode, code). */
  keywords?: string;
  /** Optional group heading; consecutive options with the same group share it. */
  group?: string;
  disabled?: boolean;
}

interface SearchableSelectProps {
  name?: string;
  options: SearchableOption[];
  id?: string;
  placeholder?: string;
  /** Uncontrolled initial value. */
  defaultValue?: string;
  /** Controlled value; pair with onChange. */
  value?: string;
  onChange?: (value: string, option: SearchableOption | null) => void;
  required?: boolean;
  disabled?: boolean;
  /** Label shown as the first option that selects "" (e.g. "— Seçilmedi —"). */
  emptyLabel?: string;
  limit?: number;
  className?: string;
  autoFocus?: boolean;
}

// Diacritic-insensitive, case-insensitive normalization (ASKORBİK → askorbik).
const norm = (s: string) =>
  s
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i");

export function SearchableSelect({
  name,
  options,
  id,
  placeholder = "Ara / seç…",
  defaultValue = "",
  value: valueProp,
  onChange,
  required = false,
  disabled = false,
  emptyLabel,
  limit = 60,
  className,
  autoFocus,
}: SearchableSelectProps) {
  const isControlled = valueProp !== undefined;
  const [innerValue, setInnerValue] = useState(defaultValue);
  const value = isControlled ? valueProp : innerValue;

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const [query, setQuery] = useState(selected?.label ?? "");
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  // Keep the visible text in sync when the value changes from outside
  // (controlled reset, options loaded later, etc.).
  useEffect(() => {
    if (!editing) setQuery(selected?.label ?? "");
  }, [selected, editing]);

  const allOptions = useMemo<SearchableOption[]>(
    () =>
      emptyLabel !== undefined
        ? [{ value: "", label: emptyLabel }, ...options]
        : options,
    [emptyLabel, options],
  );

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!editing || !q) return allOptions.slice(0, limit);
    const terms = q.split(/\s+/);
    return allOptions
      .filter((o) => {
        if (o.value === "") return false;
        const hay = norm(`${o.label} ${o.keywords ?? ""}`);
        return terms.every((t) => hay.includes(t));
      })
      .slice(0, limit);
  }, [query, editing, allOptions, limit]);

  useEffect(() => {
    setActive(0);
  }, [filtered]);

  // Native-style required validation on the visible input.
  useEffect(() => {
    inputRef.current?.setCustomValidity(
      required && !value ? "Listeden bir seçim yapın." : "",
    );
  }, [required, value]);

  const measure = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || listRef.current?.contains(t)) return;
      close();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function commit(next: string) {
    if (!isControlled) setInnerValue(next);
    onChange?.(next, options.find((o) => o.value === next) ?? null);
  }

  function close() {
    setOpen(false);
    setEditing(false);
    setQuery(selected?.label ?? "");
  }

  function choose(o: SearchableOption) {
    if (o.disabled) return;
    commit(o.value);
    setQuery(o.label);
    setOpen(false);
    setEditing(false);
  }

  function clear() {
    commit("");
    setQuery("");
    setEditing(false);
    setOpen(false);
    inputRef.current?.focus();
  }

  const showClear = !disabled && !required && value !== "";

  const list =
    open && rect
      ? createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width }}
            className="z-[1000] max-h-64 overflow-auto rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md"
          >
            {filtered.length === 0 ? (
              <li className="px-2 py-1.5 text-muted-foreground">Sonuç yok</li>
            ) : (
              filtered.map((o, i) => {
                const showGroup =
                  o.group !== undefined && (i === 0 || filtered[i - 1].group !== o.group);
                return (
                  <li key={o.value || "__empty"}>
                    {showGroup ? (
                      <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {o.group}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      role="option"
                      aria-selected={o.value === value}
                      data-index={i}
                      disabled={o.disabled}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        choose(o);
                      }}
                      onMouseEnter={() => setActive(i)}
                      className={cn(
                        "block w-full truncate rounded px-2 py-1.5 text-left",
                        o.group !== undefined && "pl-4",
                        o.value === "" && "text-muted-foreground",
                        o.disabled && "cursor-not-allowed opacity-50",
                        i === active ? "bg-secondary" : "hover:bg-secondary/60",
                        o.value === value && "font-medium",
                      )}
                    >
                      {o.label}
                    </button>
                  </li>
                );
              })
            )}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setEditing(true);
          setOpen(true);
        }}
        onFocus={() => {
          if (!disabled) setOpen(true);
        }}
        onClick={() => {
          if (!disabled) setOpen(true);
        }}
        onBlur={(e) => {
          // Mouse-down on the list is prevented from stealing focus; any other
          // blur means the user left the field.
          if (listRef.current?.contains(e.relatedTarget as Node)) return;
          close();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) setOpen(true);
            else setActive((a) => Math.min(a + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            if (open && filtered[active]) {
              e.preventDefault();
              choose(filtered[active]);
            }
          } else if (e.key === "Escape") {
            if (open) {
              e.preventDefault();
              close();
            }
          } else if (e.key === "Backspace" && !editing && value !== "" && !required) {
            // Backspace on a chosen value starts a fresh search.
            e.preventDefault();
            commit("");
            setQuery("");
            setEditing(true);
            setOpen(true);
          }
        }}
        className="flex h-9 w-full rounded-md border border-input bg-background py-1 pl-3 pr-14 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-0.5 pr-2">
        {showClear ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Temizle"
            onMouseDown={(e) => {
              e.preventDefault();
              clear();
            }}
            className="pointer-events-auto rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </div>
      {list}
    </div>
  );
}
