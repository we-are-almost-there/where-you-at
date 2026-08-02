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
      <AppHeader />
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