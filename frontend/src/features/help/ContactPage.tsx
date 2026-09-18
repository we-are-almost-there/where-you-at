import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ChevronDown, CircleCheck } from "lucide-react";
import DocumentPage from "../../components/layout/DocumentPage";
import { toUserError, type UserError } from "../../components/error/userError";
import { HttpError } from "../../lib/http";
import { createInquiry } from "./helpApi";
import PrivacyPolicyDialog from "./PrivacyPolicyDialog";
import { INQUIRY_CATEGORIES, type InquiryCategory } from "./types";

// 서버 검증(backend/app/schemas/inquiry.py)과 같은 규칙. 화면에서 먼저 막아 불필요한 요청을 줄이고,
// 최종 판단은 서버가 한다.
const CONTENT_MIN = 10;
const CONTENT_MAX = 2000;
const EMAIL_MAX = 254;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * 글자 수를 서버·DB와 같은 기준(유니코드 코드 포인트)으로 센다.
 * 문자열의 length는 UTF-16 단위라 이모지를 2자로 세서, 서버(Python len)·DB(char_length)와 어긋난다.
 */
function countChars(value: string): number {
  return [...value].length;
}

// 코스 필터 검색칸(CourseFilters)과 같은 입력칸 모양
const INPUT_CLASS =
  "w-full rounded-lg border border-input-border bg-white px-3.5 py-2.5 text-[14px] text-ink placeholder:text-caption focus:border-accent focus:outline-none";
// 라벨은 제목·동의 섹션 제목과 같은 ink.
const FIELD_LABEL_CLASS = "text-[12px] font-bold text-ink";
// 오류 안내. 색만으로 알리지 않도록 문장 자체가 무엇이 잘못됐는지 말한다.
const FIELD_ERROR_CLASS = "text-[12px] text-danger";

// 필수 표시. 라벨 밖에 두고 숨겨서 이름("문의 유형 별표")에 섞이지 않게 한다. 필수 여부는 required 속성이 알린다.
function RequiredMark() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-danger">
      *
    </span>
  );
}

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
  // 보내기를 한 번 누른 뒤부터 빠진 항목을 모두 알린다. 처음부터 오류를 띄우면 쓰기도 전에 꾸중을 듣는 셈이다.
  const [attempted, setAttempted] = useState(false);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const agreeRef = useRef<HTMLInputElement>(null);

  const trimmedEmail = email.trim();
  const contentLength = countChars(content.trim());
  const emailValid = trimmedEmail.length <= EMAIL_MAX && EMAIL_PATTERN.test(trimmedEmail);
  const contentValid = contentLength >= CONTENT_MIN && contentLength <= CONTENT_MAX;
  const contentOver = contentLength - CONTENT_MAX;
  const submitting = state.status === "submitting";

  // 항목별 오류 문구. 화면에 보일지는 아래 show* 가 정한다.
  const categoryError = category === "" ? "문의 유형을 선택해 주세요." : null;
  const emailError =
    trimmedEmail === "" ? "답변 받을 이메일을 입력해 주세요." : !emailValid ? "이메일 형식을 확인해 주세요." : null;
  const contentError =
    contentLength === 0
      ? "문의 내용을 입력해 주세요."
      : contentLength < CONTENT_MIN
        ? `문의 내용을 ${CONTENT_MIN}자 이상 적어 주세요.`
        : null;
  const agreeError = agreed ? null : "개인정보 수집·이용에 동의해야 문의를 보낼 수 있어요.";

  const showCategoryError = attempted && categoryError !== null;
  // 이메일은 칸을 벗어날 때 형식도 바로 알려 준다(빈 칸은 보내기를 누른 뒤에만).
  const showEmailError = emailError !== null && (attempted || (emailTouched && trimmedEmail !== ""));
  const showContentError = attempted && contentError !== null;
  const showAgreeError = attempted && agreeError !== null;
  // 2000자 초과는 입력하는 동안에도 글자 수 안내가 알린다.
  const contentInvalid = showContentError || contentOver > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    // 버튼을 끄지 않고, 누르면 빠진 항목을 알리고 첫 번째 칸으로 초점을 옮긴다.
    // 꺼진 버튼은 초점을 받지 못해 무엇이 부족한지 알 길이 없다.
    const firstInvalid =
      categoryError !== null
        ? categoryRef.current
        : emailError !== null
          ? emailRef.current
          : !contentValid
            ? contentRef.current
            : agreeError !== null
              ? agreeRef.current
              : null;
    // category === "" 검사는 타입을 좁히려는 것. 비어 있으면 firstInvalid도 있다.
    if (firstInvalid || category === "") {
      setAttempted(true);
      firstInvalid?.focus();
      return;
    }

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
          <div className="flex items-center">
            <label htmlFor="inquiry-category" className={FIELD_LABEL_CLASS}>
              문의 유형
            </label>
            <RequiredMark />
          </div>
          {/* 브라우저 기본 화살표는 안쪽 여백과 상관없이 오른쪽 끝에 붙어서 위치를 옮길 수 없다.
            기본 화살표를 숨기고(appearance-none), 글자 여백(px-3.5)과 같은 거리에 아이콘을 직접 둔다. */}
          <div className="relative">
            <select
              ref={categoryRef}
              id="inquiry-category"
              required
              aria-invalid={showCategoryError}
              aria-describedby={showCategoryError ? "inquiry-category-error" : undefined}
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
          {showCategoryError && (
            <p id="inquiry-category-error" className={FIELD_ERROR_CLASS}>
              {categoryError}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center">
            <label htmlFor="inquiry-email" className={FIELD_LABEL_CLASS}>
              답변 받을 이메일
            </label>
            <RequiredMark />
          </div>
          <input
            ref={emailRef}
            id="inquiry-email"
            required
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={EMAIL_MAX}
            placeholder="example@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            aria-invalid={showEmailError}
            aria-describedby={showEmailError ? "inquiry-email-hint" : undefined}
            className={`${INPUT_CLASS} h-11`}
          />
          {showEmailError && (
            <p id="inquiry-email-hint" className={FIELD_ERROR_CLASS}>
              {emailError}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center">
            <label htmlFor="inquiry-content" className={FIELD_LABEL_CLASS}>
              문의 내용
            </label>
            <RequiredMark />
          </div>
          <textarea
            ref={contentRef}
            id="inquiry-content"
            required
            rows={8}
            placeholder="어떤 화면에서 어떤 점이 궁금하거나 잘못되었는지 적어 주시면 더 빨리 확인할 수 있어요."
            value={content}
            // maxLength는 UTF-16 단위라 이모지를 2자로 세서 서버 기준보다 일찍 입력을 막는다.
            // 넘친 글자를 잘라 내면 가운데에 입력했을 때 끝 글자가 지워지므로, 입력은 그대로 두고
            // 넘친 글자 수를 알려 주고, 보내기를 누르면 이 칸으로 돌려보낸다.
            onChange={(e) => setContent(e.target.value)}
            aria-invalid={contentInvalid}
            aria-describedby={
              showContentError ? "inquiry-content-error inquiry-content-count" : "inquiry-content-count"
            }
            className={`${INPUT_CLASS} resize-y leading-relaxed`}
          />
          {showContentError && (
            <p id="inquiry-content-error" className={FIELD_ERROR_CLASS}>
              {contentError}
            </p>
          )}
          <p
            id="inquiry-content-count"
            className={`text-right text-[12px] ${contentOver > 0 ? "text-danger" : "text-caption"}`}
          >
            {contentOver > 0
              ? `${contentLength}자 · ${CONTENT_MAX}자를 ${contentOver}자 넘었어요`
              : `${contentLength}자 · ${CONTENT_MIN}자 이상 ${CONTENT_MAX}자 이하`}
          </p>
        </div>

        {/* 숨긴 입력칸(허니팟). hidden(display:none)으로 화면·접근성 트리·탭 이동에서 모두 뺀다.
          aria-hidden만 걸면 칸이 여전히 포커스를 받을 수 있어 화면낭독기 사용자가 보이지 않는 칸에 들어가게 된다.
          폼을 자동으로 채우는 봇은 숨긴 칸도 채운다. */}
        <div hidden>
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
          {/* 국외 이전은 개인정보처리방침 8번에 공개하는 방식(개인정보 보호법 제28조의8제1항제3호가목)이라 별도 동의는
            받지 않고, 동의하기 전에 알 수 있게 한 줄로 안내한다. 업체·국가가 바뀌면 방침 8번과 함께 고친다. */}
          <p className="mt-2.5 break-keep text-[12px] leading-relaxed text-caption">
            문의 정보는 해외 업체의 서버(API 서버 Render 싱가포르, 데이터베이스 운영사 Supabase 미국, 새 문의 알림
            Slack 아일랜드·미국)를 거쳐 처리돼요.
          </p>
          <p className="mt-1.5 break-keep text-[12px] leading-relaxed text-caption">
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
              ref={agreeRef}
              type="checkbox"
              required
              aria-invalid={showAgreeError}
              aria-describedby={showAgreeError ? "inquiry-agree-error" : undefined}
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
            />
            <span className="text-[13px] text-ink">위 내용에 동의합니다.</span>
          </label>
          {showAgreeError && (
            <p id="inquiry-agree-error" className={`mt-1.5 ${FIELD_ERROR_CLASS}`}>
              {agreeError}
            </p>
          )}
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
          disabled={submitting}
          className="w-full cursor-pointer rounded-lg bg-accent py-3 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "보내는 중…" : "문의 보내기"}
        </button>
      </form>

      {policyOpen && <PrivacyPolicyDialog onClose={() => setPolicyOpen(false)} returnFocusRef={policyButtonRef} />}
    </DocumentPage>
  );
}
