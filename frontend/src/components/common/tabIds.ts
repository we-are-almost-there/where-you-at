// 탭 값은 "운영 정보"처럼 공백이 들어갈 수 있어 id에는 순번을 쓴다.
export const tabId = (idBase: string, index: number) => `${idBase}-tab-${index}`;
export const tabPanelId = (idBase: string) => `${idBase}-panel`;

/** Tabs와 짝을 이루는 패널에 펼쳐 넣을 속성. 지금 선택된 탭의 순번을 넘긴다. */
export function tabPanelProps(idBase: string, activeIndex: number) {
  return {
    id: tabPanelId(idBase),
    role: "tabpanel",
    "aria-labelledby": tabId(idBase, activeIndex),
  } as const;
}
