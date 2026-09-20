// 스탬프를 모으는 시도와 그 안의 시군구 수.
//
// 기준은 지도 도형 파일(public/korea-sido.json·korea-all-regions.json)과 같은 현재 행정구역이다.
// - 2026.07.01 전남광주통합특별시 출범(광주광역시·전라남도 폐지, 시도 코드 12)으로 시도는 16개다.
// - 같은 날 인천 개편(제물포구·영종구·검단구 신설, 서구 → 서해구)이 반영돼 인천은 11개다.
// - 시군구 수는 지도의 시군구 도형 수다. 일반구가 있는 시(수원·청주 등)는 시 하나로 센다.
// 행정구역이 바뀌면 도형 파일과 이 목록을 함께 고친다. stampRegions.test.ts가 둘이 맞는지 검사한다.

export interface StampSido {
  /** 시도 코드 (시군구 코드 앞 2자리) */
  code: string;
  name: string;
  /** 도장 안에 쓰는 짧은 이름 */
  short: string;
  sigunguCount: number;
}

// 순서는 지도 파일(korea-sido.json)과 같다: 특별·광역시, 통합특별시, 도.
export const STAMP_SIDO: readonly StampSido[] = [
  { code: "11", name: "서울특별시", short: "서울", sigunguCount: 25 },
  { code: "26", name: "부산광역시", short: "부산", sigunguCount: 16 },
  { code: "27", name: "대구광역시", short: "대구", sigunguCount: 9 },
  { code: "28", name: "인천광역시", short: "인천", sigunguCount: 11 },
  { code: "12", name: "전남광주통합특별시", short: "전남광주", sigunguCount: 27 },
  { code: "30", name: "대전광역시", short: "대전", sigunguCount: 5 },
  { code: "31", name: "울산광역시", short: "울산", sigunguCount: 5 },
  { code: "36", name: "세종특별자치시", short: "세종", sigunguCount: 1 },
  { code: "41", name: "경기도", short: "경기", sigunguCount: 31 },
  { code: "51", name: "강원특별자치도", short: "강원", sigunguCount: 18 },
  { code: "43", name: "충청북도", short: "충북", sigunguCount: 11 },
  { code: "44", name: "충청남도", short: "충남", sigunguCount: 15 },
  { code: "52", name: "전북특별자치도", short: "전북", sigunguCount: 14 },
  { code: "47", name: "경상북도", short: "경북", sigunguCount: 22 },
  { code: "48", name: "경상남도", short: "경남", sigunguCount: 18 },
  { code: "50", name: "제주특별자치도", short: "제주", sigunguCount: 2 },
];

export const TOTAL_SIGUNGU = STAMP_SIDO.reduce((sum, sido) => sum + sido.sigunguCount, 0);

export const sidoCodeOf = (sigunguCode: string) => sigunguCode.slice(0, 2);
