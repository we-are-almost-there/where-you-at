import { describe, expect, it } from "vitest";
import {
  buildEndpointAddresses,
  regionToAddressParts,
  FALLBACK_LABELS,
  type AddressParts,
} from "./endpointAddress";

const parts = (region1: string, region2: string, region3: string, detail = ""): AddressParts => ({
  region1,
  region2,
  region3,
  detail,
});

// coord2RegionCode 응답 한 건. 실제 응답에서 쓰는 필드만 채운다.
const region = (
  over: Partial<kakao.maps.services.RegionCode> = {},
): kakao.maps.services.RegionCode =>
  ({
    region_type: "B",
    address_name: "",
    region_1depth_name: "강원특별자치도",
    region_2depth_name: "강릉시",
    region_3depth_name: "남항진동",
    region_4depth_name: "",
    code: "5115013000",
    x: 0,
    y: 0,
    ...over,
  }) as kakao.maps.services.RegionCode;

describe("buildEndpointAddresses", () => {
  it("캡션(시도+시군구)과 메인(읍면동+번지)을 나눠서 반환한다", () => {
    const [start, end] = buildEndpointAddresses(
      parts("부산광역시", "동구", "초량동", "1476-1"),
      parts("부산광역시", "중구", "중앙동7가", "80"),
    );
    expect(start).toEqual({ caption: "부산광역시 동구", main: "초량동 1476-1" });
    expect(end).toEqual({ caption: "부산광역시 중구", main: "중앙동7가 80" });
  });

  it("시도가 달라도 각자 자기 캡션을 그대로 보여준다", () => {
    const [start, end] = buildEndpointAddresses(
      parts("부산광역시", "강서구", "송정동", "1"),
      parts("경상남도", "창원시", "진해구", "2"),
    );
    expect(start.caption).toBe("부산광역시 강서구");
    expect(end.caption).toBe("경상남도 창원시");
  });

  it("구 아래 면이 있어도 캡션에 다 들어가 메인 줄은 짧게 유지된다 (창원시 마산합포구 / 구산면 마전리)", () => {
    const [start] = buildEndpointAddresses(
      parts("경상남도", "창원시 마산합포구", "구산면 마전리", "111-7"),
      parts("경상남도", "고성군", "회화면 배둔리", "1288-28"),
    );
    expect(start.caption).toBe("경상남도 창원시 마산합포구");
    expect(start.main).toBe("구산면 마전리 111-7");
  });

  it("긴 특별자치도 표기도 캡션에 그대로 둔다", () => {
    const [start] = buildEndpointAddresses(
      parts("강원특별자치도", "강릉시", "주문진읍", "12"),
      parts("경상남도", "사천시", "대방동", "369"),
    );
    expect(start.caption).toBe("강원특별자치도 강릉시");
  });

  it("메인(읍면동+번지)만 같고 캡션(시도+시군구)이 다르면 여전히 구별된다", () => {
    const [start, end] = buildEndpointAddresses(
      parts("부산광역시", "중구", "중앙동", "1"),
      parts("대구광역시", "중구", "중앙동", "1"),
    );
    expect(start.caption).not.toBe(end.caption);
  });

  it("주소 전체(시도~번지)가 완전히 같은 지점(사실상 동일 좌표)이면 기본 라벨로 돌아간다", () => {
    const same = parts("경상남도", "사천시", "대방동", "369");
    const [start, end] = buildEndpointAddresses(same, same);
    expect(start).toEqual({ caption: "", main: FALLBACK_LABELS[0] });
    expect(end).toEqual({ caption: "", main: FALLBACK_LABELS[1] });
  });

  it.each([
    [null, parts("부산광역시", "동구", "초량동")],
    [parts("부산광역시", "동구", "초량동"), null],
  ] as const)("한쪽 주소라도 조회에 실패하면 양쪽 모두 기본 라벨로 돌아간다", (startParts, endParts) => {
    const [start, end] = buildEndpointAddresses(startParts, endParts);
    expect(start).toEqual({ caption: "", main: FALLBACK_LABELS[0] });
    expect(end).toEqual({ caption: "", main: FALLBACK_LABELS[1] });
  });

  it("주소 구성 요소가 모두 비어 있으면 기본 라벨로 돌아간다", () => {
    const [start, end] = buildEndpointAddresses(parts("", "", ""), parts("", "", ""));
    expect(start.main).toBe(FALLBACK_LABELS[0]);
    expect(end.main).toBe(FALLBACK_LABELS[1]);
  });

  // 행정구역 폴백으로 온 끝점은 번지가 없다. 읍면동만으로도 메인 줄이 채워져야 한다.
  it("번지가 없는 끝점은 읍면동까지만 메인 줄에 넣는다", () => {
    const [start] = buildEndpointAddresses(
      parts("강원특별자치도", "강릉시", "남항진동"),
      parts("강원특별자치도", "강릉시", "사천면 사천진리", "2-106"),
    );
    expect(start).toEqual({ caption: "강원특별자치도 강릉시", main: "남항진동" });
  });

  // 번지가 빠지면 같은 동에서 시작·종료하는 코스는 두 문자열이 같아진다.
  // 양쪽 다 행정구역 폴백으로 떨어졌을 때만 생기므로 기존 동작이 나빠지진 않는다.
  it("번지 없이 두 끝점이 같은 동이면 기본 라벨로 돌아간다", () => {
    const sameDong = parts("강원특별자치도", "강릉시", "남항진동");
    const [start] = buildEndpointAddresses(sameDong, { ...sameDong });
    expect(start.main).toBe(FALLBACK_LABELS[0]);
  });
});

describe("regionToAddressParts", () => {
  it("동 지역은 3depth를 그대로 쓰고 번지는 비운다", () => {
    expect(regionToAddressParts(region())).toEqual({
      region1: "강원특별자치도",
      region2: "강릉시",
      region3: "남항진동",
      detail: "",
    });
  });

  // coord2Address는 "사천면 사천진리"로 합쳐 주는데 coord2RegionCode는 쪼개서 준다.
  // 두 경로의 표기가 어긋나지 않게 합쳐야 한다.
  it("리 지역은 3depth와 4depth를 합친다", () => {
    const result = regionToAddressParts(
      region({ region_3depth_name: "사천면", region_4depth_name: "사천진리" }),
    );
    expect(result?.region3).toBe("사천면 사천진리");
  });

  // 바다는 status가 OK인데 depth가 전부 빈 문자열로 온다. 걸러내지 않으면 빈 줄이 렌더된다.
  it("바다 영역(depth가 빈 문자열)은 null", () => {
    expect(
      regionToAddressParts(
        region({
          region_1depth_name: "",
          region_2depth_name: "",
          region_3depth_name: "",
          address_name: "동해",
        }),
      ),
    ).toBeNull();
  });

  it("결과가 없으면 null", () => {
    expect(regionToAddressParts(undefined)).toBeNull();
  });

  it("축약형 시도명은 공식 명칭으로 바꾼다", () => {
    expect(regionToAddressParts(region({ region_1depth_name: "경남" }))?.region1).toBe("경상남도");
  });
});
