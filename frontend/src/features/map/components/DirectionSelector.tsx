import type { Direction } from "../courseProgress";
import type { EndpointAddress } from "../endpointAddress";

// 지도 마커와 같은 색을 써서 "어느 지점에서 출발하는지"를 색으로 바로 읽히게 한다.
const START_COLOR = "var(--color-start)";
const END_COLOR = "#FF4D4F"; // 도착 전용 토큰이 없어 KakaoMap 마커와 같은 값 사용

// 2줄: 위=시도+시군구(작게), 아래=읍면동+번지(굵게). 캡션이 없으면(기본 라벨) 한 줄만 쓴다.
//
// truncate(말줄임) 대신 break-keep으로 줄바꿈을 허용한다 — 시군구를 캡션으로 올려
// 굵은 줄이 대부분 짧아졌지만, "구산면 마전리 111-7"처럼 여전히 길어질 수 있는
// 조합이 남아 있다. 말줄임으로 자르면 정확히 필요한 번지 정보가 잘려나가므로,
// 카드 높이가 조금 늘어나는 쪽을 택한다.
// 색 점만으로는 색을 구분하기 어려운 사용자나 화면낭독기가 출발·도착을 알 수 없어,
// "출발"/"도착" 글자를 dt로 함께 둔다.
function Endpoint({ color, label, address }: { color: string; label: string; address: EndpointAddress }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <dt className="w-7 shrink-0 text-[12px] font-bold text-caption">{label}</dt>
      <dd className="min-w-0">
        {address.caption && (
          <span className="block break-keep text-[11px] leading-[1.3] text-caption">{address.caption}</span>
        )}
        <span className="block break-keep text-[14px] font-bold leading-[1.3] text-ink">{address.main}</span>
      </dd>
    </div>
  );
}

/**
 * 코스를 어느 방향으로 걸을지 고르는 컨트롤.
 * 지도 앱 길찾기의 출발/도착 스와프처럼 위=출발 아래=도착으로 두고,
 * 오른쪽 버튼으로 뒤집는다(도착지에서 거꾸로 걷는 경우).
 *
 * start/end는 GPX 기준(첫 지점 / 마지막 지점) 주소라 역방향일 때는
 * 이 컴포넌트가 표시 순서를 바꾼다.
 */
export function DirectionSelector({
  start,
  end,
  direction,
  onToggle,
}: {
  start: EndpointAddress;
  end: EndpointAddress;
  direction: Direction;
  onToggle: () => void;
}) {
  const forward = direction === "forward";
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-bold text-caption">진행 방향</p>
      <div className="flex items-center gap-3 rounded-[14px] border border-divider bg-white px-4 py-2.5">
        <dl className="flex min-w-0 flex-1 flex-col">
          <Endpoint color={START_COLOR} label="출발" address={forward ? start : end} />
          <div aria-hidden="true" className="my-2 h-px bg-divider" />
          <Endpoint color={END_COLOR} label="도착" address={forward ? end : start} />
        </dl>
        <button
          type="button"
          onClick={onToggle}
          aria-label="출발점과 도착점 바꾸기"
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-lavender text-[17px] font-bold text-accent"
        >
          ⇅
        </button>
      </div>
    </div>
  );
}
