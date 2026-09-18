// @vitest-environment jsdom
//
// 로그인 버튼이 처음 로그인하는 기기에서는 만 14세 이상인지 먼저 묻고, 확인한 뒤에만 카카오 로그인으로 보내는지 본다.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useKakaoLogin", () => {
  it("처음에는 나이를 묻고, 확인하면 보던 주소로 돌아오도록 로그인을 시작한다", () => {
    render(<LoginButton />);
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    const dialog = screen.getByRole("dialog", { name: "만 14세 이상만 가입할 수 있어요" });
    expect(startKakaoLogin).not.toHaveBeenCalled();
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

  it("한 번 확인한 기기에서는 다시 묻지 않는다", () => {
    const first = render(<LoginButton />);
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    fireEvent.click(screen.getByRole("button", { name: "만 14세 이상이에요" }));
    first.unmount();
    vi.clearAllMocks();

    render(<LoginButton />);
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(startKakaoLogin).toHaveBeenCalledWith("/mypage?tab=x");
  });
});
