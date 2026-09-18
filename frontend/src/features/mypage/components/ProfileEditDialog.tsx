import { useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { updateProfile, type ProfileChanges, type User } from "../../auth";
import { HttpError, NetworkError } from "../../../lib/http";
import ProfileAvatar from "./ProfileAvatar";
import ModalDialog from "../../../components/common/ModalDialog";
import { charLength, limitInput, toOneLine } from "../oneLineText";

// 서버(backend/app/schemas/user.py NICKNAME_MAX_LENGTH·BIO_MAX_LENGTH)와 같은 값. 바꾸면 두 곳을 함께 고친다.
export const NICKNAME_MAX_LENGTH = 20;
export const BIO_MAX_LENGTH = 40;

interface Props {
  user: User;
  onClose: () => void;
  /** 저장에 성공하면 부른다. 화면낭독기 알림에 쓴다. */
  onSaved: () => void;
}

type Field = "nickname" | "bio";

// 입력칸이 최대 글자에서 멈추므로 글자 수 초과는 보통 여기까지 오지 않는다. 붙여넣기 도중 등 예외에 대비해 남겨 둔다.
function validate(nickname: string, bio: string): { field: Field; message: string } | null {
  const name = toOneLine(nickname);
  if (name.length === 0) return { field: "nickname", message: "닉네임을 적어 주세요." };
  if (charLength(name) > NICKNAME_MAX_LENGTH) return { field: "nickname", message: `닉네임은 ${NICKNAME_MAX_LENGTH}자까지 쓸 수 있어요.` };
  if (charLength(toOneLine(bio)) > BIO_MAX_LENGTH) return { field: "bio", message: `한 줄 소개는 ${BIO_MAX_LENGTH}자까지 쓸 수 있어요.` };
  return null;
}

function saveErrorMessage(error: unknown): string {
  if (error instanceof NetworkError) return "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";
  if (error instanceof HttpError && error.status === 422) return "쓸 수 없는 문자가 들어 있어요. 다른 내용으로 적어 주세요.";
  return "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

/**
 * 프로필 수정. 닉네임과 한 줄 소개를 바꾼다. 바뀐 칸만 서버에 보낸다.
 * 한 줄 소개는 나중에 쪽지·리뷰에서 작성자 소개로 쓸 예정이라, 다른 사람에게 보일 수 있다고 안내한다.
 * 프로필 사진 업로드(R2, #161)가 들어오면 아바타 아래에 "사진 변경"·"기본 이미지로" 버튼을 붙인다.
 */
export default function ProfileEditDialog({ user, onClose, onSaved }: Props) {
  const nicknameId = useId();
  const bioId = useId();
  const errorId = useId();
  const nicknameRef = useRef<HTMLInputElement>(null);
  const bioRef = useRef<HTMLInputElement>(null);
  const [nickname, setNickname] = useState(user.nickname ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [error, setError] = useState<{ field: Field | null; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const focusField = (field: Field | null) => (field === "bio" ? bioRef : nicknameRef).current?.focus();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = validate(nickname, bio);
    if (invalid) {
      setError(invalid);
      focusField(invalid.field);
      return;
    }
    const changes: ProfileChanges = {};
    // 서버와 같은 규칙(앞뒤 공백 제거, 연속 공백 한 칸)으로 맞춘 값을 비교하고 보낸다.
    if (toOneLine(nickname) !== (user.nickname ?? "")) changes.nickname = toOneLine(nickname);
    if (toOneLine(bio) !== (user.bio ?? "")) changes.bio = toOneLine(bio);
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateProfile(changes);
      onSaved();
      onClose();
    } catch (err) {
      // 401이면 useAuth가 로그아웃해 이 대화상자는 페이지와 함께 사라지고, 로그인 안내가 대신 뜬다.
      setError({ field: null, message: saveErrorMessage(err) });
      setSaving(false);
      nicknameRef.current?.focus();
    }
  };

  const clearError = () => {
    if (error) setError(null);
  };

  return (
    <ModalDialog title="프로필 수정" onClose={onClose} initialFocusRef={nicknameRef} busy={saving}>
      <form onSubmit={handleSubmit} noValidate>
        <div className="flex justify-center pb-5 pt-1">
          <ProfileAvatar size="lg" />
        </div>

        <TextField
          id={nicknameId}
          inputRef={nicknameRef}
          label="닉네임"
          value={nickname}
          max={NICKNAME_MAX_LENGTH}
          autoComplete="nickname"
          errorId={error?.field === "nickname" ? errorId : undefined}
          onChange={(value) => {
            setNickname(value);
            clearError();
          }}
        />

        <div className="mt-4">
          <TextField
            id={bioId}
            inputRef={bioRef}
            label="한 줄 소개"
            optional
            value={bio}
            max={BIO_MAX_LENGTH}
            placeholder="예: 주말마다 한강을 걸어요"
            autoComplete="off"
            hint="쪽지나 리뷰에서 다른 사람에게 보일 수 있어요."
            errorId={error?.field === "bio" ? errorId : undefined}
            onChange={(value) => {
              setBio(value);
              clearError();
            }}
          />
        </div>

        <p id={errorId} className="mt-3 min-h-[1lh] text-[12px] text-danger" aria-live="polite">
          {error?.message}
        </p>

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-11 flex-1 cursor-pointer rounded-lg border border-control-border text-[15px] font-bold text-ink hover:bg-control-hover disabled:cursor-default disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-11 flex-1 cursor-pointer rounded-lg bg-accent text-[15px] font-bold text-white hover:bg-accent-strong disabled:cursor-default disabled:opacity-60"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}

interface TextFieldProps {
  id: string;
  inputRef: RefObject<HTMLInputElement | null>;
  label: string;
  optional?: boolean;
  value: string;
  max: number;
  placeholder?: string;
  autoComplete: string;
  hint?: string;
  /** 이 칸에 오류가 있으면 오류 문구의 id. */
  errorId?: string;
  onChange: (value: string) => void;
}

/**
 * 한 줄 입력칸. 아래에 안내(있으면)와 "글자 수/최대"를 둔다.
 * 연속 공백은 한 칸으로 줄이고 max 글자에서 입력을 멈춘다(limitInput).
 * maxLength 속성을 쓰지 않는 이유: 한글을 조합하는 도중 마지막 글자가 잘리거나 한 글자 더 들어가는 브라우저가 있다.
 * 그래서 조합하는 동안에는 그대로 받고, 조합이 끝날 때(compositionend) 자른다.
 */
function TextField({ id, inputRef, label, optional, value, max, placeholder, autoComplete, hint, errorId, onChange }: TextFieldProps) {
  const counterId = `${id}-counter`;
  const hintId = `${id}-hint`;
  const composingRef = useRef(false);
  const length = charLength(toOneLine(value));
  const describedBy = [errorId, hint && hintId, counterId].filter(Boolean).join(" ");
  return (
    <>
      <label htmlFor={id} className="block text-[14px] font-bold text-ink">
        {label}
        {optional && <span className="ml-1 text-[12px] font-normal text-caption">(선택)</span>}
      </label>
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          onChange(composingRef.current ? next : limitInput(next, max));
        }}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          onChange(limitInput(event.currentTarget.value, max));
        }}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={errorId ? true : undefined}
        aria-describedby={describedBy}
        className="mt-2 h-11 w-full rounded-lg border border-input-border px-3 text-[15px] text-ink outline-none placeholder:text-caption focus:border-accent aria-[invalid=true]:border-danger"
      />
      <div className="mt-1.5 flex items-start justify-between gap-3 text-[12px]">
        <p id={hintId} className="text-caption">
          {hint}
        </p>
        <p id={counterId} className={`shrink-0 ${length > max ? "text-danger" : "text-caption"}`}>
          <span className="sr-only">최대 {max}자 중 </span>
          {length}/{max}
        </p>
      </div>
    </>
  );
}
