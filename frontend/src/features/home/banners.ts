// 홈 캐러셀 배너 목록.
//
// 이미지는 24:9(2400×900)로 만들지만 모바일 배너는 16:10이라 object-cover가
// 좌우를 잘라내고 가운데 60%만 남는다. 그래서 텍스트가 놓일 왼쪽 여백과 피사체는
// 전부 그 가운데 60% 안에 들어와 있어야 하고, 좌우 20%씩은 잘려도 되는 배경만 둔다.
// 다섯 장 모두 생성형 AI로 만든 3D 일러스트다(공공누리 출처표시 대상 아님).
// 실사로 만들지 않은 이유: 배너가 특정 코스·행사로 바로 들어가기 때문에 사진처럼
// 보이면 "가 봤더니 이렇지 않더라"가 된다. 일러스트면 그 오해가 아예 생기지 않는다.

import saltfarm1200 from "../../assets/banners/sinan-saltfarm-1200w.webp";
import saltfarm2400 from "../../assets/banners/sinan-saltfarm-2400w.webp";
import jeju1200 from "../../assets/banners/jeju-olle-festival-1200w.webp";
import jeju2400 from "../../assets/banners/jeju-olle-festival-2400w.webp";
import darangi1200 from "../../assets/banners/namhae-darangi-1200w.webp";
import darangi2400 from "../../assets/banners/namhae-darangi-2400w.webp";
import pass1200 from "../../assets/banners/tourist-pass-1200w.webp";
import pass2400 from "../../assets/banners/tourist-pass-2400w.webp";
import busan1200 from "../../assets/banners/busan-bridge-marathon-1200w.webp";
import busan2400 from "../../assets/banners/busan-bridge-marathon-2400w.webp";

export interface Banner {
  /** 좌상단 칩 — 어느 메뉴로 가는 배너인지 알린다 */
  tag: string;
  /** 헤드라인. \n으로 줄을 나눈다 */
  title: string;
  subtitle: string;
  to: string;
  src: string;
  srcSet: string;
  /** 이미지 로드가 실패했을 때 뒤에 남는 배경. 각 그림의 주조색을 따른다 */
  background: string;
  /** 마지막 노출일("YYYY-MM-DD"). 대회처럼 끝나는 배너에만 쓴다 */
  expiresAt?: string;
}

/**
 * 첫 장은 방문 혜택으로 고정한다. 4초마다 넘어가고 LCP도 첫 장에 걸려 있어
 * 대부분의 사용자가 실제로 보는 건 1번 한 장뿐인데, 코스는 두루누비 공공데이터라
 * 다른 걷기 서비스에도 다 있다. 우리만 있는 걸 첫 자리에 둔다.
 *
 * 나머지는 배경색이 서로 붙지 않게 짰다(민트 → 복숭아 → 하늘파랑 → 올리브 → 남색).
 * 마지막에서 첫 장으로 되돌아갈 때도 색이 겹치지 않는다.
 */
const ALL_BANNERS: Banner[] = [
  {
    tag: "방문 혜택",
    title: "인구감소지역 여행할 땐\n현장에서 최대 50% 할인",
    subtitle: "52개 지역에서 쓰는 무료 모바일 패스",
    to: "/support",
    src: pass2400,
    srcSet: `${pass1200} 1200w, ${pass2400} 2400w`,
    background: "bg-[linear-gradient(135deg,#0e4a52_0%,#1c8f96_55%,#6fcfd0_100%)]",
  },
  {
    tag: "숨은 코스",
    title: "노을 지는 소금밭 따라\n증도 15km 걸어보기",
    subtitle: "서해랑길 27코스에서 만나는 슬로시티 증도",
    to: "/courses/150",
    src: saltfarm2400,
    srcSet: `${saltfarm1200} 1200w, ${saltfarm2400} 2400w`,
    background: "bg-[linear-gradient(135deg,#f59a72_0%,#fda883_55%,#ffbd9c_100%)]",
  },
  {
    tag: "대회 행사",
    title: "억새 흔들리는 제주 바닷길\n올레걷기축제 함께 걷기",
    subtitle: "11월 5일부터 사흘간 조천만세동산에서",
    to: "/races",
    src: jeju2400,
    srcSet: `${jeju1200} 1200w, ${jeju2400} 2400w`,
    background: "bg-[linear-gradient(135deg,#89c0fc_0%,#9bb6fd_55%,#a8b2fe_100%)]",
    expiresAt: "2026-11-07",
  },
  {
    tag: "숨은 코스",
    title: "바다로 쏟아지는 계단논\n남해 14km 걸어보기",
    subtitle: "남파랑길 43코스에서 만나는 가천 다랭이마을",
    to: "/courses/41",
    src: darangi2400,
    srcSet: `${darangi1200} 1200w, ${darangi2400} 2400w`,
    background: "bg-[linear-gradient(135deg,#9f8e3e_0%,#a79444_55%,#d7b35d_100%)]",
  },
  {
    tag: "대회 행사",
    title: "다리 위를 달리는 겨울 부산\n브릿지마라톤 함께 뛰기",
    subtitle: "12월 6일 벡스코에서 출발",
    to: "/races",
    src: busan2400,
    srcSet: `${busan1200} 1200w, ${busan2400} 2400w`,
    background: "bg-[linear-gradient(135deg,#060a47_0%,#0b1053_55%,#0e145c_100%)]",
    expiresAt: "2026-12-06",
  },
];

/**
 * 끝난 대회를 계속 광고하지 않도록 만료된 배너는 빼고 내보낸다.
 * 모듈 로드 시점에 한 번만 거르므로, 자정을 넘겨 열어둔 탭은 새로고침해야 반영된다.
 * 배너는 홈에 잠깐 머무는 요소라 그 정도 지연은 문제되지 않는다.
 */
const today = new Date().toLocaleDateString("sv-SE"); // "YYYY-MM-DD" (로컬 기준)

export const BANNERS: Banner[] = ALL_BANNERS.filter(
  (banner) => !banner.expiresAt || banner.expiresAt >= today,
);
