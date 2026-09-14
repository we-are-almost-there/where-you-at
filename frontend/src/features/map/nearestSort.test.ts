import { describe, expect, it } from "vitest";
import { slicePage, sortByDistance } from "./nearestSort";

const SEOUL = { lat: 37.5665, lng: 126.978 };

const items = [
  { id: 3, point: { lat: 35.1796, lng: 129.0756 } }, // 부산
  { id: 1, point: null }, // 좌표 없음
  { id: 2, point: { lat: 37.4563, lng: 126.7052 } }, // 인천
  { id: 4, point: { lat: 36.3504, lng: 127.3845 } }, // 대전
];

describe("sortByDistance", () => {
  it("가까운 순으로 정렬하고 좌표가 없는 항목은 맨 뒤로 보낸다", () => {
    const sorted = sortByDistance(items, SEOUL, (item) => item.point);
    expect(sorted.map((item) => item.id)).toEqual([2, 4, 3, 1]);
  });

  it("거리가 같으면 id 순으로 둔다", () => {
    const same = { lat: 37.5, lng: 127.0 };
    const sorted = sortByDistance(
      [
        { id: 9, point: same },
        { id: 5, point: same },
        { id: 8, point: null },
        { id: 6, point: null },
      ],
      SEOUL,
      (item) => item.point,
    );
    expect(sorted.map((item) => item.id)).toEqual([5, 9, 6, 8]);
  });

  it("원본 배열 순서를 바꾸지 않는다", () => {
    const before = items.map((item) => item.id);
    sortByDistance(items, SEOUL, (item) => item.point);
    expect(items.map((item) => item.id)).toEqual(before);
  });
});

describe("slicePage", () => {
  it("1부터 시작하는 페이지만큼 잘라낸다", () => {
    const list = [1, 2, 3, 4, 5];
    expect(slicePage(list, 1, 2)).toEqual([1, 2]);
    expect(slicePage(list, 3, 2)).toEqual([5]);
    expect(slicePage(list, 4, 2)).toEqual([]);
  });
});
