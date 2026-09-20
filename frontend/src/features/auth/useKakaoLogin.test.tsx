// @vitest-environment jsdom
//
// 로그인 버튼이 로그인할 때마다 만 14세 이상인지 먼저 묻고, 확인한 뒤에만 카카오 로그인으로 보내는지 본다.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startKakaoLogin } from "./kakaoRedirect";
import { useKakaoLogin } from "./useKakaoLogin";

vi.mock("./kakaoRedirect", () => ({ startKakaoLogin: vi.fn() }));

function LoginButton() {
  const { login, dialog } = useKakaoLogin();
  return (
    <>
      <button type="button" onClick={() => login("/mypage?tab=x")}>
        로그인
      </button>
      {dialog}
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useKakaoLogin", () => {
  it("나이를 묻고, 확인하면 보던 주소로 돌아오도록 로그인을 시작한다", () => {
    render(<LoginButton />);
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    const dialog = screen.getByRole("dialog", { name: "만 14세 이상만 가입할 수 있어요" });
    expect(startKakaoLogin).not.toHaveBeenCalled();
    // 법이 가입을 금지하는 것이 아니라 법정대리인 동의 절차가 없어서라는 서비스 정책으로 안내한다.
    expect(dialog.textContent).toContain("법정대리인 동의 절차를 제공하지 않아 만 14세 미만의 회원 가입을 지원하지 않아요");
    expect(dialog.textContent).not.toContain("「개인정보 보호법」에 따라");
    // 약관·방침은 새 탭으로 열어 로그인 흐름을 끊지 않는다.
    expect(dialog.querySelector('a[href="/terms"]')?.getAttribute("target")).toBe("_blank");
    expect(dialog.querySelector('a[href="/privacy"]')?.getAttribute("target")).toBe("_blank");

    fireEvent.click(screen.getByRole("button", { name: "만 14세 이상이에요" }));

    expect(startKakaoLogin).toHaveBeenCalledWith("/mypage?tab=x");
  });

  it("취소하면 로그인하지 않고 닫는다", () => {
    render(<LoginButton />);
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(startKakaoLogin).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("한 번 확인했어도 다음 로그인 때 다시 묻는다(공용 기기에서 다음 사람이 건너뛰지 않게)", () => {
    const first = render(<LoginButton />);
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    fireEvent.click(screen.getByRole("button", { name: "만 14세 이상이에요" }));
    first.unmount();
    vi.clearAllMocks();

    render(<LoginButton />);
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    expect(screen.getByRole("dialog", { name: "만 14세 이상만 가입할 수 있어요" })).toBeTruthy();
    expect(startKakaoLogin).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });
});
