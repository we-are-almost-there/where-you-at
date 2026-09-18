// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { useState } from "react";
import SidebarDrawer from "./components/layout/SidebarDrawer";
import { Home } from "./features/home";

vi.mock("./features/home/homeApi", () => ({
  fetchFeaturedCourses: async () => [],
  fetchNearbyCourses: async () => ({ items: [], isFallback: true }),
  fetchUpcomingRaces: async () => [],
}));

// App의 라우트 선택과 화면 전환 시 포커스 관리를 확인한다.
vi.mock("./features/home", () => ({ Home: vi.fn(() => {
  const [isOpen, setIsOpen] = useState(false);
  return <div>
    <button onClick={() => setIsOpen(true)}>메뉴 열기</button>
    <h1>홈 화면</h1>
    <SidebarDrawer isOpen={isOpen} onClose={() => setIsOpen(false)} />
  </div>;
}) }));
vi.mock("./features/map", () => ({
  CourseExplore: () => <h1>코스 탐색 화면</h1>,
  CourseDetail: () => <h1>코스 상세 화면</h1>,
}));
vi.mock("./features/support", () => ({ Support: () => <main>방문 혜택 화면</main> }));
vi.mock("./features/race", () => ({ Race: () => <h1>대회 행사 화면</h1> }));
vi.mock("./features/bicycle", () => ({ BicycleExplore: () => <div>자전거 대여 화면</div> }));
vi.mock("./features/help", () => ({
  HelpPage: () => <h1>고객지원 화면</h1>,
  NoticeList: () => <h1>공지사항 화면</h1>,
  NoticeDetail: () => <h1>공지사항 상세 화면</h1>,
  FaqPage: () => <h1>자주 묻는 질문 화면</h1>,
  TermsPage: () => <h1>이용약관 화면</h1>,
  PrivacyPage: () => <h1>개인정보처리방침 화면</h1>,
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

it("사이드바 링크로 이동하면 새 페이지 제목에 포커스를 둔다", () => {
  const root = document.createElement("div");
  root.id = "root";
  document.body.append(root);
  try {
    render(<MemoryRouter><App /></MemoryRouter>, { container: root });
    const opener = screen.getByRole("button", { name: "메뉴 열기" });
    opener.focus();
    fireEvent.click(opener);
    expect(root.hasAttribute("inert")).toBe(true);
    fireEvent.click(screen.getByRole("link", { name: /COURSE/ }));
    const heading = screen.getByRole("heading", { name: "코스 탐색 화면" });
    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(root.hasAttribute("inert")).toBe(false);
    expect(opener.isConnected).toBe(false);
  } finally {
    cleanup();
    root.remove();
  }
});

it("사이드바 닫기 버튼은 메뉴 버튼으로 포커스를 복귀한다", () => {
  renderAt("/");
  const opener = screen.getByRole("button", { name: "메뉴 열기" });
  opener.focus();
  fireEvent.click(opener);
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  expect(document.activeElement).toBe(opener);
});

it.each([
  [/SUPPORT/, "방문 혜택 화면"],
  [/RENTAL/, "자전거 대여 화면"],
] as const)("제목이 없으면 본문 또는 페이지 컨테이너에 포커스를 둔다 (%s)", (link, text) => {
  renderAt("/");
  fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
  fireEvent.click(screen.getByRole("link", { name: link }));
  expect(document.activeElement).toBe(screen.getByText(text));
});

it("홈으로 링크 이동하면 실제 홈 제목에 포커스를 둔다", async () => {
  const { default: ActualHome } = await vi.importActual<typeof import("./features/home/Home")>("./features/home/Home");
  vi.mocked(Home).mockImplementationOnce(ActualHome);
  renderAt("/unknown");
  fireEvent.click(screen.getByRole("link", { name: "홈으로 가기" }));
  const heading = await screen.findByRole("heading", { name: "어디까지 왔니 홈", level: 1 });
  expect(document.activeElement).toBe(heading);
});

it("뒤로/앞으로 가기는 포커스를 강제로 이동하지 않는다", () => {
  function HistoryControls() {
    const navigate = useNavigate();
    return <>
      <button onClick={() => navigate(-1)}>뒤로</button>
      <button onClick={() => navigate(1)}>앞으로</button>
      <button onClick={() => navigate("/races")}>대회로 이동</button>
    </>;
  }
  render(<MemoryRouter initialEntries={["/courses", "/support"]} initialIndex={1}>
    <HistoryControls />
    <App />
  </MemoryRouter>);
  const back = screen.getByRole("button", { name: "뒤로" });
  back.focus();
  fireEvent.click(back);
  expect(screen.getByRole("heading", { name: "코스 탐색 화면" })).toBeTruthy();
  expect(document.activeElement).toBe(back);
  const forward = screen.getByRole("button", { name: "앞으로" });
  forward.focus();
  fireEvent.click(forward);
  expect(screen.getByRole("main")).toBeTruthy();
  expect(document.activeElement).toBe(forward);
  fireEvent.click(screen.getByRole("button", { name: "대회로 이동" }));
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "대회 행사 화면" }));
});

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
});
