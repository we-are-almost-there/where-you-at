import type { MouseEvent, ReactNode } from "react";

/*
 * 이용약관·개인정보처리방침처럼 조항이 이어지는 문서의 공통 조각.
 * 목차 → 번호 붙은 조항 구조와 글자 크기·간격을 두 문서가 같게 쓴다.
 */

export interface LegalSectionInfo {
  id: string;
  /** 목차와 조항 제목에 똑같이 쓰는 이름. 예: "1. 개인정보의 처리 목적", "제1조(목적)" */
  label: string;
}

/** 팀이 채워야 하는 자리. 화면에서도 눈에 띄게 표시해 채우지 않은 채 배포되지 않게 한다. */
export function Todo({ children }: { children: ReactNode }) {
  return <mark className="rounded bg-lavender px-1 text-accent">[확인 필요: {children}]</mark>;
}

export function P({ children }: { children: ReactNode }) {
  return <p className="mt-3 break-keep text-[14px] leading-relaxed text-ink">{children}</p>;
}

export function SubTitle({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-[14px] font-bold text-ink">{children}</p>;
}

export function Items({ ordered = false, children }: { ordered?: boolean; children: ReactNode }) {
  const className = `mt-2 flex flex-col gap-1.5 break-keep pl-5 text-[14px] leading-relaxed text-ink ${
    ordered ? "list-decimal" : "list-disc"
  }`;
  return ordered ? <ol className={className}>{children}</ol> : <ul className={className}>{children}</ul>;
}

/** 항목이 많은 표. 좁은 화면에서는 표 안에서만 가로로 스크롤한다. */
export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-left text-[13px] leading-relaxed">
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell} scope="col" className="border-y border-divider bg-lavender px-3 py-2 font-bold text-ink">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="break-keep border-b border-divider px-3 py-2 align-top text-ink">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 목차. 누르면 해당 조항으로 이동한다.
 * 주소에 #이 붙지 않게 막고(팝업 안에서도 쓰므로) 가장 가까운 스크롤 영역(페이지는 문서, 팝업은 본문)을 움직인다.
 * 제목으로 포커스도 옮겨서 키보드·스크린 리더 사용자가 이동한 자리에서 이어 읽게 한다.
 */
export function LegalToc({ label, sections }: { label: string; sections: readonly LegalSectionInfo[] }) {
  const jumpTo = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    const target = document.getElementById(id);
    target?.scrollIntoView?.({ block: "start" });
    target?.focus({ preventScroll: true });
  };

  return (
    <nav aria-label={label} className="mt-6 rounded-lg bg-lavender px-4 py-4">
      <p className="text-[13px] font-bold text-ink">목차</p>
      <ol className="mt-2 flex flex-col gap-1 text-[13px] leading-relaxed">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              onClick={(event) => jumpTo(event, section.id)}
              className="text-ink underline-offset-4 hover:underline"
            >
              {section.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** 조항 하나. 제목은 목차와 같은 label을 쓴다. */
export function LegalSection({
  section,
  level = 2,
  children,
}: {
  section: LegalSectionInfo;
  /** 페이지는 h1 아래라 2, 팝업은 팝업 제목(h2) 아래라 3 */
  level?: 2 | 3;
  children: ReactNode;
}) {
  const Heading = level === 3 ? "h3" : "h2";
  return (
    <section aria-labelledby={section.id} className="mt-8">
      {/* 목차로 이동했을 때 제목 위 여백. 페이지(h2)는 위에 붙어 있는 상단바(76px)에 가리지 않게 80px,
        팝업(h3)은 상단바 없이 본문만 스크롤되므로 16px만 둔다. */}
      <Heading
        id={section.id}
        tabIndex={-1}
        className={`${level === 2 ? "scroll-mt-20" : "scroll-mt-4"} text-[16px] font-bold text-ink focus:outline-none`}
      >
        {section.label}
      </Heading>
      {children}
    </section>
  );
}
