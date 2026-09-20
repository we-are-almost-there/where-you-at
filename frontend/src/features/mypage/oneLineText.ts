// 닉네임·한 줄 소개처럼 한 줄로 그리는 짧은 글의 입력 규칙.
// 서버(backend/app/schemas/user.py _one_line)와 같은 기준이어야 저장값·화면·글자 수가 맞는다.

const REPEATED_SPACES = / {2,}/g;

// 줄바꿈 없는 공백(U+00A0)·전각 공백(U+3000) 같은 공백 문자. 웹에서 복사해 붙이면 흔히 섞여 일반 공백으로 바꾼다.
const SPACE_CHARS = /\p{Zs}/gu;

// 서버가 422로 막는 보이지 않는 문자: 제어·서식·줄 구분·사용자 정의·미지정 문자.
// 결합 이모지에 쓰이는 ZWJ(U+200D)와 깃발 태그 문자(U+E0020~U+E007F)는 서버도 허용하므로 남긴다.
// 입력 단계에서 걸러야 저장을 눌렀다가 "쓸 수 없는 문자" 오류를 받는 일이 없다.
const DISALLOWED_CHARS = /(?![‍\u{E0020}-\u{E007F}])[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cn}]/gu;

/** 보이지 않는 문자를 지우고, 공백 문자를 일반 공백으로 바꾸고, 연속 공백을 한 칸으로 줄인다. 앞뒤 공백은 그대로 둔다. */
function normalize(value: string): string {
  return value.replace(DISALLOWED_CHARS, "").replace(SPACE_CHARS, " ").replace(REPEATED_SPACES, " ");
}

/**
 * 글자 수. 서버(파이썬 len)처럼 코드포인트 단위로 센다. string.length는 이모지 하나를 2로 센다.
 * 이모지 하나(👍, 스킨톤 포함 👍🏻은 2)는 대개 한두 글자이고, 여러 이모지를 ZWJ로 이은 결합 이모지는 이어 붙인 수만큼 센다.
 */
export function charLength(value: string): number {
  return Array.from(value).length;
}

/** 저장할 값: 입력 규칙(normalize)을 적용하고 앞뒤 공백을 지운다. 화면(HTML)도 연속 공백을 한 칸으로 그린다. */
export function toOneLine(value: string): string {
  return normalize(value).trim();
}

/**
 * 입력칸 아래 카운터에 보여 줄 글자 수. limitInput이 자르는 기준(normalize한 값, 앞뒤 공백 포함)과 같게 센다.
 * 앞뒤 공백을 빼고 세면 "19자 + 끝 공백"이 19/20으로 보이는데 다음 글자는 막혀 숫자와 동작이 어긋난다.
 * 그 공백은 다음 글자가 들어오면 단어 사이 공백이 되어 저장값이 21자가 되므로, 막는 것이 서버 제한과 맞다.
 * 저장할 때는 끝 공백을 지우므로(toOneLine) 저장되는 글자 수는 이 숫자보다 작을 수 있다.
 */
export function inputLength(value: string): number {
  return charLength(normalize(value));
}

/**
 * 입력 중인 값: 입력 규칙(normalize)을 적용하고 max 글자에서 자른다.
 * 앞뒤 공백은 아직 지우지 않는다. 단어 사이를 띄우려고 친 공백이 입력 도중 사라지면 안 되기 때문이다.
 * 한글을 조합하는 동안에는 부르지 않는다(조합 중인 글자가 잘리거나 두 번 들어간다). 조합이 끝나면 부른다.
 */
export function limitInput(value: string, max: number): string {
  return Array.from(normalize(value)).slice(0, max).join("");
}
