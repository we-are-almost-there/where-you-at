import { useSearchParams } from "react-router";
import { SupportRegionMap } from "./components/SupportRegionMap";
import { SupportRegionView } from "./components/SupportRegionView";
import { SupportDetail } from "./components/SupportDetail";
import AppHeader from "../../components/layout/AppHeader";

export function Support() {
  const [searchParams] = useSearchParams();
  const region = searchParams.get("region");
  const supportId = searchParams.get("support"); // 제도 상세 ID

  return (
    <>
      <AppHeader variant="wide" />
      {/* max-w-6xl(1152px) → 헤더(wide variant, md:px-24)와 리듬 맞춰 max-w-[1200px]로 통일 */}
      <div className="mx-auto w-full max-w-[1200px] px-4 py-4">
        <div className="flex flex-col gap-4 md:flex-row">
          {/* 지도 (제도 상세가 열리면 좁아짐) — 대회 탭의 목록/상세 분할과 동일한 비율 */}
          <div className={`transition-all duration-500 ${region ? "md:w-2/3" : "w-full"}`}>
            <h1 className="font-bold text-ink text-[20px]">지원금·환급</h1>
            <p className="mt-1 text-[13px] text-caption">
              인구감소지역을 여행하면 받을 수 있는 지원 제도를 지역별로 모았어요.
            </p>
            <div className="mt-4">
              <SupportRegionMap />
            </div>
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
