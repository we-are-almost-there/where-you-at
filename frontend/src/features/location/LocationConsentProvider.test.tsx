// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import LocationConsentProvider, { LOCATION_CONSENT_STORAGE_KEY } from "./LocationConsentProvider";
import { useLocationConsent } from "./locationConsentContext";

function RequestButtons() {
  const { requestConsent } = useLocationConsent();
  const [result, setResult] = useState("요청 전");

  const request = async (promptWhenDeclined = false) => {
    setResult("선택 중");
    const allowed = await requestConsent({ promptWhenDeclined });
    setResult(allowed ? "동의함" : "동의하지 않음");
  };

  return (
    <>
      <button type="button" onClick={() => request()}>
        자동 위치 요청
      </button>
      <button type="button" onClick={() => request(true)}>
        직접 위치 요청
      </button>
      <output>{result}</output>
    </>
  );
}

function renderProvider() {
  return render(
    <MemoryRouter>
      <LocationConsentProvider>
        <RequestButtons />
      </LocationConsentProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("LocationConsentProvider", () => {
  it("첫 위치 요청 전에 사용 목적과 처리 방식을 알리고, 동의를 기억한다", async () => {
    renderProvider();

    fireEvent.click(screen.getByRole("button", { name: "자동 위치 요청" }));

    const dialog = screen.getByRole("dialog", { name: "현재 위치를 사용해도 될까요?" });
    expect(dialog).toBeTruthy();
    expect(screen.getByText(/위치 기반 계산은 기기 안에서/)).toBeTruthy();
    expect(screen.getByText(/서버로 전송하거나 저장하지 않아요/)).toBeTruthy();
    const policyLink = screen.getByRole("link", { name: "개인정보처리방침 보기" });
    expect(policyLink.getAttribute("href")).toBe("/privacy");
    expect(policyLink.getAttribute("target")).toBe("_blank");

    fireEvent.click(screen.getByRole("button", { name: "동의하고 위치 사용" }));

    await waitFor(() => expect(screen.getByText("동의함")).toBeTruthy());
    expect(window.localStorage.getItem(LOCATION_CONSENT_STORAGE_KEY)).toBe("allowed");
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "자동 위치 요청" }));
    await waitFor(() => expect(screen.getByText("동의함")).toBeTruthy());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("거절을 기억해 자동 요청은 막고, 직접 누른 위치 기능에서는 다시 묻는다", async () => {
    renderProvider();

    fireEvent.click(screen.getByRole("button", { name: "자동 위치 요청" }));
    fireEvent.click(screen.getByRole("button", { name: "동의하지 않음" }));

    await waitFor(() => expect(screen.getByText("동의하지 않음")).toBeTruthy());
    expect(window.localStorage.getItem(LOCATION_CONSENT_STORAGE_KEY)).toBe("declined");

    fireEvent.click(screen.getByRole("button", { name: "자동 위치 요청" }));
    await waitFor(() => expect(screen.getByText("동의하지 않음")).toBeTruthy());
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "직접 위치 요청" }));
    expect(screen.getByRole("dialog", { name: "현재 위치를 사용해도 될까요?" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "동의하고 위치 사용" }));
    await waitFor(() => expect(screen.getByText("동의함")).toBeTruthy());
    expect(window.localStorage.getItem(LOCATION_CONSENT_STORAGE_KEY)).toBe("allowed");
  });

  it("Escape는 동의하지 않음으로 처리한다", async () => {
    renderProvider();

    fireEvent.click(screen.getByRole("button", { name: "자동 위치 요청" }));
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.getByText("동의하지 않음")).toBeTruthy());
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
