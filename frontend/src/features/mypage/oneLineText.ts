// 닉네임·한 줄 소개처럼 한 줄로 그리는 짧은 글의 입력 규칙.
// 서버(backend/app/schemas/user.py _one_line)와 같은 기준이어야 저장값·화면·글자 수가 맞는다.

const REPEATED_SPACES = / {2,}/g;

/** 글자 수. 서버(파이썬 len)처럼 이모지 하나를 한 글자로 센다. string.length는 이모지를 2로 센다. */
export function charLength(value: string): number {
  return Array.from(value).length;
}

/** 저장할 값: 앞뒤 공백을 지우고 가운데 연속 공백을 한 칸으로 줄인다. 화면(HTML)도 연속 공백을 한 칸으로 그린다. */
export function toOneLine(value: string): string {
  return value.replace(REPEATED_SPACES, " ").trim();
}

/**
 * 입력 중인 값: 연속 공백을 한 칸으로 줄이고 max 글자에서 자른다.
 * 앞뒤 공백은 아직 지우지 않는다. 단어 사이를 띄우려고 친 공백이 입력 도중 사라지면 안 되기 때문이다.
 * 한글을 조합하는 동안에는 부르지 않는다(조합 중인 글자가 잘리거나 두 번 들어간다). 조합이 끝나면 부른다.
 */
export function limitInput(value: string, max: number): string {
  return Array.from(value.replace(REPEATED_SPACES, " ")).slice(0, max).join("");
}
