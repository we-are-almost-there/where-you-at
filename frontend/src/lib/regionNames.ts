/**
 * 지역 코드 → 지역명 ('인천광역시 강화군'). public/region-index.json에서 읽는다.
 *
 * 그 파일은 scripts/build-region-index.mjs가 백엔드 지역 시드로 만들며 DB 지역 전체(269곳)를
 * 담는다. 코스·지원금 API는 각자 필요한 지역만 돌려주므로(코스 보유 지역, 지원 대상 지역),
 * "우리가 아는 모든 지역의 이름"이 필요한 화면은 이 파일을 봐야 한다. 약 14KB(gzip 약 3.7KB)다.
 *
 * 한 번만 받아 재사용한다. 지역을 옮길 때마다 다시 받을 값이 아니고, 화면을 여닫을 때마다
 * 요청이 새로 나가서도 안 된다. 여러 화면이 같은 캐시를 쓰도록 features 밖에 둔다.
 */

/** region-index.json 중 이 모듈이 쓰는 부분. 파일 전체 구조는 features/support/regionMatch.ts의 RegionIndex. */
type RegionIndexNames = { names: Readonly<Record<string, string>> };

let regionNamesPromise: Promise<Map<string, string>> | null = null;

export function loadRegionNames(): Promise<Map<string, string>> {
  regionNamesPromise ??= fetch("/region-index.json")
    .then((r) => r.json())
    .then((index: RegionIndexNames) => new Map<string, string>(Object.entries(index.names)))
    .catch((err) => {
      // 실패한 Promise를 그대로 두면 ??=가 "이미 값이 있다"고 보고 재요청하지 않는다.
      // 네트워크가 돌아와도 새로고침 전까지 지역명이 계속 비어 보였다.
      // 성공한 결과만 캐시로 남긴다.
      regionNamesPromise = null;
      throw err;
    });
  return regionNamesPromise;
}
