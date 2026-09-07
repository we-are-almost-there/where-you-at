import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router";

// 공공데이터 출처. 항목명과 제공처를 나눠 dl로 그린다.
const PUBLIC_DATA: [label: string, source: string][] = [
  ["걷기여행길 코스와 경로", "한국관광공사 두루누비 정보 서비스"],
  ["자전거길 노선", "행정안전부 자전거길 DB"],
  ["관광 정보와 대회 행사", "한국관광공사 국문 관광정보 서비스"],
  ["자전거 대여소", "전국자전거대여소표준데이터"],
  [
    "실시간 대여 가능 수",
    "행정안전부 한국지역정보개발원_(전국 통합데이터) 전국 공영자전거 실시간 정보",
  ],
];

const OTHER_SOURCES: [label: string, source: string][] = [
  ["지도", "카카오맵"],
  ["자전거 경로 계산", "OSRM, © OpenStreetMap contributors"],
];

// 바깥 그리드(grid-cols-[auto_1fr])의 열을 subgrid로 물려받는다. 공공데이터 목록과
// 그 외 목록이 사이에 문단을 두고 떨어져 있어도 라벨 열 폭이 하나로 맞는다.
// 라벨 열은 가장 긴 항목명에 맞고(auto) 제공처는 남는 폭을 쓰며(1fr), 폭이 모자라면
// 제공처만 자기 열 안에서 줄바꿈돼 정렬은 유지된다.
function SourceList({ items }: { items: [string, string][] }) {
  return (
    <dl className="col-span-2 mt-2 grid grid-cols-subgrid gap-y-1">
      {items.map(([label, source]) => (
        <Fragment key={label}>
          <dt>{label}</dt>
          <dd>{source}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

export default function Footer() {
  // 위치 안내와 데이터 출처는 좁은 화면에서만 접는다. details는 열림 상태가 DOM에
  // 있어서 md 이상에서 강제로 펼치려면 CSS만으로는 안 되고(닫힌 details의 내용은
  // UA가 슬롯 단위로 감춘다) open을 직접 넘겨야 한다.
  const [isOpen, setIsOpen] = useState(
    () => window.matchMedia("(min-width: 768px)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsOpen(query.matches);
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // mt-auto: 홈처럼 부모가 flex 세로 컬럼(min-h-dvh)이면 내용이 짧아도 바닥에 붙는다.
  // 부모가 flex가 아닌 페이지에서는 auto 마진이 0으로 계산돼 아무 영향이 없다.
  return (
    <footer className="mt-auto border-t border-divider bg-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 md:py-10">
        <div className="flex items-baseline justify-between gap-4">
          <Link to="/" className="font-bold tracking-tight text-ink text-[17px]">
            어디까지왔니
          </Link>
          {/* 회색 고지문 사이에 같은 회색으로 놓이면 링크로 안 읽혀서 밑줄을 남긴다. */}
          <Link
            to="/help"
            className="text-[13px] text-caption underline decoration-caption/40 underline-offset-4 transition-colors hover:text-ink hover:decoration-current"
          >
            고객지원
          </Link>
        </div>

        {/* 볼드 한 줄만 행동 지침이고 아래 두 문장은 둘 다 면책이다. 앞의 두 줄을 br로
          붙이면 내용 묶음(1+2)과 시각 묶음(2+1)이 어긋나 간격이 들쭉날쭉해진다.
          세 줄을 같은 간격으로 두고 강조는 볼드로만 준다. */}
        <div className="mt-6 flex flex-col gap-3 text-[13px] leading-relaxed text-caption">
          {/* footer 본문은 전부 caption 한 톤으로 가라앉히고, 이 줄만 ink로 남긴다.
            여기서 유일하게 현실에서 사고로 이어질 수 있는 문장이라 읽히지 않으면 안 된다. */}
          <p className="font-semibold text-ink">
            이동 중에는 화면을 보지 말고 주변을 살펴 주세요.
          </p>
          <p>코스 이용 중 발생한 사고에 대해 서비스는 책임지지 않습니다.</p>
          <p>
            코스와 대회, 방문 혜택 정보는 공공데이터를 받아 그대로 제공하므로 실제와 다를 수
            있습니다. 방문이나 참가 전에 주최 기관이나 해당 지자체에 다시 확인해 주세요.
          </p>
        </div>

        <details
          open={isOpen}
          onToggle={(e) => setIsOpen(e.currentTarget.open)}
          className="mt-5"
        >
          <summary className="cursor-pointer list-none text-[13px] text-caption underline decoration-caption/40 underline-offset-4 md:hidden">
            위치 정보 안내와 데이터 출처 {isOpen ? "접기" : "보기"}
          </summary>

          <div className="text-[13px] leading-relaxed text-caption">
            <section className="mt-4">
              <h2 className="font-semibold">위치 정보 안내</h2>
              <p className="mt-2">
                현재 위치는 가까운 코스를 찾는 데에만 사용하며, 별도로 저장하거나 다른 목적으로
                이용하지 않습니다. 위치 제공을 원하지 않으면 브라우저 설정에서 거부할 수 있고, 이
                경우 기본 코스 목록이 표시됩니다.
              </p>
            </section>

            <section className="mt-5 grid grid-cols-[auto_1fr] gap-x-5">
              <h2 className="col-span-2 font-semibold">데이터 출처</h2>
              <p className="col-span-2 mt-2">
                이 서비스는 공공데이터포털에서 제공하는 다음 공공데이터를 이용합니다.
              </p>
              <SourceList items={PUBLIC_DATA} />
              <p className="col-span-2 mt-3">
                코스와 관광지 사진은 한국관광공사가 제공하며, 사진마다 공공누리 이용조건이 다를 수
                있습니다. 걷기여행길의 자전거 경로는 두루누비 코스를 바탕으로 OSRM으로 다시 계산해
                저장한 것입니다.
              </p>
              {/* 방문 혜택은 공공데이터포털 API가 아니라 제도 안내를 직접 정리해
                sql/03_support_seed.sql에 넣은 것이라 위 목록에 넣으면 사실과 다르다. */}
              <p className="col-span-2 mt-3">
                방문 혜택 정보는 문화체육관광부와 한국관광공사가 안내하는 제도 내용을 정리한
                것입니다.
              </p>
              <SourceList items={OTHER_SOURCES} />
            </section>
          </div>
        </details>

        <div className="mt-8 border-t border-divider pt-5 text-[12px] leading-relaxed text-caption">
          {/* 공고문은 ㆍ(U+318D, 한글 낱자 아래아)를 쓰지만 폭이 가운뎃점의 3배가 넘어
            띄어쓴 것처럼 보이고 스크린 리더도 "아래아"로 읽는다. 명칭은 그대로 두고
            문자만 가운뎃점(U+00B7)으로 쓴다. */}
          <p>2026 관광데이터 활용 공모전(웹·앱 개발 부문) 출품작</p>
          <p>Copyright © 2026 거의 다왔어</p>
        </div>
      </div>
    </footer>
  );
}
