// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// 이 테스트는 App의 라우트 선택만 확인한다. 각 화면의 동작은 해당 기능 테스트가 맡는다.
vi.mock("./features/home", () => ({ Home: () => <h1>홈 화면</h1> }));
vi.mock("./features/map", () => ({
  CourseExplore: () => <h1>코스 탐색 화면</h1>,
  CourseDetail: () => <h1>코스 상세 화면</h1>,
}));
vi.mock("./features/support", () => ({ Support: () => <h1>방문 혜택 화면</h1> }));
vi.mock("./features/race", () => ({ Race: () => <h1>대회 행사 화면</h1> }));
vi.mock("./features/bicycle", () => ({ BicycleExplore: () => <h1>자전거 대여 화면</h1> }));
vi.mock("./features/help", () => ({
  HelpPage: () => <h1>고객지원 화면</h1>,
  NoticeList: () => <h1>공지사항 화면</h1>,
  NoticeDetail: () => <h1>공지사항 상세 화면</h1>,
  FaqPage: () => <h1>자주 묻는 질문 화면</h1>,
  TermsPage: () => <h1>이용약관 화면</h1>,
  PrivacyPage: () => <h1>개인정보처리방침 화면</h1>,
  PrivacyPolicy20260917Page: () => <h1>이전 개인정보처리방침 화면</h1>,
  Terms20260917Page: () => <h1>이전 이용약관 화면</h1>,
  ContactPage: () => <h1>1:1 문의 화면</h1>,
}));
// 실제 NotFoundPage는 유지하고, 라우팅과 무관한 헤더의 브라우저 API 사용만 제외한다.
vi.mock("./components/layout/AppHeader", () => ({ default: () => null }));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("App Not Found 라우트", () => {
  it.each(["/unknown", "/courses/1/unknown"])(
    "알 수 없는 주소 %s에서 Not Found 화면을 보여준다",
    (path) => {
      renderAt(path);

      expect(screen.getByRole("heading", { name: "페이지를 찾을 수 없어요" })).toBeTruthy();
    },
  );

  it("홈으로 가기를 누르면 홈 화면으로 이동한다", () => {
    renderAt("/unknown");

    fireEvent.click(screen.getByRole("link", { name: "홈으로 가기" }));

    expect(screen.getByRole("heading", { name: "홈 화면" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "페이지를 찾을 수 없어요" })).toBeNull();
  });

  it("기존 주소는 Not Found 화면에 가로채이지 않는다", () => {
    renderAt("/courses");

    expect(screen.getByRole("heading", { name: "코스 탐색 화면" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "페이지를 찾을 수 없어요" })).toBeNull();
  });

  it("이전 방침·약관 주소는 이전 버전 화면으로 연결된다", () => {
    renderAt("/privacy/2026-09-17");
    expect(screen.getByRole("heading", { name: "이전 개인정보처리방침 화면" })).toBeTruthy();
    cleanup();

    renderAt("/terms/2026-09-17");
    expect(screen.getByRole("heading", { name: "이전 이용약관 화면" })).toBeTruthy();
  });
});
