import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { Pin } from "lucide-react";
import DocumentPage from "../../components/layout/DocumentPage";
import { ErrorNotice } from "../../components/error/ErrorNotice";
import { toUserError, type UserError } from "../../components/error/userError";
import { Pagination } from "../map/components/Pagination";
import { fetchNotices } from "./helpApi";
import { formatNoticeDate, parsePage } from "./helpFormat";
import type { NoticeListResponse } from "./types";

const PER_PAGE = 10;

/** 어느 요청(페이지·재시도 횟수)까지 받아왔는지. 로딩 여부는 이 값에서 파생한다. */
type Loaded = { key: string; data: NoticeListResponse | null; error: UserError | null };

export default function NoticeList() {
  // 페이지를 주소(?page=)에 두어, 상세에 들어갔다가 뒤로 와도 보던 페이지가 유지되게 한다.
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePage(searchParams.get("page"));
  const location = useLocation();
  const [retryCount, setRetryCount] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const requestKey = `${page}:${retryCount}`;

  useEffect(() => {
    let ignore = false;
    fetchNotices({ page, perPage: PER_PAGE })
      .then((data) => {
        if (!ignore) setLoaded({ key: requestKey, data, error: null });
      })
      .catch((e: unknown) => {
        if (!ignore) {
          setLoaded({ key: requestKey, data: null, error: toUserError(e, "공지사항을 불러오지 못했어요") });
        }
      });
    return () => {
      ignore = true;
    };
  }, [page, requestKey]);

  const current = loaded?.key === requestKey ? loaded : null;

  const goToPage = (next: number) => {
    setSearchParams(next === 1 ? {} : { page: String(next) });
    window.scrollTo({ top: 0 });
  };

  const renderBody = () => {
    if (!current) {
      return <p className="py-16 text-center text-[14px] text-caption">공지사항을 불러오는 중…</p>;
    }
    if (current.error || !current.data) {
      const error = current.error ?? toUserError(null, "공지사항을 불러오지 못했어요");
      return (
        <ErrorNotice
          title={error.title}
          description={error.description}
          onRetry={() => setRetryCount((n) => n + 1)}
        />
      );
    }

    const { items, total } = current.data;
    if (items.length === 0) {
      // 공지는 있는데 이 페이지가 비었다면 주소의 page가 범위를 벗어난 경우다.
      return total > 0 ? (
        <div className="py-16 text-center">
          <p className="text-[14px] text-caption">이 페이지에는 공지사항이 없어요.</p>
          <Link to="/notices" className="mt-3 inline-block text-[14px] text-accent underline underline-offset-4">
            첫 페이지로
          </Link>
        </div>
      ) : (
        <p className="py-16 text-center text-[14px] text-caption">등록된 공지사항이 없어요.</p>
      );
    }

    return (
      <>
        <ul className="mt-3 flex flex-col md:mt-5">
          {items.map((notice) => (
            <li key={notice.id} className="border-b border-divider last:border-b-0">
              <Link
                to={`/notices/${notice.id}`}
                // 상세의 '목록으로'가 보던 페이지로 돌아오게 지금 주소의 쿼리를 넘긴다.
                state={{ listSearch: location.search }}
                // 줄 여백(py-3)·제목 굵기(medium)·부가 정보 크기(12px)·오른쪽 ›는 대회 목록(RaceList)과 맞춘다.
                className="flex items-center gap-3 py-3"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-start gap-2 text-[15px] text-ink">
                    {notice.is_pinned && (
                      <>
                        {/* mt: 아이콘 높이(16px)를 제목 첫 줄의 가운데에 맞춘다. */}
                        <Pin size={16} fill="currentColor" aria-hidden="true" className="mt-[3px] shrink-0 text-accent" />
                        {/* 아이콘만으로는 스크린 리더가 고정 여부를 알 수 없어 글자를 숨겨 함께 둔다. */}
                        <span className="sr-only">고정</span>
                      </>
                    )}
                    {/* 고정 공지는 제목을 굵게 해 일반 공지와 한 번 더 구분한다. */}
                    <span className={`min-w-0 break-keep ${notice.is_pinned ? "font-bold" : "font-medium"}`}>
                      {notice.title}
                    </span>
                  </span>
                  <time dateTime={notice.published_at} className="text-[12px] text-caption">
                    {formatNoticeDate(notice.published_at)}
                  </time>
                </span>
                <span aria-hidden="true" className="shrink-0 text-[18px] leading-none text-caption">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Pagination page={page} totalPages={Math.ceil(total / PER_PAGE)} onChange={goToPage} />
      </>
    );
  };

  return (
    <DocumentPage title="공지사항" back={{ to: "/help", label: "고객지원" }}>
      {renderBody()}
    </DocumentPage>
  );
}
