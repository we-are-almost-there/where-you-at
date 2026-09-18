// @vitest-environment jsdom
//
// 마이페이지가 로그인 상태에 따라 알맞은 화면을 보여 주고, 프로필 수정·로그아웃·탈퇴가
// 로그인 저장소(features/auth)의 함수로 이어지는지 본다. 저장소 동작 자체는 auth/useAuth.test.ts가 맡는다.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../lib/http";
import { signOut, startKakaoLogin, updateProfile, useAuth, withdraw, type AuthState } from "../auth";
import MyPage from "./MyPage";
import { fetchSavedCourses, getRecords, getStamps } from "./mypageData";
import type { Course } from "../map/types";
import type { RunRecord } from "./types";

vi.mock("../auth", () => ({
  useAuth: vi.fn(),
  signOut: vi.fn(),
  startKakaoLogin: vi.fn(),
  updateProfile: vi.fn(),
  withdraw: vi.fn(),
}));
vi.mock("./mypageData", () => ({
  fetchSavedCourses: vi.fn(),
  getRecords: vi.fn(),
  getRecordCards: vi.fn(),
  getStamps: vi.fn(),
}));
// 스탬프 지도는 도형 파일을 불러오므로 여기서는 열리는지만 본다. 지도 동작은 StampMapDialog.test.tsx가 맡는다.
vi.mock("./components/StampMapDialog", () => ({
  default: () => <div role="dialog" aria-label="스탬프 지도" />,
}));
// AppHeader는 ResizeObserver 같은 브라우저 API를 써서 jsdom에서 그릴 수 없고, 이 테스트의 대상도 아니다.
vi.mock("../../components/layout/AppHeader", () => ({ default: () => null }));

const SIGNED_IN: AuthState = { status: "signedIn", user: { id: 7, nickname: "길손" } };
const mockedUseAuth = vi.mocked(useAuth);

function renderPage(path = "/mypage") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MyPage />
    </MemoryRouter>,
  );
}

function course(id: number): Course {
  return {
    id,
    title: `코스 ${id}`,
    start_address: "강원 춘천시",
    image_url: "",
    region_code: "51110",
    is_population_drop_zone: false,
    landmarks: [],
    routes: [{ route_type: "도보", distance: 5, estimated_time: 60, difficulty: "쉬움" }],
    path_trail: [],
    path_bicycle: [],
  };
}

function record(id: number): RunRecord {
  return {
    id,
    courseId: id,
    courseName: `코스 ${id}`,
    routeType: "도보",
    distanceKm: 5,
    durationMs: 3_000_000,
    paceSecPerKm: 600,
    finishedAt: "2026-09-16T07:40:00+09:00",
  };
}

beforeEach(() => {
  mockedUseAuth.mockReturnValue(SIGNED_IN);
  vi.mocked(fetchSavedCourses).mockResolvedValue([]);
  vi.mocked(getRecords).mockReturnValue([]);
  vi.mocked(getStamps).mockReturnValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MyPage", () => {
  it("로그아웃 상태면 로그인 안내를 보여 주고, 로그인 뒤 마이페이지로 돌아오게 한다", () => {
    mockedUseAuth.mockReturnValue({ status: "signedOut", user: null });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "카카오로 로그인" }));

    expect(startKakaoLogin).toHaveBeenCalledWith("/mypage");
    expect(screen.queryByRole("region", { name: /찜한 코스/ })).toBeNull();
  });

  it("로그인 상태면 프로필과 찜·기록·스탬프 영역을 보여 준다", async () => {
    renderPage();

    expect(screen.getByText("길손")).toBeTruthy();
    expect(await screen.findByText("아직 찜한 코스가 없어요")).toBeTruthy();
    expect(screen.getByRole("region", { name: /내 기록/ })).toBeTruthy();
    expect(screen.getByRole("region", { name: /지역 스탬프/ })).toBeTruthy();
    // 비어 있으면 전체 보기로 보내지 않는다.
    expect(screen.queryByRole("link", { name: /전체 보기/ })).toBeNull();
    // 기록이 없으면 활동 요약 태그는 첫 완주를 권하는 하나뿐이다.
    expect(within(screen.getByRole("list", { name: "활동 요약" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "#첫완주에도전",
    ]);
  });

  it("한 줄 소개가 있으면 보여 주고, 없으면 적어 보라는 버튼으로 프로필 수정을 연다", () => {
    mockedUseAuth.mockReturnValue({ status: "signedIn", user: { id: 7, nickname: "길손", bio: "주말마다 한강을 걸어요" } });
    const view = renderPage();
    expect(screen.getByText("주말마다 한강을 걸어요")).toBeTruthy();
    view.unmount();

    mockedUseAuth.mockReturnValue(SIGNED_IN);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "한 줄 소개를 적어 보세요" }));
    expect(screen.getByRole("dialog", { name: "프로필 수정" })).toBeTruthy();
  });

  it("닉네임이 없으면 '회원'으로 보여 준다", () => {
    mockedUseAuth.mockReturnValue({ status: "signedIn", user: { id: 7, nickname: null } });
    renderPage();

    expect(screen.getByText("회원")).toBeTruthy();
  });

  it("찜한 코스는 최근 5개, 기록은 최근 7개만 보여 주고 전체 보기로 이어 준다", async () => {
    vi.mocked(fetchSavedCourses).mockResolvedValue(Array.from({ length: 7 }, (_, i) => course(i + 1)));
    vi.mocked(getRecords).mockReturnValue(Array.from({ length: 9 }, (_, i) => record(i + 1)));
    renderPage();

    const saved = screen.getByRole("region", { name: /찜한 코스/ });
    await waitFor(() => expect(within(saved).getAllByRole("listitem")).toHaveLength(5));
    expect(within(saved).getByRole("link", { name: "찜한 코스 전체 보기" }).getAttribute("href")).toBe("/mypage/saved");

    const records = screen.getByRole("region", { name: /내 기록/ });
    expect(within(records).getAllByRole("listitem")).toHaveLength(7);
    expect(within(records).getByRole("link", { name: "내 기록 전체 보기" }).getAttribute("href")).toBe("/mypage/records");
  });

  it("스탬프는 현재 행정구역의 16개 시도로 묶어 보여 준다", () => {
    vi.mocked(getStamps).mockReturnValue([
      { sigunguCode: "12330", collectedAt: "2026-08-29" },
      { sigunguCode: "12730", collectedAt: "2026-09-03" },
      { sigunguCode: "51110", collectedAt: "2026-09-13" },
    ]);
    renderPage();

    expect(screen.getByRole("progressbar", { name: "모은 시도 스탬프" }).getAttribute("aria-valuetext")).toBe(
      "시도 16곳 중 2곳, 시군구 230곳 중 3곳",
    );
    expect(screen.getByText("전남광주통합특별시 시군구 27곳 중 2곳")).toBeTruthy();
    expect(screen.getByText("강원특별자치도 시군구 18곳 중 1곳")).toBeTruthy();
  });

  it("스탬프 찍기 버튼은 스탬프 지도를 연다", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "스탬프 찍기" }));

    expect(screen.getByRole("dialog", { name: "스탬프 지도" })).toBeTruthy();
  });

  it("로그아웃 버튼은 저장소의 signOut을 부른다", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe("프로필 수정", () => {
  function openDialog() {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "프로필 수정" }));
    return screen.getByRole("dialog", { name: "프로필 수정" });
  }

  it("비운 채로 저장하면 요청하지 않고 안내한다", () => {
    openDialog();
    fireEvent.change(screen.getByLabelText("닉네임"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(updateProfile).not.toHaveBeenCalled();
    expect(screen.getByText("닉네임을 적어 주세요.")).toBeTruthy();
  });

  it("닉네임은 20자에서 입력이 멈춘다", () => {
    openDialog();
    const input = screen.getByLabelText("닉네임") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "가".repeat(25) } });

    expect(input.value).toBe("가".repeat(20));
    expect(screen.getByText("20/20")).toBeTruthy();
  });

  it("한글을 조합하는 동안에는 자르지 않고, 조합이 끝나면 자른다", () => {
    openDialog();
    const input = screen.getByLabelText(/한 줄 소개/) as HTMLInputElement;
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "가".repeat(41) } });
    expect(input.value).toBe("가".repeat(41));

    fireEvent.compositionEnd(input);
    expect(input.value).toBe("가".repeat(40));
  });

  it("연속 공백은 한 칸으로 줄여 입력되고 저장된다", async () => {
    vi.mocked(updateProfile).mockResolvedValue();
    openDialog();
    const input = screen.getByLabelText(/한 줄 소개/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "안녕하세요!!     러닝 좋아요" } });
    expect(input.value).toBe("안녕하세요!! 러닝 좋아요");

    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ bio: "안녕하세요!! 러닝 좋아요" }));
  });

  it("앞뒤 공백을 지운 닉네임으로 저장하고 대화상자를 닫는다", async () => {
    vi.mocked(updateProfile).mockResolvedValue();
    openDialog();
    fireEvent.change(screen.getByLabelText("닉네임"), { target: { value: "  새 이름 " } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(updateProfile).toHaveBeenCalledWith({ nickname: "새 이름" });
  });

  it("한 줄 소개만 바꾸면 소개만 보낸다", async () => {
    vi.mocked(updateProfile).mockResolvedValue();
    openDialog();
    fireEvent.change(screen.getByLabelText(/한 줄 소개/), { target: { value: " 주말마다 한강을 걸어요 " } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(updateProfile).toHaveBeenCalledWith({ bio: "주말마다 한강을 걸어요" });
  });

  it("한 줄 소개를 비우면 빈 값을 보내 지운다", async () => {
    mockedUseAuth.mockReturnValue({ status: "signedIn", user: { id: 7, nickname: "길손", bio: "안녕하세요" } });
    vi.mocked(updateProfile).mockResolvedValue();
    openDialog();
    fireEvent.change(screen.getByLabelText(/한 줄 소개/), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ bio: "" }));
  });

  it("바꾸지 않고 저장하면 요청 없이 닫는다", () => {
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(updateProfile).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("저장에 실패하면 안내하고 입력한 값을 남긴다", async () => {
    vi.mocked(updateProfile).mockRejectedValue(new HttpError(500, "실패"));
    openDialog();
    fireEvent.change(screen.getByLabelText("닉네임"), { target: { value: "새 이름" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("저장하지 못했어요. 잠시 후 다시 시도해 주세요.")).toBeTruthy();
    expect((screen.getByLabelText("닉네임") as HTMLInputElement).value).toBe("새 이름");
  });
});

describe("회원 탈퇴", () => {
  it("확인 대화상자는 취소 버튼에 초점을 두고, 취소하면 탈퇴하지 않는다", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "회원 탈퇴" }));

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "취소" }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(withdraw).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("탈퇴가 끝나면 로그인 안내 대신 탈퇴 완료 안내를 보여 준다", async () => {
    vi.mocked(withdraw).mockResolvedValue();
    const view = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "회원 탈퇴" }));
    fireEvent.click(screen.getByRole("button", { name: "탈퇴하기" }));
    await waitFor(() => expect(withdraw).toHaveBeenCalledTimes(1));

    // 실제 저장소는 탈퇴 뒤 로그아웃 상태를 알린다.
    mockedUseAuth.mockReturnValue({ status: "signedOut", user: null });
    await act(async () => {
      view.rerender(
        <MemoryRouter initialEntries={["/mypage"]}>
          <MyPage />
        </MemoryRouter>,
      );
    });

    expect(screen.getByText("탈퇴가 끝났어요")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "카카오로 로그인" })).toBeNull();
  });

  it("탈퇴에 실패하면 안내하고 대화상자를 남긴다", async () => {
    vi.mocked(withdraw).mockRejectedValue(new HttpError(502, "실패"));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "회원 탈퇴" }));
    fireEvent.click(screen.getByRole("button", { name: "탈퇴하기" }));

    expect((await screen.findByRole("alert")).textContent).toBe("탈퇴를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
