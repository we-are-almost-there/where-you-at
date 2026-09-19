// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, useNavigate } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import ScrollToTop from "./components/layout/ScrollToTop";
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
  return <main id="main-content" tabIndex={-1}>
    <button onClick={() => setIsOpen(true)}>메뉴 열기</button>
    <h1>홈 화면</h1>
    <SidebarDrawer isOpen={isOpen} onClose={() => setIsOpen(false)} />
  </main>;
}) }));
vi.mock("./features/map", () => ({
  CourseExplore: () => <main id="main-content" tabIndex={-1}><h1>코스 탐색 화면</h1><Link to="/courses/1">코스 카드</Link></main>,
  CourseDetail: () => {
    const [loaded, setLoaded] = useState(false);
    return <main id="main-content" tabIndex={-1}>
      <h1>{loaded ? "코스 상세 화면" : "코스 상세"}</h1>
      {!loaded && <p role="status">코스를 불러오는 중…</p>}
      <button onClick={() => setLoaded(true)}>로드 완료</button>
    </main>;
  },
}));
vi.mock("./features/support", () => ({ Support: () => <main id="main-content" tabIndex={-1}><h1>방문 혜택 화면</h1></main> }));
vi.mock("./features/race", () => ({ Race: () => <main id="main-content" tabIndex={-1}><h1>대회 행사 화면</h1></main> }));
vi.mock("./features/bicycle", () => ({ BicycleExplore: () => <main id="main-content" tabIndex={-1}><h1>자전거 대여 화면</h1></main> }));
vi.mock("./features/help", () => ({
  HelpPage: () => <main id="main-content" tabIndex={-1}><h1>고객지원 화면</h1></main>,
  NoticeList: () => <main id="main-content" tabIndex={-1}><h1>공지사항 화면</h1></main>,
  NoticeDetail: () => <main id="main-content" tabIndex={-1}><h1>공지사항 상세 화면</h1></main>,
  FaqPage: () => <main id="main-content" tabIndex={-1}><h1>자주 묻는 질문 화면</h1></main>,
  TermsPage: () => <main id="main-content" tabIndex={-1}><h1>이용약관 화면</h1></main>,
  PrivacyPage: () => <main id="main-content" tabIndex={-1}><h1>개인정보처리방침 화면</h1></main>,
  ContactPage: () => <main id="main-content" tabIndex={-1}><h1>1:1 문의 화면</h1></main>,
}));
// 실제 NotFoundPage는 유지하고, 라우팅과 무관한 헤더의 브라우저 API 사용만 제외한다.
vi.mock("./components/layout/AppHeader", () => ({ default: () => null }));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ScrollToTop /><App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal("scrollTo", vi.fn());
  // jsdom은 레이아웃을 계산하지 않으므로 이 화면들의 제목 영역을 모의한다.
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    return (this.tagName === "H1" ? [new DOMRect(0, 0, 1, 1)] : []) as unknown as DOMRectList;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("사이드바 링크로 이동하면 새 페이지 제목에 포커스를 둔다", () => {
  const root = document.createElement("div");
  root.id = "root";
  document.body.append(root);
  try {
    render(<MemoryRouter><ScrollToTop /><App /></MemoryRouter>, { container: root });
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
] as const)("정적 제목에 포커스를 둔다 (%s)", (link, text) => {
  renderAt("/");
  fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
  fireEvent.click(screen.getByRole("link", { name: link }));
  expect(document.activeElement).toBe(screen.getByText(text));
});

it.each([false, true])("코스 카드 이동 후 제목 로드를 처리한다 (사용자 포커스 이동: %s)", async (moveFocus) => {
  renderAt("/courses");
  fireEvent.click(screen.getByRole("link", { name: "코스 카드" }));
  const heading = screen.getByRole("heading", { level: 1, name: "코스 상세" });
  expect(document.activeElement).toBe(heading);
  const load = screen.getByRole("button", { name: "로드 완료" });
  if (moveFocus) load.focus();
  fireEvent.click(load);
  expect(screen.getByRole("heading", { name: "코스 상세 화면" })).toBe(heading);
  await waitFor(() => expect(document.activeElement).toBe(
    moveFocus ? load : screen.getByRole("heading", { name: "코스 상세 화면" }),
  ));
});

it("홈으로 링크 이동하면 실제 홈 제목에 포커스를 둔다", async () => {
  const homeMock = vi.mocked(Home);
  const originalHome = homeMock.getMockImplementation();
  // jsdom에 없는 엘리먼트 스크롤 API를 배너 캐러셀에 제공한다.
  const originalScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTo");
  Object.defineProperty(Element.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  try {
    const { default: ActualHome } = await vi.importActual<typeof import("./features/home/Home")>("./features/home/Home");
    homeMock.mockImplementation(ActualHome);
    renderAt("/unknown");
    fireEvent.click(screen.getByRole("link", { name: "홈으로 가기" }));
    const heading = await screen.findByRole("heading", { name: "어디까지왔니 홈", level: 1 });
    expect(document.activeElement).toBe(heading);
  } finally {
    cleanup();
    homeMock.mockReset();
    if (originalHome) homeMock.mockImplementation(originalHome);
    if (originalScrollTo) Object.defineProperty(Element.prototype, "scrollTo", originalScrollTo);
    else Reflect.deleteProperty(Element.prototype, "scrollTo");
  }
});

it("뒤로/앞으로 가기도 제목에 포커스를 두고 스크롤 복원을 유지한다", () => {
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
    <ScrollToTop /><App />
  </MemoryRouter>);
  const back = screen.getByRole("button", { name: "뒤로" });
  back.focus();
  fireEvent.click(back);
  expect(screen.getByRole("heading", { name: "코스 탐색 화면" })).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
  expect(window.scrollTo).not.toHaveBeenCalled();
  const forward = screen.getByRole("button", { name: "앞으로" });
  forward.focus();
  fireEvent.click(forward);
  expect(screen.getByRole("heading", { name: "방문 혜택 화면" })).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
  expect(window.scrollTo).not.toHaveBeenCalled();
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
