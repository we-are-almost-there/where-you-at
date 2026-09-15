// 공지사항·FAQ 본문의 제한된 마크다운을 화면용 구조로 바꾼다.
//
// 허용하는 문법 (backend/sql/01_schema.sql 고객지원 섹션 주석과 같은 규칙).
//   - 문단: 빈 줄로 나눈다. 문단 안의 줄바꿈 한 번은 공백으로 이어 붙인다.
//   - 목록: "- "로 시작하는 줄. 두 칸 이상 들여쓴 "- " 줄은 바로 위 항목의 하위 항목이 된다.
//     하위 항목은 한 단계까지만 두고, 더 깊게 들여써도 같은 단계로 본다.
//   - 굵게: **글자**
//   - 링크: [글자](주소). 주소가 http(s)·mailto·사이트 내부 경로(/...)일 때만 링크로 만든다.
// 그 밖의 문법(제목, 표, 이미지, HTML 등)은 해석하지 않고 글자 그대로 둔다.
//
// 라이브러리(react-markdown 등)를 쓰지 않은 이유: 허용 요소가 몇 개뿐이라 파서가 짧고,
// 결과를 React 요소로만 그리니 HTML이 주입될 경로가 아예 없다. 허용 문법을 더 늘려야 하면
// 그때 라이브러리로 바꾸는 편이 낫다.

export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "link"; text: string; href: string };

export interface ListItem {
  inlines: Inline[];
  /** 하위 항목. 한 단계까지만 둔다. */
  children: Inline[][];
}

export type Block =
  | { type: "paragraph"; inlines: Inline[] }
  | { type: "list"; items: ListItem[] };

const LIST_MARKER = /^- /;
// 이만큼 이상 들여쓰면 하위 항목. 마크다운에서 "- " 뒤 글자가 시작하는 칸(2칸)과 같다.
const CHILD_INDENT = 2;
// 굵게와 링크를 한 번에 찾는다. 먼저 시작하는 쪽이 이기므로 링크 글자 안의 **는 굵게가 되지 않는다.
const INLINE_TOKEN = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** 링크로 만들어도 되는 주소인지. javascript: 같은 스킴과 //로 시작하는 외부 경로는 막는다. */
export function isSafeHref(href: string): boolean {
  if (href.startsWith("/")) return !href.startsWith("//");
  return /^(https?:\/\/|mailto:)/i.test(href);
}

export function parseInlines(text: string): Inline[] {
  const inlines: Inline[] = [];
  let last = 0;

  for (const match of text.matchAll(INLINE_TOKEN)) {
    const index = match.index ?? 0;
    const [whole, bold, linkText, href] = match;
    if (index > last) inlines.push({ type: "text", text: text.slice(last, index) });

    if (bold !== undefined) {
      inlines.push({ type: "bold", text: bold });
    } else if (isSafeHref(href)) {
      inlines.push({ type: "link", text: linkText, href });
    } else {
      // 허용하지 않는 주소는 링크를 만들지 않고 글자만 남긴다.
      inlines.push({ type: "text", text: linkText });
    }
    last = index + whole.length;
  }

  if (last < text.length) inlines.push({ type: "text", text: text.slice(last) });
  return inlines;
}

/** 줄 앞 들여쓰기 칸 수. 탭은 두 칸으로 센다. */
function indentOf(line: string): number {
  const leading = line.match(/^[ \t]*/)?.[0] ?? "";
  return leading.replace(/\t/g, "  ").length;
}

function parseListItems(lines: string[]): ListItem[] {
  const items: ListItem[] = [];
  for (const line of lines) {
    const inlines = parseInlines(line.trimStart().slice(2).trim());
    const parent = items[items.length - 1];
    // 목록 첫 줄이 들여써져 있으면 매달 상위 항목이 없으니 상위 항목으로 둔다.
    if (indentOf(line) >= CHILD_INDENT && parent) {
      parent.children.push(inlines);
    } else {
      items.push({ inlines, children: [] });
    }
  }
  return items;
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const chunks = source.replace(/\r\n?/g, "\n").split(/\n[ \t]*\n/);

  for (const chunk of chunks) {
    // 하위 목록을 알아보려면 들여쓰기가 필요해서, 빈 줄만 거르고 앞 공백은 남겨 둔다.
    const lines = chunk.split("\n").filter((line) => line.trim() !== "");
    const isListLine = (line: string) => LIST_MARKER.test(line.trimStart());

    // 문단 바로 아래에 빈 줄 없이 목록을 쓰는 실수가 흔해서, 한 덩어리 안에서도
    // 목록 줄과 일반 줄이 바뀌는 곳마다 블록을 나눈다.
    let start = 0;
    while (start < lines.length) {
      const isList = isListLine(lines[start]);
      let end = start;
      while (end < lines.length && isListLine(lines[end]) === isList) end++;
      const run = lines.slice(start, end);

      if (isList) {
        blocks.push({ type: "list", items: parseListItems(run) });
      } else {
        blocks.push({ type: "paragraph", inlines: parseInlines(run.map((line) => line.trim()).join(" ")) });
      }
      start = end;
    }
  }

  return blocks;
}
