import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { Pin } from "lucide-react";
import DocumentPage from "../../components/layout/DocumentPage";
import { ErrorNotice } from "../../components/error/ErrorNotice";
import { toUserError, type UserError } from "../../components/error/userError";
import { HttpError } from "../../lib/http";
import { HelpMarkdown } from "./components/HelpMarkdown";
import { fetchNotice } from "./helpApi";
import { formatNoticeDate, parseNoticeId } from "./helpFormat";
import type { NoticeDetail as NoticeDetailData } from "./types";

/** 어느 요청(id·재시도 횟수)까지 받아왔는지. 로딩 여부는 이 값에서 파생한다. */
type Loaded =
  | { key: string; status: "ok"; notice: NoticeDetailData }
  | { key: string; status: "notFound" }
  | { key: string; status: "error"; error: UserError };

const NOT_FOUND: UserError = {
  title: "공지사항을 찾을 수 없어요",
  description: "삭제되었거나 주소가 잘못되었어요.\n목록에서 다시 선택해 주세요.",
};

/** 목록에서 넘겨준 쿼리(?page=2 등). 주소를 직접 열었거나 형식이 다르면 빈 문자열. */
function readListSearch(state: unknown): string {
  if (typeof state !== "object" || state === null || !("listSearch" in state)) return "";
  const { listSearch } = state;
  return typeof listSearch === "string" && listSearch.startsWith("?") ? listSearch : "";
}

export default function NoticeDetail() {
  const { id } = useParams();
  const noticeId = parseNoticeId(id);
  const location = useLocation();
  const navigate = useNavigate();
  const listPath = `/notices${readListSearch(location.state)}`;
  const [retryCount, setRetryCount] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const requestKey = `${noticeId}:${retryCount}`;

  useEffect(() => {
    // 형식이 맞지 않는 id는 서버에 물어볼 필요 없이 없는 공지로 본다.
    if (noticeId === null) return;
    let ignore = false;
    fetchNotice(noticeId)
      .then((notice) => {
        if (!ignore) setLoaded({ key: requestKey, status: "ok", notice });
      })
      .catch((e: unknown) => {
        if (ignore) return;
        // 비공개·예약 공지도 서버가 404를 준다. 이용자에게는 없는 공지와 같다.
        if (e instanceof HttpError && e.status === 404) {
          setLoaded({ key: requestKey, status: "notFound" });
        } else {
          setLoaded({ key: requestKey, status: "error", error: toUserError(e, "공지사항을 불러오지 못했어요") });
        }
      });
    return () => {
      ignore = true;
    };
  }, [noticeId, requestKey]);

  const current = loaded?.key === requestKey ? loaded : null;
  const backToList = () => navigate(listPath);

  const renderBody = () => {
    if (noticeId === null || current?.status === "notFound") {
      return <ErrorNotice title={NOT_FOUND.title} description={NOT_FOUND.description} onBack={backToList} />;
    }
    if (!current) {
      return <p role="status" className="py-16 text-center text-[14px] text-caption">공지사항을 불러오는 중…</p>;
    }
    if (current.status === "error") {
      return (
        <ErrorNotice
          title={current.error.title}
          description={current.error.description}
          onRetry={() => setRetryCount((n) => n + 1)}
          onBack={backToList}
        />
      );
    }

    const { notice } = current;
    return (
      <article className="mt-6 md:mt-8">
        <header className="border-b border-divider pb-5">
          {/* 목록과 같은 압정 표시. 제목(h2) 밖에 두어 제목의 접근성 이름에 섞이지 않게 한다. */}
          <div className="flex items-start gap-2">
            {notice.is_pinned && (
              <>
                <Pin
                  size={18}
                  fill="currentColor"
                  aria-hidden="true"
                  className="mt-[3px] shrink-0 text-accent"
                />
                <span className="sr-only">고정</span>
              </>
            )}
            <h2 className="break-keep text-[18px] font-bold leading-snug text-ink">
              {notice.title}
            </h2>
          </div>
          <time dateTime={notice.published_at} className="mt-2 block text-[13px] text-caption">
            {formatNoticeDate(notice.published_at)}
          </time>
        </header>

        <HelpMarkdown source={notice.content} className="mt-6 text-[15px] text-ink" />

        {/* 에러 화면(ErrorNotice)의 "목록으로" 버튼과 같은 크기·모양으로 맞춘다. */}
        <div className="mt-12 flex justify-center">
          <Link
            to={listPath}
            className="flex h-12 w-full max-w-[320px] items-center justify-center rounded-xl border border-divider text-[15px] text-ink"
          >
            목록으로
          </Link>
        </div>
      </article>
    );
  };

  // 상세의 한 단계 위는 공지 목록이다. 목록에서 다시 고객지원으로 갈 수 있다.
  return (
    <DocumentPage
      title="공지사항"
      documentTitle={current?.status === "ok" ? `${current.notice.title} - 공지사항` : "공지사항"}
      back={{ to: listPath, label: "공지사항" }}
    >
      {renderBody()}
    </DocumentPage>
  );
}
