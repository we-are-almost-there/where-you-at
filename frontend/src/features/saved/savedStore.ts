// 찜 상태 저장소.
//
// 코스 목록·상세·마이페이지가 같은 하트 상태를 보므로, useAuth처럼 모듈 수준에 상태를 하나 두고
// useSyncExternalStore로 구독한다. 로그인한 뒤 키 목록(무엇을 찜했는지)을 한 번만 받아 캐시하며,
// 목록 페이지를 넘겨도 다시 부르지 않는다.
//
// 주의: 캐시는 세션당 한 번이라 다른 기기에서 바꾼 찜은 새로고침해야 반영된다.

import { useSyncExternalStore } from "react";
import type { RouteType } from "../map/types";
import { addSavedCourse, getSavedCourseKeys, removeSavedCourse, type SavedCourseKey } from "./savedApi";

interface State {
  /** 찜한 키들. null이면 아직 받지 못한 상태다(하트를 "모름"으로 그린다). */
  keys: ReadonlySet<string> | null;
  /** 요청이 끝나기를 기다리는 키들. 그 버튼만 잠시 못 누르게 한다. */
  pending: ReadonlySet<string>;
}

const EMPTY: ReadonlySet<string> = new Set();

let state: State = { keys: null, pending: EMPTY };
// 로그아웃·다른 사용자 로그인 뒤 이전 세션의 조회 응답이 도착해도 캐시를 되살리지 않게 한다.
let generation = 0;
let loadingGeneration: number | null = null;
const listeners = new Set<() => void>();

function savedKey(courseId: number, routeType: RouteType): string {
  return `${courseId}:${routeType}`;
}

function setState(next: State) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

/**
 * 찜한 키 목록을 한 번만 받는다. 이미 받았거나 받는 중이면 아무것도 하지 않는다.
 * 실패하면 keys를 null로 남겨 하트가 "모름"으로 남는다. 다음 화면에서 다시 시도한다.
 */
export function ensureSavedKeysLoaded(): void {
  if (state.keys !== null || loadingGeneration === generation) return;
  const requestedGeneration = generation;
  loadingGeneration = requestedGeneration;
  getSavedCourseKeys()
    .then((keys) => {
      if (requestedGeneration === generation) setState({ ...state, keys: toKeySet(keys) });
    })
    .catch(() => {})
    .finally(() => {
      if (loadingGeneration === requestedGeneration) loadingGeneration = null;
    });
}

/**
 * 이미 받은 찜 목록으로 캐시를 채운다. 마이페이지 찜 목록이 도착했을 때 쓴다.
 * 키를 따로 받을 때까지 하트가 빈 상태로 보였다가 채워지는 깜빡임을 막는다.
 */
export function seedSavedKeys(items: SavedCourseKey[]): void {
  setState({ ...state, keys: toKeySet(items) });
}

/** 로그아웃·탈퇴 때 캐시를 비운다. 같은 브라우저로 다른 사람이 로그인했을 때 이전 하트가 남지 않게 한다. */
export function clearSavedKeys(): void {
  generation += 1;
  loadingGeneration = null;
  // 이미 비어 있으면 알리지 않는다. 화면마다 로그아웃을 감지해 부르므로, 매번 새 상태를 만들면 끝없이 다시 그린다.
  if (state.keys === null && state.pending.size === 0) return;
  setState({ keys: null, pending: EMPTY });
}

function toKeySet(items: SavedCourseKey[]): ReadonlySet<string> {
  return new Set(items.map((item) => savedKey(item.courseId, item.routeType)));
}

/**
 * 찜 상태를 뒤집는다. 누르는 즉시 화면에 반영하고, 실패하면 되돌린 뒤 오류를 그대로 던진다.
 * 호출한 화면이 toUserError로 안내한다.
 */
export async function toggleSavedCourse(courseId: number, routeType: RouteType): Promise<void> {
  const key = savedKey(courseId, routeType);
  // keys가 없으면 지금 상태를 모르므로 아무것도 하지 않는다(버튼도 이때는 눌리지 않는다).
  if (state.keys === null || state.pending.has(key)) return;

  const wasSaved = state.keys.has(key);
  setState({ keys: withKey(state.keys, key, !wasSaved), pending: withKey(state.pending, key, true) });

  try {
    if (wasSaved) await removeSavedCourse(courseId, routeType);
    else await addSavedCourse(courseId, routeType);
  } catch (error) {
    // 기다리는 사이 로그아웃했으면(keys가 null) 되돌릴 상태가 없다.
    if (state.keys !== null) setState({ ...state, keys: withKey(state.keys, key, wasSaved) });
    throw error;
  } finally {
    setState({ ...state, pending: withKey(state.pending, key, false) });
  }
}

function withKey(set: ReadonlySet<string>, key: string, present: boolean): ReadonlySet<string> {
  const next = new Set(set);
  if (present) next.add(key);
  else next.delete(key);
  return next;
}

/** 한 코스·종목의 찜 상태. saved가 undefined면 아직 모르는 상태다. */
export function useSavedCourse(
  courseId: number,
  routeType: RouteType,
): { saved: boolean | undefined; busy: boolean } {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const key = savedKey(courseId, routeType);
  return {
    saved: snapshot.keys ? snapshot.keys.has(key) : undefined,
    busy: snapshot.pending.has(key),
  };
}
