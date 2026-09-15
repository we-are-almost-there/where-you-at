import { Fragment } from "react";
import { Link } from "react-router";
import { parseMarkdown, type Inline } from "../markdown";

interface Props {
  /** 제한된 마크다운 본문 (markdown.ts 참고) */
  source: string;
  /** 글자 크기·색은 쓰는 쪽에서 정한다. 공지 상세와 FAQ 답변의 크기가 다르다. */
  className?: string;
}

const LINK_CLASS =
  "font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-current";

// parseMarkdown 결과를 React 요소로만 그린다. dangerouslySetInnerHTML을 쓰지 않으므로
// 본문에 HTML이 섞여 있어도 태그가 아니라 글자로 보인다.
export function HelpMarkdown({ source, className = "" }: Props) {
  const blocks = parseMarkdown(source);

  return (
    <div className={`flex flex-col gap-3 leading-relaxed ${className}`}>
      {blocks.map((block, i) =>
        block.type === "list" ? (
          <ul key={i} className="flex list-disc flex-col gap-1.5 pl-5 marker:text-caption">
            {block.items.map((item, j) => (
              <li key={j}>
                <Inlines inlines={item.inlines} />
                {item.children.length > 0 && (
                  // 하위 항목은 속이 빈 원으로 구분한다.
                  <ul className="mt-1 flex list-[circle] flex-col gap-1 pl-5">
                    {item.children.map((child, k) => (
                      <li key={k}>
                        <Inlines inlines={child} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className="break-keep">
            <Inlines inlines={block.inlines} />
          </p>
        ),
      )}
    </div>
  );
}

function Inlines({ inlines }: { inlines: Inline[] }) {
  return (
    <>
      {inlines.map((inline, i) => {
        if (inline.type === "bold") {
          return (
            <strong key={i} className="font-semibold text-ink">
              {inline.text}
            </strong>
          );
        }
        if (inline.type === "link") {
          return <MarkdownLink key={i} href={inline.href} text={inline.text} />;
        }
        return <Fragment key={i}>{inline.text}</Fragment>;
      })}
    </>
  );
}

function MarkdownLink({ href, text }: { href: string; text: string }) {
  // 사이트 안 경로는 새로고침 없이 이동한다.
  if (href.startsWith("/")) {
    return (
      <Link to={href} className={LINK_CLASS}>
        {text}
      </Link>
    );
  }
  // 바깥 주소는 보던 공지를 잃지 않게 새 탭으로 연다. 메일 링크는 탭을 열 필요가 없다.
  const opensTab = !href.startsWith("mailto:");
  return (
    <a
      href={href}
      className={LINK_CLASS}
      {...(opensTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {text}
    </a>
  );
}
