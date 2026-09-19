// @vitest-environment jsdom
// KakaoCallback 테스트.
//
// 테스트 범위:
//   - state가 맞으면 한 번만 교환하고, 로그인한 뒤 원래 경로로 돌아간다 (StrictMode 포함)
//   - state가 다르거나 저장된 시도가 없으면 교환하지 않고 안내한다
//   - 401과 그 밖의 실패를 다른 문구로 안내한다
//   - 동의 화면에서 취소하면 교환하지 않고 원래 경로로 돌아간다
import { StrictMode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HttpError, NetworkError } from "../../lib/http";
import KakaoCallback from "./KakaoCallback";

const { loginWithKakao, signIn } = vi.hoisted(() => ({ loginWithKakao: vi.fn(), signIn: vi.fn() }));
vi.mock("./authApi", () => ({ loginWithKakao }));
vi.mock("./useAuth", () => ({ signIn }));
// 헤더는 ResizeObserver 등 이 테스트와 무관한 브라우저 기능을 써서 뺀다.
vi.mock("../../components/layout/AppHeader", () => ({ default: () => null }));

const USER = { id: 7, nickname: "길손" };

function Landing() {
  const location = useLocation();
  return <p>도착: {`${location.pathname}${location.search}`}</p>;
}

function renderCallback(search: string) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[`/auth/kakao/callback${search}`]}>
        <Routes>
          <Route path="/auth/kakao/callback" element={<KakaoCallback />} />
          <Route path="*" element={<Landing />} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
}

beforeEach(() => {
  sessionStorage.setItem("auth.kakaoLogin", JSON.stringify({ state: "saved-state", returnTo: "/support?region=1" }));
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.clearAllMocks();
});

it("state가 맞으면 한 번만 교환하고 로그인한 뒤 원래 경로로 돌아간다", async () => {
  loginWithKakao.mockResolvedValue({ access_token: "our-token", token_type: "bearer", user: USER });

  renderCallback("?code=abc&state=saved-state");

  expect(screen.getByRole("status").textContent).toContain("로그인하는 중이에요");
  expect(await screen.findByText("도착: /support?region=1")).toBeTruthy();
  expect(loginWithKakao).toHaveBeenCalledTimes(1);
  expect(loginWithKakao).toHaveBeenCalledWith("abc");
  expect(signIn).toHaveBeenCalledWith("our-token", USER);
  expect(sessionStorage.getItem("auth.kakaoLogin")).toBeNull();
});

it("다른 화면처럼 본문 영역·페이지 제목·h1을 갖춘다", () => {
  loginWithKakao.mockReturnValue(new Promise(() => {}));
  renderCallback("?code=abc&state=saved-state");

  const main = screen.getByRole("main");
  expect(main.id).toBe("main-content"); // 본문 바로가기·화면 이동 초점의 대상
  expect(main.tabIndex).toBe(-1);
  expect(screen.getByRole("heading", { level: 1, name: "카카오 로그인" })).toBeTruthy();
  expect(document.title).toBe("카카오 로그인 | 어디까지왔니");
});

it("state가 다르거나 저장된 시도가 없으면 교환하지 않는다", () => {
  for (const setup of [() => {}, () => sessionStorage.clear()]) {
    setup();
    renderCallback("?code=abc&state=forged-state");

    expect(screen.getByText("로그인 요청을 확인하지 못했어요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
    cleanup();
  }
  expect(loginWithKakao).not.toHaveBeenCalled();
});

it("교환이 401이면 만료로, 429면 요청 제한으로, 그 밖의 실패는 일반 실패로 안내한다", async () => {
  const cases = [
    { error: new HttpError(401, "만료"), title: "로그인 요청이 만료되었어요" },
    { error: new HttpError(429, "요청 제한"), title: "로그인을 너무 자주 시도했어요" },
    { error: new HttpError(502, "카카오 오류"), title: "로그인하지 못했어요" },
    { error: new NetworkError(new TypeError("Failed to fetch")), title: "서버에 연결할 수 없어요" },
  ];
  for (const { error, title } of cases) {
    sessionStorage.setItem("auth.kakaoLogin", JSON.stringify({ state: "saved-state", returnTo: "/" }));
    loginWithKakao.mockRejectedValueOnce(error);

    renderCallback("?code=abc&state=saved-state");

    expect(await screen.findByText(title)).toBeTruthy();
    cleanup();
  }
  expect(signIn).not.toHaveBeenCalled();
});

it("동의 화면에서 취소하면 교환하지 않고 원래 경로로 돌아간다", async () => {
  renderCallback("?error=access_denied&error_description=User%20denied&state=saved-state");

  expect(await screen.findByText("도착: /support?region=1")).toBeTruthy();
  expect(loginWithKakao).not.toHaveBeenCalled();
});
