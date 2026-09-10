"use client";

/* ============================================================================
   EDIAGD — a select whose menu is ours

   ---------------------------------------------------------------------------
   THE TRIGGER WAS STYLED AND THE MENU WAS NOT
   ---------------------------------------------------------------------------
   Every filter in the admin looked right until you opened it. The trigger is a
   cream field with a gold focus ring; the popup was the browser's own — 11px
   type, a blue system highlight, rows too small to hit with a thumb, and on the
   Advisor Videos screen it opened UPWARD over the page heading, so the word
   "Videos" was covered by the list. Half a control designed.

   ---------------------------------------------------------------------------
   IT OPENS DOWNWARD, ALWAYS
   ---------------------------------------------------------------------------
   Not "downward if there is room". A menu that flips up when the viewport is
   short is a menu that covers the heading on exactly the screens where the
   heading matters most, which is the bug in the screenshot. When space below is
   tight the panel gets shorter and scrolls instead. The anchor never moves, so
   the same filter is always in the same place.

   ---------------------------------------------------------------------------
   THE STYLED MENU EVERYWHERE, INCLUDING TOUCH — AND WHY THAT CHANGED
   ---------------------------------------------------------------------------
   This first shipped with a stated rule: `(pointer: coarse)` got a real
   <select> so iOS would show its sheet, which is genuinely better on a phone —
   thumb-height, momentum scroll, dims the page.

   Ryan found the hole within the hour. Chrome DevTools device mode ALSO sets
   pointer: coarse, so switching to mobile in Inspect handed back the native
   control — but you are still in desktop Chrome, so what you get is the macOS
   popup: 11px type, blue system highlight. The emulated preview was worse than
   either real experience, and it made the mobile layout unreviewable. "I think
   the issue is when i switch to mobile on Inspect."

   There is no honest way around it. Device emulation fakes coarse pointers,
   touch points and the user agent precisely so that media queries cannot tell
   it apart from a phone; any detection good enough to see through it would also
   be wrong on some real device.

   So the trade got re-priced. This is ADMIN — Ryan and Mitch, mostly desktop
   and iPad — so the iOS sheet was worth little, while being unable to see your
   own design in device mode costs something every time anybody checks a screen.
   One menu now, on every pointer. The 44px rows were always sized for a thumb.

   WHAT SURVIVES: before JavaScript runs, and on the server, this is still a
   plain <select>. Not a fallback so much as the honest default — the control
   works without us, and the styled menu is an enhancement on top.
   ============================================================================ */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

export type SelectOption = {
  value: string;
  label: string;
  /** Optional second line — a count, a code, whatever earns the room. */
  hint?: string;
  /**
   * Optional heading this option sits under — the op-code list is 200 codes
   * grouped by category, and an ungrouped wall of them is unreadable. Maps to
   * <optgroup> on the native path so the two lists agree.
   */
  group?: string;
};

/** Options in source order, bucketed into their groups. Order is preserved. */
function byGroup(options: SelectOption[]): { group: string | undefined; items: SelectOption[] }[] {
  const out: { group: string | undefined; items: SelectOption[] }[] = [];
  for (const o of options) {
    const last = out[out.length - 1];
    if (last && last.group === o.group) last.items.push(o);
    else out.push({ group: o.group, items: [o] });
  }
  return out;
}

/**
 * The trigger's look, shared by both paths so the swap is invisible.
 *
 * p-3 and NO size class, so it inherits the 16px base. iOS Safari — and so the
 * WKWebView the app ships in — zooms the whole page when a control smaller than
 * 16px takes focus, which used to jump the layout every time a filter opened.
 */
export const SELECT_TRIGGER_CLASS =
  "rounded-xl border border-line bg-cream-card p-3 text-left font-semibold text-navy " +
  "outline-none focus:ring-2 focus:ring-gold";

/**
 * False until the component has mounted on the client.
 *
 * The server and the first client render must agree or React screams, so both
 * emit the native <select>; the styled menu takes over on the next tick. No
 * flash, because the trigger is the same box either way.
 */
const NEVER_CHANGES = () => () => {};

function useMounted(): boolean {
  /* useSyncExternalStore rather than setState-in-an-effect: it is the sanctioned
     way to give the server one answer and the client another without a cascading
     render, and the lint rule is right to reject the effect version. */
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false
  );
}

export function Select({
  value,
  onChange,
  options,
  ariaLabel,
  id,
  disabled = false,
  /** Fills its column, which is what a Field wants. Off for inline toolbars. */
  fullWidth = true,
  /**
   * LAYOUT, and it lands on the WRAPPER — width, max-width, margins.
   *
   * It has to. The Families row caps its control at 16rem and sits it beside a
   * checkbox; when this class went on the button instead, the wrapper still
   * took the full row and pushed "Coachable" and Save out to the far edge. The
   * old <select> carried `w-full sm:max-w-[16rem]` on the element itself, so
   * the element WAS the box the flex row measured. The wrapper is that box now.
   */
  className = "",
  /** APPEARANCE, on the trigger itself — a red border for an invalid field. */
  triggerClassName = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** What a screen reader announces. Usually the visible field label. */
  ariaLabel: string;
  id?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  className?: string;
  triggerClassName?: string;
}) {
  const custom = useMounted();
  const width = fullWidth ? "w-full" : "";

  return custom ? (
    <StyledSelect
      value={value}
      onChange={onChange}
      options={options}
      ariaLabel={ariaLabel}
      id={id}
      disabled={disabled}
      fullWidth={fullWidth}
      className={className}
      triggerClassName={triggerClassName}
    />
  ) : (
    /* Server, first paint, or no JavaScript: the platform's control. */
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`${SELECT_TRIGGER_CLASS} ${width} ${className} ${triggerClassName}`}
    >
      {byGroup(options).map((bucket, i) =>
        bucket.group ? (
          <optgroup key={`${bucket.group}-${i}`} label={bucket.group}>
            {bucket.items.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ) : (
          bucket.items.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))
        )
      )}
    </select>
  );
}

/** Room kept between the panel and the bottom of the window. */
const VIEWPORT_MARGIN = 16;
/** Never shorter than this, even in a cramped viewport — it would be unusable. */
const MIN_PANEL = 168;
const MAX_PANEL = 320;

function StyledSelect({
  value,
  onChange,
  options,
  ariaLabel,
  id,
  disabled,
  fullWidth,
  className,
  triggerClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel: string;
  id?: string;
  disabled: boolean;
  fullWidth: boolean;
  className: string;
  triggerClassName: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [maxHeight, setMaxHeight] = useState(MAX_PANEL);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ buffer: "", at: 0 });
  const listId = useId();

  const selectedIndex = useMemo(
    () => Math.max(0, options.findIndex((o) => o.value === value)),
    [options, value]
  );
  const selected = options[selectedIndex];

  const close = useCallback(
    (returnFocus = true) => {
      setOpen(false);
      /* The trigger gets focus back on every close — Escape, a pick, a click
         away. Losing focus to <body> means the next Tab starts from the top of
         the page, which on a filter row is three fields backwards. */
      if (returnFocus) triggerRef.current?.focus();
    },
    []
  );

  const commit = useCallback(
    (index: number) => {
      const option = options[index];
      if (option) onChange(option.value);
      close();
    },
    [options, onChange, close]
  );

  /* Open at the current value, and size the panel to the room below. */
  const openMenu = useCallback(() => {
    if (disabled) return;
    const box = triggerRef.current?.getBoundingClientRect();
    if (box) {
      const below = window.innerHeight - box.bottom - VIEWPORT_MARGIN;
      setMaxHeight(Math.max(MIN_PANEL, Math.min(MAX_PANEL, below)));
    }
    setActive(selectedIndex);
    setOpen(true);
  }, [disabled, selectedIndex]);

  /* Move the DOM focus onto the panel so arrows and type-ahead are its own. */
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  /* Keep the active row in view when the arrows walk past the fold. */
  useEffect(() => {
    if (!open) return;
    const el = panelRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  /* A tap or click anywhere else closes, WITHOUT stealing focus back — the
     person is already on their way somewhere and yanking focus would fight
     them.

     pointerdown, not mousedown: now that touch gets this menu too, a mousedown
     listener would depend on the synthetic mouse event iOS fires AFTER the
     touch settles, so tapping the page to dismiss would feel laggy or miss
     entirely. pointerdown fires for a finger and a mouse alike, immediately. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !triggerRef.current?.contains(t)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  /** Jump to the first option starting with what has been typed. */
  const typeAhead = useCallback(
    (char: string) => {
      const now = Date.now();
      /* A pause resets the buffer: "s", wait, "t" means two searches, not "st".
         One second is about the gap between a deliberate second letter and a
         change of mind. */
      typed.current.buffer = now - typed.current.at > 1000 ? char : typed.current.buffer + char;
      typed.current.at = now;

      const q = typed.current.buffer.toLowerCase();
      const from = typed.current.buffer.length === 1 ? active + 1 : active;
      for (let i = 0; i < options.length; i++) {
        const idx = (from + i) % options.length;
        if (options[idx].label.toLowerCase().startsWith(q)) {
          setActive(idx);
          return;
        }
      }
    },
    [active, options]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(active);
        break;
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => Math.min(options.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(options.length - 1);
        break;
      case "Tab":
        /* Tab commits and moves on, the way a native select does. */
        commit(active);
        break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          typeAhead(e.key);
        }
    }
  };

  return (
    <div className={`relative ${fullWidth ? "w-full" : "inline-block"} ${className}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        className={`${SELECT_TRIGGER_CLASS} ${fullWidth ? "w-full" : ""} flex items-center justify-between gap-2 disabled:opacity-60 ${triggerClassName}`}
      >
        <span className="truncate">{selected?.label ?? ""}</span>
        {/* Rotates on open, so the control says which way it is going. */}
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M5 7l5 6 5-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul
          ref={panelRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={onKeyDown}
          style={{ maxHeight }}
          /* ANCHORED BELOW, ALWAYS — see the header. z-30 clears the sticky
             admin header without competing with modals. */
          className="absolute left-0 top-[calc(100%+0.375rem)] z-30 min-w-full overflow-y-auto rounded-xl border border-line bg-cream-card py-1 shadow-[0_8px_28px_rgba(12,28,44,0.16)] outline-none"
        >
          {/* The flat index the keyboard walks is assigned as we go, so a
              grouped list and an ungrouped one number identically. */}
          {(() => {
            let i = -1;
            return byGroup(options).map((bucket, b) => {
              const rows = bucket.items.map((o) => renderOption(o, ++i));
              if (!bucket.group) return rows;
              return (
                /* role="group" is the listbox's own idiom for this — a heading
                   with its options under it, and the heading is not countable,
                   so "3 of 47" stays true. */
                <li key={`g-${b}`} role="group" aria-label={bucket.group}>
                  <p className="sticky top-0 z-10 bg-cream-card px-3 pb-1 pt-2 text-xs font-extrabold uppercase tracking-wide text-ink-soft">
                    {bucket.group}
                  </p>
                  {rows}
                </li>
              );
            });
          })()}
        </ul>
      )}
    </div>
  );

  function renderOption(o: SelectOption, i: number) {
            const isSelected = o.value === value;
            const isActive = i === active;
            return (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(i)}
                /* 44px: the touch target the rest of the app uses, kept on the
                   pointer build too so the two never disagree about density. */
                className={`flex min-h-[44px] cursor-pointer items-center gap-2 px-3 py-2 text-navy ${
                  isActive ? "bg-teal-soft/40" : ""
                }`}
              >
                <span className="flex w-4 shrink-0 justify-center">
                  {isSelected && (
                    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 text-teal">
                      <path d="M4 10l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate ${isSelected ? "font-extrabold" : "font-semibold"}`}>
                    {o.label}
                  </span>
                  {o.hint && <span className="block truncate text-xs text-ink-soft">{o.hint}</span>}
                </span>
              </li>
            );
  }
}


/* ============================================================================
   SelectField — the same control, for a form that posts

   The mapping screens are server components: a <form action={serverAction}>
   with an uncontrolled <select name="family">. There is no React state to hand
   a controlled Select, and no client handler to give it.

   So this holds the value itself and writes it to a hidden input under the
   given name. The form keeps posting exactly the field it always posted; the
   server action does not know anything changed. That was the constraint worth
   respecting — sweeping these onto the component must not become a rewrite of
   four save paths.
   ============================================================================ */
export function SelectField({
  name,
  defaultValue,
  options,
  ariaLabel,
  id,
  disabled = false,
  fullWidth = true,
  className = "",
  triggerClassName = "",
  onValueChange,
}: {
  name: string;
  defaultValue?: string;
  options: SelectOption[];
  ariaLabel: string;
  id?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  className?: string;
  triggerClassName?: string;
  onValueChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue ?? options[0]?.value ?? "");

  /* A server navigation re-renders this page with a new defaultValue but keeps
     the same React instance, so useState would hold the old pick. The op-code
     screen computes its default from the URL — ?picked=BRK-021 — and would show
     the previous row's code. When the server states a new default, take it. */
  const [seen, setSeen] = useState(defaultValue);
  if (defaultValue !== seen) {
    setSeen(defaultValue);
    setValue(defaultValue ?? options[0]?.value ?? "");
  }

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Select
        ariaLabel={ariaLabel}
        id={id}
        value={value}
        onChange={(v) => {
          setValue(v);
          onValueChange?.(v);
        }}
        options={options}
        disabled={disabled}
        fullWidth={fullWidth}
        className={className}
        triggerClassName={triggerClassName}
      />
    </>
  );
}
