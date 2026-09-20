// 서버에 저장된 기록 카드 이미지를 기기에 저장한다.
// 모바일은 공유 시트(갤러리 저장 포함), 안 되면 파일 다운로드로 대체한다. RecordCard의 save()와 같은 방식이다.

// 다운로드가 시작될 여유를 준 뒤 blob URL을 놓아준다.
const REVOKE_DELAY_MS = 30_000;

/** 클릭 전에 공유할 파일을 준비한다. */
export async function prepareCardImage(imageUrl: string, signal?: AbortSignal): Promise<File> {
  const res = await fetch(imageUrl, { signal });
  if (!res.ok) throw new Error(`이미지 다운로드 실패 (${res.status})`);
  const blob = await res.blob();
  return new File([blob], "record.png", { type: blob.type || "image/png" });
}

/** 클릭 핸들러에서 바로 호출한다. 공유 취소 시 false를 반환한다. */
export async function saveCardImage(file: File): Promise<boolean> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (e) {
      // 사용자가 공유 시트를 닫은 것뿐이면 조용히 끝낸다.
      if (e instanceof DOMException && e.name === "AbortError") return false;
      // 그 밖의 실패는 아래 다운로드로 떨어진다.
    }
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  // 일부 브라우저는 문서에 붙지 않은 링크의 클릭을 무시한다.
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
  return true;
}
