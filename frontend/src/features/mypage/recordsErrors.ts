import { HttpError } from "../../lib/http";
import { toUserError, type UserError } from "../../components/error/userError";

const FEATURE_DISABLED = "아직 제공하지 않는 기능입니다.";
const QUOTA_EXCEEDED = "저장할 수 있는 기록 카드 수를 넘었어요.";

/** 이미지 편집으로 해결해야 하는 로컬 검증 실패. */
export class RecordImageValidationError extends Error {}

/** 같은 HTTP 상태라도 원인이 다르므로 백엔드 detail을 함께 보존한다. */
export class RecordApiError extends HttpError {
  readonly detail: unknown;
  constructor(status: number, detail: unknown) {
    super(status, `기록 API 요청 실패 (${status})`);
    this.detail = detail;
  }
}

export async function recordApiError(response: Response): Promise<RecordApiError> {
  const body = await response.json().catch(() => null);
  return new RecordApiError(response.status, body?.detail);
}

/** 명확한 거절 응답만 분류한다. 프록시 5xx·깨진 응답은 저장 실패라고 단정할 수 없다. */
export function isRecordRequestRejected(error: unknown): error is RecordApiError {
  return error instanceof RecordApiError
    && (([400, 401, 403, 404, 409, 413, 422, 429].includes(error.status)
      && (typeof error.detail === "string" || (error.status === 422 && Array.isArray(error.detail))))
      || (error.status === 503 && error.detail === FEATURE_DISABLED));
}

/** 상한·입력·계정·기능 제한은 같은 카드를 다시 보내도 해결되지 않는다. */
export function canRetryCardUpload(error: unknown): boolean {
  if (error instanceof RecordImageValidationError) return false;
  if (!(error instanceof RecordApiError)) return true;
  return !([400, 401, 403, 404, 413, 422].includes(error.status)
    || (error.status === 409 && error.detail === QUOTA_EXCEEDED)
    || (error.status === 503 && error.detail === FEATURE_DISABLED));
}

export function toRecordUserError(error: unknown, fallback: string): UserError {
  if (error instanceof RecordImageValidationError) return { title: error.message, description: "" };
  if (!(error instanceof RecordApiError)) return toUserError(error, fallback);
  let title: string;
  switch (error.status) {
    case 409:
      title = error.detail === QUOTA_EXCEEDED ? QUOTA_EXCEEDED
        : error.detail === "업로드한 이미지가 바뀌었습니다. 다시 시도해 주세요."
          ? "업로드한 이미지가 바뀌었어요. 이미지 저장을 다시 눌러 주세요."
          : "요청을 처리할 수 없어요. 저장 상태를 확인해 주세요.";
      break;
    case 429: title = "요청이 너무 잦아요. 잠시 후 다시 시도해 주세요."; break;
    case 503: title = error.detail === FEATURE_DISABLED
      ? "아직 제공하지 않는 기능이에요. 기기에 이미지를 저장할 수는 있어요."
      : "지금은 기록 서버를 이용할 수 없어요. 잠시 후 다시 시도해 주세요."; break;
    case 422: title = "기록 입력값이 허용 범위를 벗어났어요. 거리·시간·페이스와 기기 시각을 확인해 주세요."; break;
    case 401: title = "로그인이 만료되었어요. 다시 로그인해 주세요."; break;
    case 403: title = "이 기록을 저장하거나 조회할 권한이 없어요."; break;
    case 404: title = "연결할 기록이나 코스를 찾을 수 없어요."; break;
    case 400: title = "이미지 업로드 정보가 올바르지 않아요."; break;
    case 413: title = "카드 이미지는 5MB 이하로 저장해 주세요."; break;
    default: return toUserError(error, fallback);
  }
  return { title, description: "" };
}
