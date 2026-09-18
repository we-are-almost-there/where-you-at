/**
 * 화면에는 안 보이고 화면낭독기에만 읽히는 상태 알림.
 * 늘 DOM에 두고 글자만 바꿔야 읽힌다 — 알림 요소를 새로 끼워 넣으면 읽지 않는 화면낭독기가 많다.
 * 빈 문자열이면 아무것도 읽지 않는다.
 */
export function StatusMessage({ message }: { message: string }) {
  return (
    <p role="status" className="sr-only">
      {message}
    </p>
  );
}

/**
 * target="_blank" 링크 끝에 붙여, 누르면 새 탭이 열린다는 것을 이름에 포함한다.
 * 앞 공백은 span 밖에 둔다. 요소 안의 앞뒤 공백은 이름 계산에서 잘려 "이동(새 탭에서 열림)"처럼 붙는다.
 */
export function NewTabHint() {
  return (
    <>
      {" "}
      <span className="sr-only">(새 탭에서 열림)</span>
    </>
  );
}
