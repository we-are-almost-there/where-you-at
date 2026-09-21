import { HttpError } from "../../lib/http";
import { toUserError } from "../../components/error/userError";
import { RecordApiError, toRecordUserError } from "./recordsErrors";

export interface StampSaveError { code: string; message: string }

export function stampErrorMessage(error: unknown, fallbackTitle: string): string {
  const { title, description } = error instanceof RecordApiError && [401, 429, 503].includes(error.status)
    ? toRecordUserError(error, fallbackTitle) : toUserError(error, fallbackTitle);
  return [title, description].filter(Boolean).join("\n");
}

export function stampSaveError(code: string, error: unknown): StampSaveError {
  return { code, message: error instanceof HttpError && error.status === 409
    ? "이 지역의 완주 기록이 아직 없어요. 완주 기록을 확인한 뒤 다시 시도해 주세요."
    : stampErrorMessage(error, "스탬프를 찍지 못했어요.") };
}
