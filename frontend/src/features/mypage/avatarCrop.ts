export interface CropOffset {
  x: number;
  y: number;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export const AVATAR_OUTPUT_SIZE = 512;

/** 화면의 크롭 영역을 빈 곳 없이 덮는 배율과 이동 가능한 범위를 계산한다. */
export function cropLayout(dimensions: ImageDimensions, viewport: number, zoom: number) {
  const scale = Math.max(viewport / dimensions.width, viewport / dimensions.height) * zoom;
  const width = dimensions.width * scale;
  const height = dimensions.height * scale;
  return {
    scale,
    width,
    height,
    maxX: Math.max(0, (width - viewport) / 2),
    maxY: Math.max(0, (height - viewport) / 2),
  };
}

export function clampCropOffset(offset: CropOffset, layout: ReturnType<typeof cropLayout>): CropOffset {
  return {
    x: layout.maxX === 0 ? 0 : Math.max(-layout.maxX, Math.min(layout.maxX, offset.x)),
    y: layout.maxY === 0 ? 0 : Math.max(-layout.maxY, Math.min(layout.maxY, offset.y)),
  };
}

export function cropSourceRect(
  dimensions: ImageDimensions,
  viewport: number,
  zoom: number,
  offset: CropOffset,
) {
  const layout = cropLayout(dimensions, viewport, zoom);
  const size = viewport / layout.scale;
  return {
    x: (dimensions.width - size) / 2 - offset.x / layout.scale,
    y: (dimensions.height - size) / 2 - offset.y / layout.scale,
    size,
  };
}

/** 미리보기에서 보이는 정사각형을 512×512 WebP 파일로 만든다. */
export async function createCroppedAvatar(
  image: HTMLImageElement,
  viewport: number,
  zoom: number,
  offset: CropOffset,
): Promise<File> {
  const source = cropSourceRect(
    { width: image.naturalWidth, height: image.naturalHeight },
    viewport,
    zoom,
    offset,
  );
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_OUTPUT_SIZE;
  canvas.height = AVATAR_OUTPUT_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("이미지를 편집할 수 없습니다.");
  context.drawImage(
    image,
    source.x,
    source.y,
    source.size,
    source.size,
    0,
    0,
    AVATAR_OUTPUT_SIZE,
    AVATAR_OUTPUT_SIZE,
  );
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
  if (!blob) throw new Error("이미지를 만들 수 없습니다.");
  return new File([blob], "avatar.webp", { type: "image/webp", lastModified: Date.now() });
}
