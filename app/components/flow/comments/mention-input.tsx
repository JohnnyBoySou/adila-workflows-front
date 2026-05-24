import { useEffect, useMemo, useRef, useState } from "react";

import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";

export type MentionMember = {
  id: string;
  name?: string | null;
  email?: string | null;
};

type MentionInputProps = {
  value: string;
  onChange: (value: string, mentions: string[]) => void;
  members: MentionMember[];
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  onSubmit?: () => void;
};

/**
 * Textarea com autocomplete @<membro>. Extrai mentions do texto procurando
 * por tokens "@<nome>" que casem com algum membro da org. O texto em si
 * mantém o "@nome" — quem renderiza decide se quer destacar.
 */
export function MentionInput({
  value,
  onChange,
  members,
  placeholder,
  rows = 3,
  autoFocus,
  onSubmit,
}: MentionInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [pickerIndex, setPickerIndex] = useState(0);

  // Atualiza mentions sempre que o texto muda.
  const memberByLabel = useMemo(() => {
    const m = new Map<string, MentionMember>();
    for (const x of members) {
      const label = (x.name || x.email || "").toLowerCase();
      if (label) m.set(label, x);
    }
    return m;
  }, [members]);

  function extractMentions(text: string): string[] {
    const ids = new Set<string>();
    const re = /@([\w.\-]+(?:\s[\w.\-]+)?)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const token = match[1].toLowerCase();
      const m = memberByLabel.get(token);
      if (m) ids.add(m.id);
    }
    return Array.from(ids);
  }

  function handleChange(next: string) {
    onChange(next, extractMentions(next));
    // Detecta token de busca: @ seguido de chars até cursor (sem espaço logo após @).
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? next.length;
    const before = next.slice(0, caret);
    const m = before.match(/@([\w.\-]*)$/);
    if (m) {
      setQuery(m[1].toLowerCase());
      setPickerIndex(0);
    } else {
      setQuery(null);
    }
  }

  const filtered = useMemo(() => {
    if (query === null) return [];
    return members
      .filter((m) => {
        const label = (m.name || m.email || "").toLowerCase();
        return label.includes(query);
      })
      .slice(0, 6);
  }, [members, query]);

  function pick(m: MentionMember) {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@([\w.\-]*)$/, "");
    const after = value.slice(caret);
    const label = m.name || m.email || m.id;
    const next = `${before}@${label} ${after}`;
    onChange(next, extractMentions(next));
    setQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = before.length + 1 + label.length + 1;
      el.setSelectionRange(pos, pos);
    });
  }

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (query !== null && filtered.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setPickerIndex((i) => Math.min(i + 1, filtered.length - 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setPickerIndex((i) => Math.max(i - 1, 0));
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              pick(filtered[pickerIndex]);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setQuery(null);
              return;
            }
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSubmit) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      {query !== null && filtered.length > 0 ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {filtered.map((m, i) => (
            <button
              type="button"
              key={m.id}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent",
                i === pickerIndex && "bg-accent",
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
            >
              <span className="font-medium">{m.name || m.email || m.id}</span>
              {m.email && m.name ? (
                <span className="text-xs text-muted-foreground">{m.email}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
