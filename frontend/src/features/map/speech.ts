// 코스 이탈 순간의 짧은 한국어 음성 안내. 브라우저 SpeechSynthesis만 사용한다.
// 미지원(구형 브라우저 등)이면 조용히 무시해 호출부가 분기하지 않게 한다.

function synth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
}

// iOS Safari는 사용자 제스처 없이는 발화를 막는다. '따라가기' 버튼을 누른 그 순간(제스처)에
// 무음 발화를 한 번 흘려 이후의 announce가 나오도록 잠금을 푼다.
export function primeSpeech(): void {
  const s = synth();
  if (!s) return;
  const u = new SpeechSynthesisUtterance("");
  u.volume = 0;
  s.speak(u);
}

// 직전 발화를 끊고 새로 말한다. 이탈 안내는 최신 상태만 의미 있어 큐를 쌓지 않는다.
export function announce(text: string): void {
  const s = synth();
  if (!s) return;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ko-KR";
  s.speak(u);
}
