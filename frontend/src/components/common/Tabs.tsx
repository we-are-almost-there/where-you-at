import { useRef, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { tabId, tabPanelId } from "./tabIds";

export interface TabItem<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  /** 탭·패널 id의 앞부분. 한 화면에 탭 묶음이 여럿이면 서로 달라야 한다. */
  idBase: string;
  /** 탭 묶음의 이름(화면낭독기용). */
  label: string;
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  tabClassName: (active: boolean) => string;
  renderLabel?: (item: TabItem<T>, active: boolean) => ReactNode;
  /** 특정 탭 버튼의 ref가 필요할 때(예: 모달을 닫은 뒤 그 탭으로 초점 복귀). */
  tabRefs?: Partial<Record<T, Ref<HTMLButtonElement>>>;
}

/**
 * WAI-ARIA 탭 패턴.
 * - Tab 키로는 선택된 탭 하나에만 들어온다(나머지는 tabIndex -1).
 * - 좌우 방향키·Home·End로 탭 사이를 옮기며, 옮기는 즉시 선택한다(자동 활성화).
 *   탭을 바꾸는 비용이 목록 재조회 정도라 따로 Enter를 누르게 할 이유가 없다.
 * - 패널은 쓰는 쪽이 tabPanelProps()로 연결한다. 탭마다 패널을 따로 두지 않고
 *   내용만 바뀌는 패널 하나를 공유하므로 모든 탭이 같은 패널을 가리킨다.
 */
export function Tabs<T extends string>({
  idBase,
  label,
  items,
  value,
  onChange,
  className,
  tabClassName,
  renderLabel,
  tabRefs,
}: Props<T>) {
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % items.length
        : event.key === "ArrowLeft"
          ? (index - 1 + items.length) % items.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    buttonsRef.current[next]?.focus();
    if (items[next].value !== value) onChange(items[next].value);
  };

  return (
    <div role="tablist" aria-label={label} className={className}>
      {items.map((item, index) => {
        const active = item.value === value;
        const externalRef = tabRefs?.[item.value];
        return (
          <button
            key={item.value}
            ref={(el) => {
              buttonsRef.current[index] = el;
              if (typeof externalRef === "function") externalRef(el);
              else if (externalRef) externalRef.current = el;
            }}
            type="button"
            role="tab"
            id={tabId(idBase, index)}
            aria-selected={active}
            aria-controls={tabPanelId(idBase)}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={tabClassName(active)}
          >
            {renderLabel ? renderLabel(item, active) : item.label}
          </button>
        );
      })}
    </div>
  );
}
