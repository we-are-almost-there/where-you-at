const BLOCK_SIZE = 5;

// 현재 페이지가 속한 블록의 시작·끝·번호 목록을 계산한다.
export function pageBlock(page: number, totalPages: number, blockSize = BLOCK_SIZE) {
  const blockStart = Math.floor((page - 1) / blockSize) * blockSize + 1;
  const blockEnd = Math.min(blockStart + blockSize - 1, totalPages);
  const pages = Array.from({ length: blockEnd - blockStart + 1 }, (_, i) => blockStart + i);
  return { blockStart, blockEnd, pages };
}
