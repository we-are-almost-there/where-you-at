import { describe, expect, it } from "vitest";
import { buildEndpointAddresses, FALLBACK_LABELS, type AddressParts } from "./endpointAddress";

const parts = (region1: string, region2: string, region3: string, detail = ""): AddressParts => ({
  region1,
  region2,
  region3,
  detail,
});

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
});
