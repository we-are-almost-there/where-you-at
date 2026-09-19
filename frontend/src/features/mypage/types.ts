// 마이페이지에 모아 보여 줄 데이터의 화면용 모양.
// 찜·기록·기록 카드·스탬프는 아직 서버 API가 없다(9/18 기준). 담당 작업이 올라오면 응답을 이 모양으로 바꿔 넣거나,
// 응답 모양에 맞춰 이 타입을 고친다. 찜한 코스는 코스 탐색 카드를 그대로 쓰려고 코스 목록 응답(Course)을 쓴다.

import type { RouteType } from "../map/types";

export interface RunRecord {
  id: number;
  courseId: number;
  courseName: string;
  routeType: RouteType;
  distanceKm: number;
  durationMs: number;
  /** 평균 페이스(초/km). 거리가 너무 짧으면 null. 자전거는 화면에서 km/h로 바꿔 쓴다. */
  paceSecPerKm: number | null;
  finishedAt: string;
}

/** 완주 뒤 만들어 저장한 기록 카드. 한 기록으로 여러 장을 만들 수 있다. */
export interface SavedRecordCard {
  id: number;
  record: RunRecord;
  /** 저장한 카드 이미지 주소(R2 record-cards/). 불러오지 못하면 수치로 그린 기본 카드를 보여 준다. */
  imageUrl: string | null;
  createdAt: string;
}

/** 시군구 스탬프 하나. 그 시군구의 코스를 처음 완주한 날 받는다. */
export interface Stamp {
  /** 시군구 코드(5자리). 지도 도형 파일(korea-all-regions.json)의 sgg_code와 같은 체계다. */
  sigunguCode: string;
  collectedAt: string;
}
