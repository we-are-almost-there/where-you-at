// 회원 가입 나이 확인(만 14세 이상) 기록.
//
// 「개인정보 보호법」 제22조의2: 만 14세 미만 아동의 개인정보를 처리하려면 법정대리인 동의가 필요하다.
// 법정대리인 동의 절차를 두지 않는 대신 회원 가입(카카오 로그인)을 만 14세 이상으로 제한하고, 로그인 전에 확인한다.
// 개인정보처리방침 3번과 이용약관 제11조의2가 이 확인을 안내한다.
//
// 한 번 확인한 기기에서는 다시 묻지 않는다. 저장소 접근이 막히면(사생활 보호 모드 등) 매번 묻는다.

const STORAGE_KEY = "auth.ageConfirmed";

export function hasConfirmedAge(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function rememberAgeConfirmed(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // 저장하지 못하면 다음 로그인 때 다시 묻는다.
  }
}
