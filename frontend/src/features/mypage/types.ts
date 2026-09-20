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

/** 서버가 반환한 기록 카드 한 페이지. 전체 개수는 현재 페이지의 카드 수와 다르다. */
export interface RecordCardPage {
  totalCount: number;
  page: number;
  size: number;
  cards: SavedRecordCard[];
}

/** 완주한 시군구에서 사용자가 직접 찍은 스탬프 하나. */
export interface Stamp {
  /** 시군구 코드(5자리). 지도 도형 파일(korea-all-regions.json)의 sgg_code와 같은 체계다. */
  sigunguCode: string;
  stampedAt: string;
}

export type StampStatus = "LOCKED" | "AVAILABLE" | "STAMPED";
export interface SigunguStampStatus {
  sigunguCode: string;
  status: StampStatus;
  stampedAt: string | null;
}
