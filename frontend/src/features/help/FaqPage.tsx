import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import DocumentPage from "../../components/layout/DocumentPage";
import { ErrorNotice } from "../../components/error/ErrorNotice";
import { toUserError, type UserError } from "../../components/error/userError";
import { HelpMarkdown } from "./components/HelpMarkdown";
import { fetchFaqs } from "./helpApi";
import { groupFaqs } from "./helpFormat";
import type { Faq } from "./types";

/** 몇 번째 요청(재시도 횟수)까지 받아왔는지. 로딩 여부는 이 값에서 파생한다. */
type Loaded = { key: number; faqs: Faq[] | null; error: UserError | null };

export default function FaqPage() {
  const [retryCount, setRetryCount] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let ignore = false;
    fetchFaqs()
      .then((faqs) => {
        if (!ignore) setLoaded({ key: retryCount, faqs, error: null });
      })
      .catch((e: unknown) => {
        if (!ignore) {
          setLoaded({ key: retryCount, faqs: null, error: toUserError(e, "자주 묻는 질문을 불러오지 못했어요") });
        }
      });
    return () => {
      ignore = true;
    };
  }, [retryCount]);

  const current = loaded?.key === retryCount ? loaded : null;

  const renderBody = () => {
    if (!current) {
      return <p className="py-16 text-center text-[14px] text-caption">자주 묻는 질문을 불러오는 중…</p>;
    }
    if (current.error || !current.faqs) {
      const error = current.error ?? toUserError(null, "자주 묻는 질문을 불러오지 못했어요");
      return (
        <ErrorNotice
          title={error.title}
          description={error.description}
          onRetry={() => setRetryCount((n) => n + 1)}
        />
      );
    }
    if (current.faqs.length === 0) {
      return <p className="py-16 text-center text-[14px] text-caption">등록된 질문이 없어요.</p>;
    }

    return (
      <div className="mt-6 flex flex-col gap-8 md:mt-8">
        {groupFaqs(current.faqs).map((group, i) => (
          <section key={group.category} aria-labelledby={`faq-category-${i}`}>
            <h2 id={`faq-category-${i}`} className="text-[18px] font-bold text-ink">
              {group.category}
            </h2>
            <ul className="mt-3 border-t border-divider">
              {group.items.map((faq) => (
                <li key={faq.id} className="border-b border-divider">
                  {/* 푸터의 접기와 같은 details를 쓴다. 열림 상태가 DOM에 있어 따로 상태를 들지 않아도 되고,
                    키보드·스크린 리더에서 펼치기가 기본으로 동작한다. */}
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-start gap-3 py-3 text-[15px] text-ink [&::-webkit-details-marker]:hidden">
                      {/* Q·A는 눈으로 질문과 답변을 나누는 표시라 스크린 리더에는 읽히지 않게 한다. */}
                      <span aria-hidden="true" className="w-4 shrink-0 font-bold text-accent">
                        Q
                      </span>
                      <span className="min-w-0 flex-1 break-keep font-medium">{faq.question}</span>
                      <ChevronDown
                        size={18}
                        aria-hidden="true"
                        className="mt-0.5 shrink-0 text-caption transition-transform group-open:rotate-180"
                      />
                    </summary>
                    {/* 답변 본문에도 굵은 글씨가 들어가서 질문을 굵게만 하면 답변 속 강조와 구분되지 않는다.
                      그래서 Q·A 표시로 나누고, 답변 글자가 질문 글자와 같은 위치에서 시작하게 맞춘다. */}
                    <div className="flex gap-3 pb-4 text-[14px] leading-relaxed">
                      <span aria-hidden="true" className="w-4 shrink-0 font-bold text-caption">
                        A
                      </span>
                      <HelpMarkdown source={faq.answer} className="min-w-0 flex-1 text-ink/80" />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  };

  return (
    <DocumentPage title="자주 묻는 질문" back={{ to: "/help", label: "고객지원" }}>
      {renderBody()}
    </DocumentPage>
  );
}
