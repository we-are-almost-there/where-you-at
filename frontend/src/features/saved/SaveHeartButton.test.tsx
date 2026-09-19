// @vitest-environment jsdom
// 찜(하트) 버튼 테스트 (vitest, 저장소와 로그인 mock).
//
// 테스트 범위:
//   - 로그인하지 않았으면 누를 때 찜하지 않고 로그인(만 14세 확인)으로 보낸다
//   - 로그인했으면 토글을 부르고, 찜 여부에 따라 이름과 aria-pressed가 바뀐다
//   - 무엇을 찜했는지 모르는 동안과 보내는 중에는 누를 수 없다
//   - 실패하면 화면낭독기용 안내를 남긴다
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../auth";
import SaveHeartButton from "./SaveHeartButton";
import { toggleSavedCourse, useSavedCourse } from "./savedStore";

const login = vi.fn();

vi.mock("../auth", () => ({
  useAuth: vi.fn(),
  useKakaoLogin: () => ({ login, dialog: null }),
}));

vi.mock("./savedStore", () => ({
  useSavedCourse: vi.fn(),
  toggleSavedCourse: vi.fn(),
  ensureSavedKeysLoaded: vi.fn(),
  clearSavedKeys: vi.fn(),
}));

function renderButton() {
  render(
    <MemoryRouter initialEntries={["/courses?page=2"]}>
      <SaveHeartButton courseId={12} courseTitle="해파랑길 1코스" routeType="자전거" />
    </MemoryRouter>,
  );
}

function signedIn(saved: boolean | undefined, busy = false) {
  vi.mocked(useAuth).mockReturnValue({ status: "signedIn", user: { id: 7, nickname: "길손" } });
  vi.mocked(useSavedCourse).mockReturnValue({ saved, busy });
}

beforeEach(() => {
  vi.mocked(toggleSavedCourse).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SaveHeartButton", () => {
  it("로그인하지 않았으면 누를 때 찜하지 않고 보던 화면으로 돌아오게 로그인을 시작한다", async () => {
    vi.mocked(useAuth).mockReturnValue({ status: "signedOut", user: null });
    vi.mocked(useSavedCourse).mockReturnValue({ saved: undefined, busy: false });
    renderButton();

    const button = screen.getByRole("button", { name: "해파랑길 1코스 찜하기" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    button.click();

    expect(login).toHaveBeenCalledWith("/courses?page=2");
    expect(toggleSavedCourse).not.toHaveBeenCalled();
  });

  it("로그인했으면 누를 때 찜을 토글한다", () => {
    signedIn(false);
    renderButton();

    screen.getByRole("button", { name: "해파랑길 1코스 찜하기" }).click();

    expect(toggleSavedCourse).toHaveBeenCalledWith(12, "자전거");
    expect(login).not.toHaveBeenCalled();
  });

  it("찜한 코스는 이름과 aria-pressed가 해제로 바뀐다", () => {
    signedIn(true);
    renderButton();

    const button = screen.getByRole("button", { name: "해파랑길 1코스 찜 해제" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("무엇을 찜했는지 모르는 동안과 보내는 중에는 누를 수 없다", () => {
    signedIn(undefined);
    renderButton();
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
    cleanup();

    signedIn(true, true);
    renderButton();
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
  });

  it("로그인 정보를 확인하는 동안에는 누를 수 없고 로그인을 다시 시작하지 않는다", () => {
    vi.mocked(useAuth).mockReturnValue({ status: "loading", user: null });
    vi.mocked(useSavedCourse).mockReturnValue({ saved: undefined, busy: false });
    renderButton();

    const button = screen.getByRole("button");
    expect(button.hasAttribute("disabled")).toBe(true);
    button.click();
    expect(login).not.toHaveBeenCalled();
  });

  it("실패하면 안내를 남긴다", async () => {
    signedIn(false);
    vi.mocked(toggleSavedCourse).mockRejectedValue(new Error("500"));
    renderButton();

    screen.getByRole("button").click();

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("찜하지 못했어요"));
  });
});
