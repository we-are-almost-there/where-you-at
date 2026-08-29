import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { CourseFilterState } from "../types";
import type { RegionSelectItem } from "../regionOptions";
import { DIFFICULTY_OPTIONS, DISTANCE_OPTIONS, SORT_OPTIONS } from "../coursesMock";

interface Props {
  value: CourseFilterState;
  onChange: (next: CourseFilterState) => void;
  regionOptions: RegionSelectItem[]; // /api/regions → 시도 흡수/도 optgroup 구조
}

export function CourseKeywordSearch({ value, onChange }: Pick<Props, "value" | "onChange">) {
  const composingRef = useRef(false);
  const keywordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestValueRef = useRef(value);
  const latestOnChangeRef = useRef(onChange);
  const [keywordDraft, setKeywordDraft] = useState({
    urlValue: value.keyword,
    inputValue: value.keyword,
  });
  const keyword = keywordDraft.urlValue === value.keyword ? keywordDraft.inputValue : value.keyword;

  const scheduleKeywordChange = (next: string, delay = 250) => {
    if (keywordTimerRef.current) clearTimeout(keywordTimerRef.current);
    keywordTimerRef.current = setTimeout(() => {
      latestOnChangeRef.current({ ...latestValueRef.current, keyword: next });
      keywordTimerRef.current = null;
    }, delay);
  };

  const changeKeyword = (next: string) => {
    setKeywordDraft({ urlValue: value.keyword, inputValue: next });
    if (!composingRef.current) scheduleKeywordChange(next);
  };

  useEffect(() => {
    latestValueRef.current = value;
    latestOnChangeRef.current = onChange;
  }, [value, onChange]);

  useEffect(
    () => () => {
      if (keywordTimerRef.current) clearTimeout(keywordTimerRef.current);
    },
    [],
  );

  return (
    <div className="flex flex-col gap-2.5">
      <input
        type="search"
        value={keyword}
        onChange={(e) => changeKeyword(e.target.value)}
        onCompositionStart={() => {
          composingRef.current = true;
          if (keywordTimerRef.current) clearTimeout(keywordTimerRef.current);
        }}
        onCompositionEnd={(e) => {
          composingRef.current = false;
          changeKeyword(e.currentTarget.value);
        }}
        onBlur={(e) => scheduleKeywordChange(e.currentTarget.value, 0)}
        placeholder="코스 이름 검색"
        className="w-full rounded-lg border border-divider bg-white px-3.5 py-2.5 text-[14px] text-ink placeholder:text-caption focus:border-accent focus:outline-none"
      />
    </div>
  );
}

interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownGroup {
  label: string;
  options: DropdownOption[];
}

type DropdownItem = DropdownOption | DropdownGroup;

function isDropdownGroup(item: DropdownItem): item is DropdownGroup {
  return "options" in item;
}

function buildRegionMenuItems(regionOptions: RegionSelectItem[]): DropdownItem[] {
  const flatRegions = regionOptions.filter((item) => !isDropdownGroup(item));
  const groupedRegions = regionOptions.filter(isDropdownGroup);
  return [
    { value: "", label: "전체 지역" },
    ...flatRegions,
    ...groupedRegions,
  ];
}

function findDropdownOption(items: readonly DropdownItem[], value: string): DropdownOption | undefined {
  for (const item of items) {
    if (isDropdownGroup(item)) {
      const option = item.options.find((candidate) => candidate.value === value);
      if (option) return option;
    } else if (item.value === value) {
      return item;
    }
  }
  return undefined;
}

function FilterDropdown({
  label,
  value,
  onChange,
  items,
  variant,
  align = "start",
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: readonly DropdownItem[];
  variant: "chip" | "inline";
  /** 메뉴가 트리거의 어느 쪽에 붙을지. 오른쪽 끝 칩은 "end"라야 화면 밖으로 넘치지 않는다. */
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = findDropdownOption(items, value) ?? findDropdownOption(items, "");

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const options = () => [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=option]") ?? [])];

  // 메뉴가 열리면 지금 고른 항목으로 초점을 옮긴다. 지역처럼 항목이 80개가 넘을 때
  // 목록이 그 자리로 스크롤돼, 스크롤을 처음부터 훑지 않아도 어디쯤인지 바로 보인다.
  useEffect(() => {
    if (!open) return;
    const all = options();
    (all.find((o) => o.getAttribute("aria-selected") === "true") ?? all[0])?.focus();
  }, [open]);

  // 네이티브 select에는 있던 키보드 이동. 항목이 버튼이라 Tab은 이미 되지만,
  // listbox는 위·아래로 훑는 게 기본이므로 그 경로도 열어 준다.
  const moveFocus = (step: number | "first" | "last") => {
    const all = options();
    if (all.length === 0) return;
    if (step === "first") return all[0].focus();
    if (step === "last") return all[all.length - 1].focus();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    all[at < 0 ? 0 : (at + step + all.length) % all.length].focus();
  };

  const handleKeyDown = (event: ReactKeyboardEvent) => {
    const move = { ArrowDown: 1, ArrowUp: -1, Home: "first", End: "last" } as const;
    const step = move[event.key as keyof typeof move];
    if (step === undefined) return;
    event.preventDefault();
    if (!open) setOpen(true);
    else moveFocus(step);
  };

  const select = (next: string) => {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const renderOption = (option: DropdownOption, nested = false, displayLabel = option.label) => {
    const active = option.value === value;
    return (
      <button
        key={option.value || "all"}
        type="button"
        role="option"
        aria-selected={active}
        onClick={() => select(option.value)}
        className={`flex w-full items-center justify-between gap-4 rounded-lg py-2 pr-3 text-left text-[13px] text-ink transition-colors hover:bg-black/5 ${
          nested ? "pl-5" : "pl-3"
        }`}
      >
        <span className={active ? "font-medium" : ""}>{displayLabel}</span>
        {active && (
          <svg
            className="size-4 shrink-0"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <path d="m4 10 4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    );
  };

  return (
    <div ref={rootRef} onKeyDown={handleKeyDown} className={`relative flex shrink-0 ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex items-center text-[13px] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent/30 ${
          variant === "chip"
            ? "w-full justify-between rounded-xl border border-divider bg-white py-2.5 pl-4 pr-3 font-medium text-ink hover:border-caption"
            : "justify-end gap-1.5 rounded-md py-1 text-caption hover:text-ink"
        }`}
      >
        <span className="truncate">{selected?.label ?? label}</span>
        <svg
          className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="listbox"
          aria-label={`${label} 선택`}
          className={`absolute top-[calc(100%+0.5rem)] z-30 max-h-72 w-max min-w-full max-w-60 overflow-y-auto rounded-xl border border-divider bg-white p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.18)] ${
            align === "end" ? "right-0" : "left-0"
          }`}
        >
          {items.map((item) =>
            isDropdownGroup(item) ? (
              <div
                key={`group-${item.label}`}
                role="group"
                aria-label={item.label}
                className="mt-1 border-t border-divider/80 pt-1"
              >
                <p className="px-3 pb-1 pt-2 text-[12px] font-bold text-ink/65">{item.label}</p>
                {item.options.map((option) =>
                  renderOption(
                    option,
                    true,
                    option.label === `${item.label} 전체` ? "전체" : option.label,
                  ),
                )}
              </div>
            ) : (
              renderOption(item)
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function CourseFilterChips({ value, onChange, regionOptions, showDifficulty }: Props & { showDifficulty: boolean }) {
  const set = <K extends keyof CourseFilterState>(key: K, next: CourseFilterState[K]) =>
    onChange({ ...value, [key]: next });
  const regionMenuItems = buildRegionMenuItems(regionOptions);

  return (
    <div className="flex flex-wrap gap-2">
      <FilterDropdown
        label="지역"
        value={value.region}
        onChange={(next) => set("region", next)}
        items={regionMenuItems}
        variant="chip"
        className="w-36"
      />
      <FilterDropdown
        label="거리"
        value={value.distance}
        onChange={(next) => set("distance", next)}
        items={DISTANCE_OPTIONS}
        variant="chip"
        className="w-28"
      />
      {showDifficulty && (
        <FilterDropdown
          label="난이도"
          value={value.difficulty}
          onChange={(next) => set("difficulty", next)}
          items={DIFFICULTY_OPTIONS}
          variant="chip"
          className="w-32"
        />
      )}
    </div>
  );
}

export function CourseMobileFilters({ value, onChange, regionOptions }: Props) {
  const set = <K extends keyof CourseFilterState>(key: K, next: CourseFilterState[K]) =>
    onChange({ ...value, [key]: next });
  const regionMenuItems = buildRegionMenuItems(regionOptions);

  return (
    <div className="grid grid-cols-[1.5fr_1fr_1fr] gap-2">
      <FilterDropdown
        label="지역"
        value={value.region}
        onChange={(next) => set("region", next)}
        items={regionMenuItems}
        variant="chip"
        className="min-w-0"
      />
      <FilterDropdown
        label="거리"
        value={value.distance}
        onChange={(next) => set("distance", next)}
        items={DISTANCE_OPTIONS}
        variant="chip"
        className="min-w-0"
      />
      {/* 3열 중 오른쪽 끝 — 메뉴가 칸보다 넓어 왼쪽 정렬이면 화면 밖으로 넘친다. */}
      <FilterDropdown
        label="정렬"
        value={value.sort}
        onChange={(next) => set("sort", next)}
        items={SORT_OPTIONS}
        variant="chip"
        align="end"
        className="min-w-0"
      />
    </div>
  );
}

export function CourseSortFilter({ value, onChange }: Pick<Props, "value" | "onChange">) {
  return (
    <FilterDropdown
      label="정렬"
      value={value.sort}
      onChange={(next) => onChange({ ...value, sort: next })}
      items={SORT_OPTIONS}
      variant="inline"
      align="end"
    />
  );
}
