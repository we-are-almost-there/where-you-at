// @vitest-environment jsdom
//
// 헤더 오른쪽이 로그인 상태에 따라 로그인 버튼과 마이페이지 링크로 바뀌는지 본다.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startKakaoLogin, useAuth, type AuthState } from "../../features/auth";
import AppHeader from "./AppHeader";

vi.mock("../../features/auth", () => ({ useAuth: vi.fn(), startKakaoLogin: vi.fn() }));
// 사이드바는 이 테스트의 대상이 아니다.
vi.mock("./SidebarDrawer", () => ({ default: () => null }));

const mockedUseAuth = vi.mocked(useAuth);

function renderHeader(auth: AuthState, path = "/") {
  mockedUseAuth.mockReturnValue(auth);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppHeader />
    </MemoryRouter>,
  );
}

beforeAll(() => {
  // jsdom에는 ResizeObserver가 없다. 스크롤바 보정은 이 테스트의 대상이 아니다.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AppHeader", () => {
  it("로고를 이름이 있는 홈 링크로 그리고, 메뉴에 홈은 없다", () => {
    renderHeader({ status: "signedOut", user: null });

    expect(screen.getByRole("link", { name: "어디까지왔니" }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("link", { name: "홈" })).toBeNull();
  });

  it("로그아웃 상태면 로그인 버튼이 지금 보던 경로로 돌아오게 로그인을 시작한다", () => {
    renderHeader({ status: "signedOut", user: null }, "/courses?region=11");

    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    expect(startKakaoLogin).toHaveBeenCalledWith("/courses?region=11");
    expect(screen.queryByRole("link", { name: /마이페이지/ })).toBeNull();
  });

  it("로그인 상태를 확인하는 동안에는 로그인 버튼을 숨긴다", () => {
    renderHeader({ status: "loading", user: null });

    expect(screen.queryByRole("button", { name: "로그인" })).toBeNull();
    expect(screen.queryByRole("link", { name: /마이페이지/ })).toBeNull();
  });

  it("로그인 상태면 로그인 버튼 대신 닉네임과 마이페이지 링크를 보여준다", () => {
    renderHeader({ status: "signedIn", user: { id: 1, nickname: "달리는채은" } });

    const link = screen.getByRole("link", { name: /마이페이지/ });
    expect(link.getAttribute("href")).toBe("/mypage");
    expect(link.textContent).toContain("달리는채은");
    expect(screen.queryByRole("button", { name: "로그인" })).toBeNull();
  });

  it("닉네임이 없으면 대신 '회원'을 보여준다", () => {
    renderHeader({ status: "signedIn", user: { id: 1, nickname: null } });

    expect(screen.getByRole("link", { name: /마이페이지/ }).textContent).toContain("회원");
  });
});
