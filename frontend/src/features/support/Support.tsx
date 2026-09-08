import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { SupportRegionMap } from "./components/SupportRegionMap";
import { SupportRegionView } from "./components/SupportRegionView";
import { SupportDetail } from "./components/SupportDetail";
import { SeaBackdrop } from "./components/SeaBackdrop";
import AppHeader from "../../components/layout/AppHeader";
import Footer from "../../components/layout/Footer";

export function Support() {
  const [searchParams] = useSearchParams();
  const region = searchParams.get("region");
  const supportId = searchParams.get("support"); // 제도 상세 ID

  // Race와 동일한 이유 — 콘텐츠 길이에 따라 스크롤 유무가 갈려 이 페이지에서만
  // scrollbar-gutter: stable을 켠다.
  useEffect(() => {
    document.documentElement.classList.add("scrollbar-gutter-stable");
    return () => document.documentElement.classList.remove("scrollbar-gutter-stable");
  }, []);

  return (
    <>
      <AppHeader variant="wide" />
      <div className="relative">
        {/* 바다는 뷰포트에 고정한다. 콘텐츠 높이에 붙이면 지역마다 우측 패널 높이가
            달라질 때 배경이 위아래로 늘었다 줄었다 한다.
            -z-10이라 sticky 헤더(z-50, 불투명 흰색)가 위를 덮는다. */}
        <div className="fixed inset-0 -z-10">
          <SeaBackdrop />
        </div>

        {/* 폭은 max-w-6xl(72rem)로 — AppHeader.tsx(wide variant)의 좌우 padding 계산식과
            Home.tsx의 BannerCarousel(banners.tsx)이 쓰는 max-w-6xl 기준을 그대로 따른 것.
            기준이 다르면 페이지를 옮길 때마다 헤더·본문 좌우 끝이 미묘하게 어긋나 보인다
            (콘텐츠 길이에 따른 스크롤 유무 오차는 위 useEffect의 scrollbar-gutter-stable로 처리).
            z-10은 위의 고정 배경(-z-10) 위로 콘텐츠를 올리기 위한 것. */}
        <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-4">
          {/* 모바일은 패널이 지도 아래로 쌓이므로 간격을 조금 더 준다 (md+는 좌우 배치라 그대로) */}
          <div className="flex flex-col gap-8 md:flex-row md:gap-4">
            {/* 지도 (제도 상세가 열리면 좁아짐) — 대회 탭의 목록/상세 분할과 동일한 비율 */}
            <div className={`transition-all duration-500 ${region ? "md:w-2/3" : "w-full"}`}>
              {/* 바다 위 옅은 하늘색에 글자가 묻혀서, 패널과 같은 유리판을 깔아 대비를 만든다.
                  제목 20px은 '코스 목록'·'대회'와 같은 규격. */}
              <div className="inline-block rounded-lg bg-white/65 px-3 py-2 ring-1 ring-white/70 backdrop-blur-sm">
                <h1 className="font-bold text-ink text-[20px]">지원금·환급</h1>
                <p className="mt-0.5 text-[12px] text-ink/70">
                  인구감소지역 여행 시 받을 수 있는 지원 제도를 모았어요.
                </p>
              </div>
              {/* 지도의 '지역을 선택하세요' 칩이 지도 위에 떠 있으므로, 그 높이(약 34px)만큼만
                  띄우고 지도는 위로 끌어올린다 */}
              <div className="mt-1">
                <SupportRegionMap />
              </div>
            </div>

            {region && (
              <div className="md:w-1/3">
                {/* 지역 목록과 제도 상세가 같은 자리에서 내용만 바뀐다 (오버레이 없음) */}
                <div className="rounded-lg bg-white/55 p-4 shadow-[0px_4px_20px_0px_rgba(31,58,95,0.12)] ring-1 ring-white/60 backdrop-blur-md">
                  {supportId ? (
                    <SupportDetail id={Number(supportId)} />
                  ) : (
                    <SupportRegionView regionCode={region} />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
