import { haversineKm } from "./courseSegments";
import type { LatLng } from "./types";

/*
 * '가까운 순' 정렬. 이용자 위치는 브라우저 안에서만 쓰고 서버로 보내지 않는다.
 *
 * 서버가 이용자 좌표를 받으면 위치기반서비스사업 신고 대상이 될 수 있어, 위치와 상관없이 항상 같은
 * 목록(필터에 맞는 전체)을 받아 여기서 정렬한다. 정렬한 결과의 일부(가까운 몇 개)만 다시 서버에
 * 요청하면 그 선택만으로 위치가 드러나므로, 목록을 받은 뒤에는 추가 요청 없이 화면에서 페이지를 나눈다.
 */

/**
 * origin에서 가까운 순으로 정렬한 새 배열을 돌려준다(원본은 건드리지 않는다).
 * 좌표가 없는 항목은 맨 뒤로 보내고, 거리가 같으면 id 순으로 둬 페이지를 넘겨도 순서가 흔들리지 않게 한다.
 */
export function sortByDistance<T extends { id: number }>(
  items: readonly T[],
  origin: LatLng,
  pointOf: (item: T) => LatLng | null | undefined,
): T[] {
  return items
    .map((item) => {
      const point = pointOf(item);
      return { item, distance: point ? haversineKm(origin, point) : Number.POSITIVE_INFINITY };
    })
    .sort((a, b) => {
      // 둘 다 좌표가 없으면 Infinity - Infinity가 NaN이 되므로 같은 거리로 본다.
      const byDistance = a.distance === b.distance ? 0 : a.distance - b.distance;
      return byDistance || a.item.id - b.item.id;
    })
    .map((entry) => entry.item);
}

/** 1부터 시작하는 page의 항목만 잘라낸다. */
export function slicePage<T>(items: readonly T[], page: number, size: number): T[] {
  const start = (page - 1) * size;
  return items.slice(start, start + size);
}
