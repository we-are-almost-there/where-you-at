// @vitest-environment jsdom
//
// 1:1 문의 폼이 필수 입력·동의 전에는 보내지 않고, 다듬은 값으로 요청하고, 서버 응답 상태(429·연결 실패)마다
// 알맞은 안내를 보여주며 입력 내용을 남기는지 본다. 저장·요청 제한 자체는 서버 테스트가 맡는다.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../components/error/userError";
import ContactPage from "./ContactPage";
import { createInquiry } from "./helpApi";

vi.mock("./helpApi", () => ({ createInquiry: vi.fn() }));
// AppHeader는 ResizeObserver 같은 브라우저 API를 써서 jsdom에서 그릴 수 없고, 이 테스트의 대상도 아니다.
vi.mock("../../components/layout/AppHeader", () => ({ default: () => null }));

const mockedCreate = vi.mocked(createInquiry);
const CONTENT = "코스 경로가 실제 길과 달라요. 확인 부탁드립니다.";

function renderPage() {
  return render(
    <MemoryRouter>
      <ContactPage />
    </MemoryRouter>,
  );
}

function fillValidForm() {
  fireEvent.change(screen.getByLabelText("문의 유형"), { target: { value: "코스 탐색" } });
  fireEvent.change(screen.getByLabelText("답변 받을 이메일"), { target: { value: "  user@example.com " } });
  fireEvent.change(screen.getByLabelText("문의 내용"), { target: { value: `  ${CONTENT}\n` } });
  fireEvent.click(screen.getByLabelText("위 내용에 동의합니다."));
}

const submitButton = () => screen.getByRole("button", { name: "문의 보내기" }) as HTMLButtonElement;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ContactPage", () => {
  it("필수 항목을 모두 채우고 동의해야 보내기 버튼이 켜진다", () => {
    renderPage();
    expect(submitButton().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("문의 유형"), { target: { value: "코스 탐색" } });
    fireEvent.change(screen.getByLabelText("답변 받을 이메일"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("문의 내용"), { target: { value: "짧아요" } });
    fireEvent.click(screen.getByLabelText("위 내용에 동의합니다."));
    expect(submitButton().disabled).toBe(true); // 내용이 10자 미만

    fireEvent.change(screen.getByLabelText("문의 내용"), { target: { value: CONTENT } });
    expect(submitButton().disabled).toBe(false);

    fireEvent.click(screen.getByLabelText("위 내용에 동의합니다."));
    expect(submitButton().disabled).toBe(true); // 동의 해제
  });

  it("앞뒤 공백을 뺀 값으로 보내고 접수 완료 화면을 보여준다", async () => {
    mockedCreate.mockResolvedValue({ received: true });
    renderPage();

    fillValidForm();
    fireEvent.click(submitButton());

    await screen.findByText("문의가 접수됐어요");
    expect(mockedCreate).toHaveBeenCalledWith({
      category: "코스 탐색",
      email: "user@example.com",
      content: CONTENT,
      agreed: true,
      website: "",
    });
    expect(screen.getByRole("status").textContent).toContain("user@example.com");
    expect(screen.getByRole("link", { name: "고객지원으로" }).getAttribute("href")).toBe("/help");
  });

  it("너무 자주 보내 429가 오면 안내를 보여주고 입력 내용은 남긴다", async () => {
    mockedCreate.mockRejectedValue(new HttpError(429, "1:1 문의 접수 실패 (429)"));
    renderPage();

    fillValidForm();
    fireEvent.click(submitButton());

    await screen.findByText("잠시 후 다시 보내 주세요");
    expect((screen.getByLabelText("문의 내용") as HTMLTextAreaElement).value).toContain(CONTENT);
    expect(submitButton().disabled).toBe(false);
  });

  it("연결에 실패하면 공통 연결 오류 안내를 보여준다", async () => {
    mockedCreate.mockRejectedValue(new TypeError("Failed to fetch"));
    renderPage();

    fillValidForm();
    fireEvent.click(submitButton());

    expect((await screen.findByRole("alert")).textContent).toContain("서버에 연결할 수 없어요");
  });

  it("숨긴 입력칸은 스크린 리더와 탭 이동에서 빠져 있다", () => {
    const { container } = renderPage();

    const honeypot = container.querySelector('input[name="website"]') as HTMLInputElement;
    expect(honeypot.tabIndex).toBe(-1);
    expect(honeypot.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("동의 안내에 수집 항목·보유 기간을 보여준다", () => {
    renderPage();

    const consent = screen.getByRole("region", { name: "개인정보 수집·이용 동의 (필수)" });
    expect(consent.textContent).toContain("이메일, 문의 유형, 문의 내용");
    expect(consent.textContent).toContain("문의 처리 완료 후 1년");
  });

  it("개인정보처리방침은 페이지 이동 없이 팝업으로 열고, 닫으면 입력 내용과 포커스가 돌아온다", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("문의 내용"), { target: { value: CONTENT } });

    const opener = screen.getByRole("button", { name: "개인정보처리방침" });
    fireEvent.click(opener);

    const dialog = screen.getByRole("dialog", { name: "개인정보처리방침" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "닫기" }));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect((screen.getByLabelText("문의 내용") as HTMLTextAreaElement).value).toBe(CONTENT);

    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
