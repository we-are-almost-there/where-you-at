import { useEffect, useState } from "react";
import type { LatLng } from "./types";

/** 코스 끝점 주소에서 라벨을 만드는 데 필요한 부분만 추린 형태. */
export interface AddressParts {
  region1: string; // 시도 (예: 부산광역시, 경상남도)
  region2: string; // 시군구 (예: 영도구, 사천시)
  region3: string; // 읍면동 (예: 동삼동, 대방동)
  detail: string; // 번지 (예: 369)
}

/**
 * 2줄 표시용: 위=시도+시군구(작게), 아래=읍면동 번지(굵게).
 * 시군구까지 캡션으로 올린 이유: 같은 코스의 두 끝점은 보통 시군구까지는 같고
 * 읍면동·번지에서 갈리므로, 실제로 구별해주는 정보만 굵게 강조하는 게 낫다.
 * 부수 효과로 굵은 줄이 짧아져 줄바꿈(긴 주소 대응)도 덜 일어난다.
 */
export interface EndpointAddress {
  caption: string; // 시도 + 시군구. 못 구했으면 ""
  main: string; // 읍면동 + 번지, 혹은 기본 라벨
}

/** 주소를 못 구했거나 두 끝점을 구별할 수 없을 때 쓰는 기본 라벨. */
export const FALLBACK_LABELS: [string, string] = ["코스 시작점", "코스 종료점"];

// Kakao coord2Address는 region_1depth_name을 항상 축약형("경남", "부산")으로 준다.
// 공식 명칭 표기를 위해 직접 매핑한다. 목록에 없는 값(향후 행정구역 개편 등)은
// 원래 값을 그대로 써 화면이 비지 않게 방어한다.
const SIDO_OFFICIAL: Record<string, string> = {
  서울: "서울특별시",
  부산: "부산광역시",
  대구: "대구광역시",
  인천: "인천광역시",
  광주: "광주광역시",
  대전: "대전광역시",
  울산: "울산광역시",
  세종: "세종특별자치시",
  경기: "경기도",
  강원: "강원특별자치도",
  충북: "충청북도",
  충남: "충청남도",
  전북: "전북특별자치도",
  전남: "전라남도",
  경북: "경상북도",
  경남: "경상남도",
  제주: "제주특별자치도",
};

function toOfficialSido(abbrev: string): string {
  return SIDO_OFFICIAL[abbrev] ?? abbrev;
}

// 지번 표기 규칙: 부번지는 "-N"으로, 산지번(임야)은 앞에 "산 "을 붙인다.
// (예: main=1, sub=6, mountain=Y → "산 1-6". sub가 없으면 "-N" 생략)
function formatJibun(mainNo: string, subNo: string, mountainYn: string): string {
  const no = subNo ? `${mainNo}-${subNo}` : mainNo;
  return mountainYn === "Y" ? `산 ${no}` : no;
}

const FALLBACK: [EndpointAddress, EndpointAddress] = [
  { caption: "", main: FALLBACK_LABELS[0] },
  { caption: "", main: FALLBACK_LABELS[1] },
];

const join = (...parts: string[]) => parts.filter(Boolean).join(" ");

/**
 * 두 끝점 주소를 2줄(시도+시군구 / 읍면동+번지)용으로 만든다.
 *
 * 레이아웃이 2줄이라 폭 걱정 없이 매번 번지까지 전부 보여준다. 구별 가능
 * 여부는 화면에 나뉘어 보이는 두 줄이 아니라 주소 전체(시도~번지)를 합쳐
 * 판단한다 — 화면상 굵은 줄(읍면동+번지)만 같고 캡션(시도+시군구)이 다른
 * 극단적 케이스까지 잡아내려는 것. 전체가 완전히 같을 때만(진짜 순환·왕복
 * 코스가 아니라 시작=끝인 예외적 케이스) 기본 라벨로 돌아간다.
 */
export function buildEndpointAddresses(
  start: AddressParts | null,
  end: AddressParts | null,
): [EndpointAddress, EndpointAddress] {
  if (!start || !end) return FALLBACK;

  const fullStart = join(start.region1, start.region2, start.region3, start.detail);
  const fullEnd = join(end.region1, end.region2, end.region3, end.detail);
  if (!fullStart || !fullEnd || fullStart === fullEnd) return FALLBACK;

  return [
    { caption: join(start.region1, start.region2), main: join(start.region3, start.detail) },
    { caption: join(end.region1, end.region2), main: join(end.region3, end.detail) },
  ];
}

/**
 * 행정구역 조회 결과를 주소 조각으로 바꾼다. 행정구역에는 번지가 없으므로 detail은 비운다.
 *
 * 바다 영역은 status가 OK로 오면서 depth 이름만 전부 빈 문자열이다(address_name에 "동해"만 담긴다).
 * 그대로 두면 빈 줄이 렌더되므로 region_1depth_name이 비었는지로 걸러낸다.
 *
 * 리 지역은 coord2Address가 region_3depth_name에 "사천면 사천진리"로 합쳐 주는 것과 달리
 * 3depth("사천면")와 4depth("사천진리")로 쪼개서 준다. 표기를 맞추려면 합쳐야 한다.
 */
export function regionToAddressParts(
  region: kakao.maps.services.RegionCode | undefined,
): AddressParts | null {
  if (!region || !region.region_1depth_name) return null;
  return {
    region1: toOfficialSido(region.region_1depth_name),
    region2: region.region_2depth_name,
    region3: join(region.region_3depth_name, region.region_4depth_name),
    detail: "",
  };
}

function lookupAddress(geocoder: kakao.maps.services.Geocoder, point: LatLng): Promise<AddressParts | null> {
  return new Promise((resolve) => {
    geocoder.coord2Address(point.lng, point.lat, (result, status) => {
      const address = status === kakao.maps.services.Status.OK ? result[0]?.address : null;
      resolve(
        address
          ? {
              region1: toOfficialSido(address.region_1depth_name),
              region2: address.region_2depth_name,
              region3: address.region_3depth_name,
              detail: formatJibun(address.main_address_no, address.sub_address_no, address.mountain_yn),
            }
          : null,
      );
    });
  });
}

/**
 * 지번이 없는 좌표를 위한 폴백. coord2Address는 좌표를 필지에 매칭하므로, 항만·매립지처럼
 * 지적공부에 필지가 없는 땅에서는 지번·도로명 모두 빈 결과가 온다(옆에 도로가 있어도 마찬가지 —
 * 도로명주소는 도로가 아니라 그 도로에 접한 건물에 붙기 때문이다).
 * 행정구역 경계는 그런 땅도 덮으므로 읍면동까지는 얻을 수 있다.
 * 지번주소 체계와 계열을 맞추기 위해 행정동(H)이 아닌 법정동(B)을 우선한다.
 */
function lookupRegion(geocoder: kakao.maps.services.Geocoder, point: LatLng): Promise<AddressParts | null> {
  return new Promise((resolve) => {
    geocoder.coord2RegionCode(point.lng, point.lat, (result, status) => {
      if (status !== kakao.maps.services.Status.OK) return resolve(null);
      resolve(regionToAddressParts(result.find((r) => r.region_type === "B") ?? result[0]));
    });
  });
}

function lookup(geocoder: kakao.maps.services.Geocoder, point: LatLng): Promise<AddressParts | null> {
  return lookupAddress(geocoder, point).then((address) => address ?? lookupRegion(geocoder, point));
}

/**
 * GPX 양 끝점을 역지오코딩해 2줄 라벨 두 개를 만든다(순서는 GPX 기준: 첫 지점, 마지막 지점).
 * SDK 미로드·조회 실패 시에는 기본 라벨을 그대로 쓰므로 화면이 비지 않는다.
 */
export function useEndpointAddresses(waypoints: LatLng[]): [EndpointAddress, EndpointAddress] {
  // waypoints를 key로 함께 저장해, 코스·주행방식이 바뀌면 이전 결과를 자동으로 버린다.
  const [resolved, setResolved] = useState<{
    key: LatLng[];
    addresses: [EndpointAddress, EndpointAddress];
  } | null>(null);

  useEffect(() => {
    if (waypoints.length < 2) return;
    if (typeof kakao === "undefined") return;

    let cancelled = false;
    try {
      kakao.maps.load(async () => {
        if (cancelled || !kakao.maps.services) return;
        try {
          const geocoder = new kakao.maps.services.Geocoder();
          const [start, end] = await Promise.all([
            lookup(geocoder, waypoints[0]),
            lookup(geocoder, waypoints[waypoints.length - 1]),
          ]);
          if (cancelled) return;
          setResolved({ key: waypoints, addresses: buildEndpointAddresses(start, end) });
        } catch {
          /* 주소 조회 실패 시에도 양쪽 모두 기본 라벨을 유지한다 */
        }
      });
    } catch {
      /* SDK 로딩 실패 시에도 양쪽 모두 기본 라벨을 유지한다 */
    }

    return () => {
      cancelled = true;
    };
  }, [waypoints]);

  return resolved?.key === waypoints ? resolved.addresses : FALLBACK;
}
