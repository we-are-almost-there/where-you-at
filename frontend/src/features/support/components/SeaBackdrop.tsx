import seaBg from "../../../assets/sea-bg.webp";
import seaBgMobile from "../../../assets/sea-bg-mobile.webp";

// 이미지가 뜨기 전 잠깐 보이는 색. 두 일러스트 맨 윗줄에서 뽑은 값의 중간쯤이다.
const SKY = "#C4DDFC";

/**
 * 지원금 탭 배경 바다.
 *
 * 뷰포트 전체를 이미지로 꽉 채운다. 상단 일부는 sticky 헤더(불투명 흰색)에 가려지는데,
 * 일러스트 위쪽이 균일한 하늘이라 잘려도 티가 나지 않는다.
 * 헤더 높이에 맞춰 시작점을 잡지 않는 이유는, wide 변형이 md+에서 고객지원 줄만큼
 * 더 높아 고정값(h-14)으로는 어긋나기 때문이다.
 *
 * 자연 높이 그대로 바닥에만 붙이면 위쪽에 단색으로 메운 구간이 생기고,
 * 그 색이 일러스트 상단과 미세하게 달라 시작선이 가로줄로 보인다. 그래서 object-cover.
 *
 * 화면 폭에 따라 세로형/가로형 원본을 나눠 쓴다. <picture>라 브라우저가
 * 조건에 맞는 한 장만 내려받는다.
 */
export function SeaBackdrop() {
  return (
    <div className="h-full w-full overflow-hidden" style={{ backgroundColor: SKY }}>
      <picture>
        <source media="(max-width: 767px)" srcSet={seaBgMobile} />
        <img
          src={seaBg}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full select-none object-cover"
          draggable={false}
        />
      </picture>
    </div>
  );
}
