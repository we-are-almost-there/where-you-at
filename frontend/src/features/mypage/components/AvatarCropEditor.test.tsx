// @vitest-environment jsdom
import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AvatarCropEditor from "./AvatarCropEditor";

afterEach(cleanup);

describe("AvatarCropEditor", () => {
  it("Strict Mode에서도 선택한 파일을 안정적인 미리보기 주소로 읽는다", async () => {
    const reselect = vi.fn();
    render(
      <StrictMode>
        <AvatarCropEditor
          file={new File(["image"], "avatar.png", { type: "image/png" })}
          onReselect={reselect}
          onConfirm={vi.fn()}
        />
      </StrictMode>,
    );

    const image = await screen.findByAltText("자를 프로필 사진");
    expect(image.getAttribute("src")).toMatch(/^data:image\/png;base64,/);

    fireEvent.click(screen.getByRole("button", { name: "다시 선택" }));
    expect(reselect).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "프로필 사진 자르기 적용" }).textContent).toBe("적용");
  });
});
