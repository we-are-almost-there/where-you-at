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
