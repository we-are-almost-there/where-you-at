"""프로필 사진·기록 카드 업로드에 공통으로 적용하는 요청 본문 제한."""

from fastapi import HTTPException, Request


async def read_upload_body(request: Request, *, max_bytes: int, too_large_detail: str) -> bytes:
    """헤더를 먼저 검사하고, 헤더가 없거나 작게 신고되어도 실제 수신 크기를 제한한다."""
    length = request.headers.get("content-length")
    if length is not None:
        try:
            declared_size = int(length)
        except ValueError:
            raise HTTPException(status_code=400, detail="올바르지 않은 파일 크기입니다.") from None
        if declared_size < 0:
            raise HTTPException(status_code=400, detail="올바르지 않은 파일 크기입니다.")
        if declared_size > max_bytes:
            raise HTTPException(status_code=413, detail=too_large_detail)

    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > max_bytes:
            raise HTTPException(status_code=413, detail=too_large_detail)
        data.extend(chunk)
    if not data:
        raise HTTPException(status_code=400, detail="빈 파일은 올릴 수 없습니다.")
    return bytes(data)
