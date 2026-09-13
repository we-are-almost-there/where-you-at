import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ChevronDown, CircleCheck } from "lucide-react";
import DocumentPage from "../../components/layout/DocumentPage";
import { HttpError, toUserError, type UserError } from "../../components/error/userError";
import { createInquiry } from "./helpApi";
import PrivacyPolicyDialog from "./PrivacyPolicyDialog";
import { INQUIRY_CATEGORIES, type InquiryCategory } from "./types";

// 서버 검증(backend/app/schemas/inquiry.py)과 같은 규칙. 화면에서 먼저 막아 불필요한 요청을 줄이고,
// 최종 판단은 서버가 한다.
const CONTENT_MIN = 10;
const CONTENT_MAX = 2000;
const EMAIL_MAX = 254;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// 코스 필터 검색칸(CourseFilters)과 같은 입력칸 모양
const INPUT_CLASS =
  "w-full rounded-lg border border-divider bg-white px-3.5 py-2.5 text-[14px] text-ink placeholder:text-caption focus:border-accent focus:outline-none";
// 라벨은 제목·동의 섹션 제목과 같은 ink. accent는 오류 안내와 보내기 버튼에만 써서 눈에 띄게 한다.
const FIELD_LABEL_CLASS = "text-[12px] font-bold text-ink";

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "done"; email: string }
  | { status: "error"; error: UserError };

/** 서버 응답 상태에 맞춰 안내를 고른다. 입력한 내용은 지우지 않으므로 다시 보내기만 하면 된다. */
function toInquiryError(err: unknown): UserError {
  if (err instanceof HttpError && err.status === 429) {
    return {
      title: "잠시 후 다시 보내 주세요",
      description: "짧은 시간에 문의를 여러 번 보냈어요.\n10분쯤 지나서 다시 시도해 주세요.",
    };
  }
  if (err instanceof HttpError && err.status === 422) {
    return {
      title: "입력한 내용을 확인해 주세요",
      description: "이메일 형식과 문의 내용 길이(10자 이상 2000자 이하)를 다시 확인해 주세요.",
    };
  }
  return toUserError(err, "문의를 보내지 못했어요");
}

export default function ContactPage() {
  const [category, setCategory] = useState<InquiryCategory | "">("");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [content, setContent] = useState("");
  const [agreed, setAgreed] = useState(false);
  // 스팸 방지용 숨긴 입력칸. 사람은 볼 수도 포커스할 수도 없어 늘 비어 있고, 폼을 자동으로 채우는 봇만 값을 넣는다.
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<SubmitState>({ status: "idle" });
  const [policyOpen, setPolicyOpen] = useState(false);
  const policyButtonRef = useRef<HTMLButtonElement>(null);

  const trimmedEmail = email.trim();
  const contentLength = content.trim().length;
  const emailValid = trimmedEmail.length <= EMAIL_MAX && EMAIL_PATTERN.test(trimmedEmail);
  const contentValid = contentLength >= CONTENT_MIN && contentLength <= CONTENT_MAX;
  const submitting = state.status === "submitting";
  const canSubmit = category !== "" && emailValid && contentValid && agreed && !submitting;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    // canSubmit이 category !== ""를 포함하므로, 이 검사 뒤에는 category가 문의 유형으로 좁혀진다.
    if (!canSubmit) return;

    setState({ status: "submitting" });
    try {
      await createInquiry({ category, email: trimmedEmail, content: content.trim(), agreed, website });
      setState({ status: "done", email: trimmedEmail });
    } catch (err) {
      setState({ status: "error", error: toInquiryError(err) });
    }
  };

  if (state.status === "done") {
    return (
      <DocumentPage title="1:1 문의" back={{ to: "/help", label: "고객지원" }}>
        {/* 에러 화면(ErrorNotice)과 같은 배치로, 아이콘·제목·설명·버튼을 가운데에 둔다. */}
        <div role="status" className="mt-6 flex flex-col items-center py-12 text-center md:mt-8">
          <CircleCheck className="size-10 text-accent" aria-hidden="true" />
          <h2 className="mt-5 text-[17px] font-bold text-ink">문의가 접수됐어요</h2>
          <p className="mt-2.5 max-w-[320px] break-keep text-[14px] leading-relaxed text-caption">
            입력한 이메일({state.email})로 답변을 보내 드릴게요. 확인하는 데 시간이 걸릴 수 있어요.
          </p>
          <Link
            to="/help"
            className="mt-8 flex h-12 w-full max-w-[320px] items-center justify-center rounded-xl border border-divider text-[15px] text-ink"
          >
            고객지원으로
          </Link>
        </div>
      </DocumentPage>
    );
  }

  const showEmailHint = emailTouched && trimmedEmail !== "" && !emailValid;

  return (
    <DocumentPage title="1:1 문의" back={{ to: "/help", label: "고객지원" }}>
      <form onSubmit={submit} noValidate className="mt-6 flex flex-col gap-5 md:mt-8">
        <p className="break-keep text-[14px] leading-relaxed text-caption">
          {/* 좁은 화면에서만 문장마다 줄을 나눈다(block). 한 문단으로 흘리면 폭에 따라 문장 한가운데서 끊긴다.
            넓은 화면은 한 줄에 들어가므로 이어 쓴다(md:inline). 사이의 공백은 이어 쓸 때만 보인다. */}
          <span className="block md:inline">서비스를 이용하며 궁금한 점이나 잘못된 정보를 알려 주세요.</span>{" "}
          <span className="block md:inline">입력한 이메일로 답변을 보내 드려요.</span>
        </p>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="inquiry-category" className={FIELD_LABEL_CLASS}>
            문의 유형
          </label>
          {/* 브라우저 기본 화살표는 안쪽 여백과 상관없이 오른쪽 끝에 붙어서 위치를 옮길 수 없다.
            기본 화살표를 숨기고(appearance-none), 글자 여백(px-3.5)과 같은 거리에 아이콘을 직접 둔다. */}
          <div className="relative">
            <select
              id="inquiry-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as InquiryCategory | "")}
              // 선택 상자는 브라우저 기본 높이가 입력칸보다 낮아서, 한 줄 입력칸과 같은 높이(h-11)로 고정한다.
              // pr-10: 긴 유형 이름이 화살표 아이콘 밑으로 들어가지 않게 오른쪽 여백을 비워 둔다.
              className={`${INPUT_CLASS} h-11 cursor-pointer appearance-none pr-10`}
            >
              <option value="" disabled>
                유형을 선택해 주세요
              </option>
              {INQUIRY_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            {/* FAQ 펼치기와 같은 화살표. 클릭은 아래 선택 상자로 통과시킨다. */}
            <ChevronDown
              size={18}
              aria-hidden="true"
              className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-caption"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="inquiry-email" className={FIELD_LABEL_CLASS}>
            답변 받을 이메일
          </label>
          <input
            id="inquiry-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={EMAIL_MAX}
            placeholder="example@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            aria-invalid={showEmailHint}
            aria-describedby={showEmailHint ? "inquiry-email-hint" : undefined}
            className={`${INPUT_CLASS} h-11`}
          />
          {/* 디자인 토큰에 오류용 빨간색이 없어, 강조색(accent)으로 알린다. */}
          {showEmailHint && (
            <p id="inquiry-email-hint" className="text-[12px] text-accent">
              이메일 형식을 확인해 주세요.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="inquiry-content" className={FIELD_LABEL_CLASS}>
            문의 내용
          </label>
          <textarea
            id="inquiry-content"
            rows={8}
            maxLength={CONTENT_MAX}
            placeholder="어떤 화면에서 어떤 점이 궁금하거나 잘못되었는지 적어 주시면 더 빨리 확인할 수 있어요."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            aria-describedby="inquiry-content-count"
            className={`${INPUT_CLASS} resize-y leading-relaxed`}
          />
          <p id="inquiry-content-count" className="text-right text-[12px] text-caption">
            {contentLength}자 · {CONTENT_MIN}자 이상 {CONTENT_MAX}자 이하
          </p>
        </div>

        {/* 숨긴 입력칸(허니팟). sr-only로 화면에서 빼고, aria-hidden과 tabIndex -1로 스크린 리더와
          탭 이동에서도 빼서 사람이 실수로 채울 일이 없게 한다. */}
        <div aria-hidden="true" className="sr-only">
          <label htmlFor="inquiry-website">웹사이트</label>
          <input
            id="inquiry-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        {/* 개인정보 수집·이용 동의. 수집 항목·목적·보유 기간과 거부할 권리를 동의 전에 보여줘야 한다.
          보유 기간은 sql/01_schema.sql inquiry 주석과 개인정보처리방침과 같아야 한다. */}
        <section aria-labelledby="inquiry-consent-title" className="rounded-lg bg-lavender px-4 py-4">
          <h2 id="inquiry-consent-title" className="text-[13px] font-bold text-ink">
            개인정보 수집·이용 동의 (필수)
          </h2>
          <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px] leading-relaxed">
            <dt className="text-caption">수집 항목</dt>
            <dd className="text-ink">이메일, 문의 유형, 문의 내용</dd>
            <dt className="text-caption">이용 목적</dt>
            <dd className="text-ink">문의 확인 및 답변</dd>
            <dt className="text-caption">보유 기간</dt>
            <dd className="text-ink">문의 처리 완료 후 1년</dd>
          </dl>
          <p className="mt-2.5 break-keep text-[12px] leading-relaxed text-caption">
            동의하지 않을 수 있으며, 동의하지 않으면 문의를 보낼 수 없어요. 자세한 내용은{" "}
            {/* 페이지로 이동하면 적어 둔 문의가 사라지므로 팝업으로 연다. */}
            <button
              ref={policyButtonRef}
              type="button"
              onClick={() => setPolicyOpen(true)}
              className="cursor-pointer underline underline-offset-4 hover:text-ink"
            >
              개인정보처리방침
            </button>
            에서 확인할 수 있어요.
          </p>
          {/* 방문 혜택 신청 체크리스트(SupportDetail)와 같은 체크박스 */}
          <label className="mt-3 flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
            />
            <span className="text-[13px] text-ink">위 내용에 동의합니다.</span>
          </label>
        </section>

        {state.status === "error" && (
          <div role="alert" className="rounded-lg border border-divider px-4 py-3">
            <p className="text-[14px] font-bold text-ink">{state.error.title}</p>
            <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-caption">
              {state.error.description}
            </p>
          </div>
        )}

        {/* 방문 혜택 환급 계산 버튼(SupportCalculator)과 같은 주 버튼 */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full cursor-pointer rounded-lg bg-accent py-3 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "보내는 중…" : "문의 보내기"}
        </button>
      </form>

      {policyOpen && <PrivacyPolicyDialog onClose={() => setPolicyOpen(false)} returnFocusRef={policyButtonRef} />}
    </DocumentPage>
  );
}
