import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { SupportRegionMap } from "./components/SupportRegionMap";
import { SupportRegionView } from "./components/SupportRegionView";
import { SupportDetail } from "./components/SupportDetail";
import AppHeader from "../../components/layout/AppHeader";

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
      {/* 폭은 max-w-6xl(72rem)로 — AppHeader.tsx(wide variant)의 좌우 padding 계산식과
        Home.tsx의 BannerCarousel(banners.tsx)이 쓰는 max-w-6xl 기준을 그대로 따른 것.
        기준이 다르면 페이지를 옮길 때마다 헤더·본문 좌우 끝이 미묘하게 어긋나 보인다
        (콘텐츠 길이에 따른 스크롤 유무 오차는 위 useEffect의 scrollbar-gutter-stable로 처리). */}
      <div className="mx-auto w-full max-w-6xl px-4 py-4">
        <div className="flex flex-col gap-4 md:flex-row">
          <div className={`transition-all duration-500 ${region ? "md:w-2/3" : "w-full"}`}>
            <SupportRegionMap />
          </div>

          {region && (
            <div className="md:w-1/3">
              {supportId ? (
                <SupportDetail id={Number(supportId)} />
              ) : (
                <SupportRegionView regionCode={region} />
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
