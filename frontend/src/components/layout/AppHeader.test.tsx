// @vitest-environment jsdom
//
// 헤더 오른쪽이 로그인 상태에 따라 로그인 버튼과 마이페이지 링크로 바뀌는지 본다.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startKakaoLogin, useAuth, type AuthState } from "../../features/auth";
import AppHeader from "./AppHeader";
import { MAIN_CONTENT_ID } from "./mainContent";

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

function LocationProbe() {
  const { pathname, hash } = useLocation();
  return <output data-testid="location">{pathname + hash}</output>;
}

describe("AppHeader", () => {
  it("로고를 이름이 있는 홈 링크로 그리고, 메뉴에 홈은 없다", () => {
    renderHeader({ status: "signedOut", user: null });

    const homeLink = screen.getByRole("link", { name: "어디까지왔니" });
    expect(homeLink.getAttribute("href")).toBe("/");
    expect(homeLink.getAttribute("aria-current")).toBe("page");
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

describe("AppHeader 주요 메뉴", () => {
  it("지금 보는 페이지의 메뉴에만 aria-current=page를 둔다", () => {
    renderHeader({ status: "signedOut", user: null }, "/races");

    const nav = screen.getByRole("navigation", { name: "주요 메뉴" });
    const current = [...nav.querySelectorAll("[aria-current]")];
    expect(current.map((link) => [link.textContent, link.getAttribute("aria-current")])).toEqual([
      ["대회 행사", "page"],
    ]);
  });
});

describe("AppHeader 하위 경로의 현재 메뉴", () => {
  it.each([
    ["/courses/1", "코스 탐색"],
    ["/courses/1/", "코스 탐색"],
    ["/courses", "코스 탐색"],
  ])("%s에서는 %s만 현재 페이지다", (path, label) => {
    renderHeader({ status: "signedOut", user: null }, path);

    const nav = screen.getByRole("navigation", { name: "주요 메뉴" });
    expect([...nav.querySelectorAll('[aria-current="page"]')].map((link) => link.textContent)).toEqual([label]);
  });

  it("비슷하게 시작하는 다른 경로는 현재 메뉴로 보지 않는다", () => {
    renderHeader({ status: "signedOut", user: null }, "/courses-archive");

    const nav = screen.getByRole("navigation", { name: "주요 메뉴" });
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });
});

describe("AppHeader 본문 바로가기", () => {
  it("헤더에서 가장 먼저 나오는 링크다", () => {
    renderHeader({ status: "signedOut", user: null });

    expect(screen.getAllByRole("link")[0].textContent).toBe("본문 바로가기");
  });

  it("누르면 주소를 바꾸지 않고 본문으로 초점을 옮긴다", () => {
    mockedUseAuth.mockReturnValue({ status: "signedOut", user: null });
    render(
      <MemoryRouter initialEntries={["/courses"]}>
        <AppHeader />
        <main id={MAIN_CONTENT_ID} tabIndex={-1}>
          본문
        </main>
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: "본문 바로가기" }));

    expect(document.activeElement).toBe(screen.getByRole("main"));
    expect(screen.getByTestId("location").textContent).toBe("/courses");
  });
});
