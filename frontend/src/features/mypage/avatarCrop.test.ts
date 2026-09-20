import { describe, expect, it } from "vitest";
import { clampCropOffset, cropLayout, cropSourceRect } from "./avatarCrop";

describe("avatarCrop", () => {
  it("가로 사진을 정사각형에 채우고 좌우 이동 범위를 계산한다", () => {
    expect(cropLayout({ width: 400, height: 200 }, 200, 1)).toEqual({
      scale: 1,
      width: 400,
      height: 200,
      maxX: 100,
      maxY: 0,
    });
  });

  it("사진이 크롭 영역 밖으로 빠져나가지 않게 이동값을 제한한다", () => {
    const layout = cropLayout({ width: 400, height: 200 }, 200, 1);
    expect(clampCropOffset({ x: 180, y: -30 }, layout)).toEqual({ x: 100, y: 0 });
  });

  it("미리보기의 이동과 확대를 원본 이미지 좌표로 바꾼다", () => {
    // 400×200 사진을 2배 확대하면 원본의 100×100 영역을 쓰고, 화면에서 오른쪽으로 20px 움직이면
    // 원본에서는 중심보다 왼쪽 10px 지점을 고른다.
    expect(cropSourceRect({ width: 400, height: 200 }, 200, 2, { x: 20, y: 0 })).toEqual({
      x: 140,
      y: 50,
      size: 100,
    });
  });
});
