import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import ModalDialog from "../../components/common/ModalDialog";
import { Footprints, Heart, LogOut, Pencil } from "lucide-react";
import { StatusMessage } from "../../components/common/a11y";
import { signOut, type User } from "../auth";
import MyPageLayout, { Notice } from "./components/MyPageLayout";
import ProfileAvatar from "./components/ProfileAvatar";
import ProfileEditDialog from "./components/ProfileEditDialog";
import WithdrawDialog from "./components/WithdrawDialog";
import SectionHeader from "./components/SectionHeader";
import EmptyState from "./components/EmptyState";
import SavedCourseRows from "./components/SavedCourseRows";
import RecordRows from "./components/RecordRows";
import StampBoard from "./components/StampBoard";
import StampMapDialog from "./components/StampMapDialog";
import { useSigunguStamps } from "./useSigunguStamps";
import { useRunRecords } from "./useRunRecords";
import { useSavedCourses } from "./useSavedCourses";
import { PRIMARY_BUTTON } from "./buttonStyles";
import { profileTags } from "./profileTags";

// 첫 화면에 미리 보여 줄 개수. 나머지는 전체 보기에서 본다.
// 넓은 화면에서 옆 칸과 높이가 맞도록 정한 값이다. 찜한 코스는 프로필 카드 옆, 기록은 스탬프(시도 16개, 4줄) 옆이라
// 기록을 더 많이 띄운다. 스탬프 격자나 줄 모양이 바뀌면 다시 맞춘다.
const SAVED_PREVIEW_COUNT = 5;
const RECORD_PREVIEW_COUNT = 7;

// 영역 카드. 프로필 카드와 같은 모서리·그림자라 네 칸이 한 판으로 읽힌다.
const PANEL = "rounded-[14px] bg-white p-5 shadow-[0px_3px_10px_0px_rgba(0,0,0,0.12)]";

/**
 * 마이페이지 첫 화면.
 *   넓은 화면  [프로필 | 찜한 코스]
 *             [내 기록 | 지역 스탬프]
 *   좁은 화면  위 순서대로 한 줄씩 쌓는다.
 * 찜·기록은 최근 몇 개만 게시판형으로 보여 주고, 전체는 각 전체 보기 화면에서 페이지를 넘겨 본다.
 */
export default function MyPage() {
  // 탈퇴가 끝나면 로그아웃 상태가 되는데, 그때는 로그인 안내 대신 탈퇴 완료 안내를 보여 준다.
  const [withdrawn, setWithdrawn] = useState(false);

  return (
    <MyPageLayout
      title="마이페이지"
      signedOutContent={
        withdrawn ? (
          <Notice title="탈퇴가 끝났어요" description={"그동안 어디까지왔니를 이용해 주셔서 감사합니다.\n회원 정보와 기록은 모두 지웠어요."} />
        ) : undefined
      }
    >
      {(user) => <Dashboard key={user.id} user={user} onWithdrawn={() => setWithdrawn(true)} />}
    </MyPageLayout>
  );
}

function Dashboard({ user, onWithdrawn }: { user: User; onWithdrawn: () => void }) {
  const { hash, key } = useLocation();
  // 로그인 확인 뒤 대시보드가 실제로 그려진 시점에 처리한다.
  // 같은 주소의 스탬프 링크를 다시 눌러도 이동하도록 navigation key를 구독한다.
  useEffect(() => {
    if (hash !== "#mypage-stamps") return;
    // ScrollToTop과 드로어의 포커스 복귀가 끝난 다음 프레임에 이동한다.
    const frame = requestAnimationFrame(() => {
      const heading = document.getElementById("mypage-stamps");
      if (!heading) return;
      heading.setAttribute("tabindex", "-1");
      heading.classList.add("outline-none");
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ block: "start", behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [hash, key]);

  const saved = useSavedCourses();
  const recordsState = useRunRecords();
  const records = recordsState.status === "ready" ? recordsState.records : [];
  const stampState = useSigunguStamps();
  const stamps = stampState.stamps;
  const [dialog, setDialog] = useState<"edit" | "withdraw" | "stampMap" | "signOut" | null>(null);
  const cancelSignOutRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  // 프로필 수정을 열 때 알림 문구를 비운다. 저장할 때마다 "" → "프로필을 저장했어요."로 바뀌어야 화면낭독기가
  // 다시 읽는다. 같은 문구로 한 번 더 setStatus하면 React가 갱신을 건너뛰어 두 번째 저장부터 알림이 없다.
  // 여는 곳이 두 군데(프로필 수정 버튼, 한 줄 소개 안내)라 이 함수로만 연다.
  const openProfileEdit = () => {
    setStatus("");
    setDialog("edit");
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setStatus("");
    setSigningOut(true);
    try {
      await signOut();
      setDialog(null);
    } catch {
      // #172부터 로그아웃은 서버 세션 삭제가 성공해야 로컬 상태를 지운다. 실패를 삼키면 버튼이
      // 아무 반응 없이 보이므로 로그인 상태를 유지한 채 다시 시도할 수 있게 알린다.
      setStatus("로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <>
      <div className="grid gap-5 md:grid-cols-[280px_minmax(0,1fr)] lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6">
        {/* 넓은 화면에서는 grid가 한 줄의 두 칸을 같은 높이로 늘린다. 카드도 aside를 꽉 채워(flex-1)
            찜한 코스 칸과 위아래 끝을 맞춘다. 남는 높이는 프로필 정보(아바타·닉네임·소개)가 가져가 세로 가운데에 두고,
            버튼은 아래 회원 탈퇴 구분선 바로 위에 붙인다. */}
        <aside aria-label="내 프로필" className="flex flex-col">
          <section className={`flex flex-1 flex-col ${PANEL}`}>
            {/* 기록·스탬프로 만든 자동 해시태그. 사진 위에 태그마다 작은 칩으로 둔다.
                "#"은 화면낭독기가 "샵"·"번호"로 읽지 않게 숨기고, 태그 글자만 목록으로 읽힌다. */}
            <ul aria-label="활동 요약" className="flex flex-wrap gap-1.5 md:justify-center">
              {profileTags(records, stamps).map((tag) => (
                <li key={tag} className="rounded-full bg-lavender px-2.5 py-1 text-[12px] font-bold text-accent-strong">
                  <span aria-hidden="true">#</span>
                  {tag}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-1 items-center gap-4 md:flex-col md:justify-center md:text-center">
              <ProfileAvatar imageUrl={user.avatar_url} />
              <div className="min-w-0">
                <p className="break-keep text-[18px] font-bold text-ink wrap-anywhere md:text-[20px]">{user.nickname ?? "회원"}</p>
                <p className="mt-0.5 text-[12px] text-caption">카카오 계정으로 로그인 중</p>
                {user.bio ? (
                  // break-keep: 한글을 단어 중간("좋/아요")에서 끊지 않는다. wrap-anywhere: 띄어쓰기 없이 긴 글자만 어디서든 끊는다.
                  <p className="mt-2 break-keep text-[14px] leading-5 text-ink wrap-anywhere">{user.bio}</p>
                ) : (
                  // 비어 있으면 적을 수 있다는 걸 알려 주고, 누르면 바로 프로필 수정을 연다.
                  <button
                    type="button"
                    onClick={openProfileEdit}
                    className="mt-2 cursor-pointer text-[14px] leading-5 text-caption underline-offset-2 hover:text-ink hover:underline"
                  >
                    한 줄 소개를 적어 보세요
                  </button>
                )}
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={openProfileEdit}
                className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-lavender text-[14px] font-bold text-accent-strong hover:bg-control-hover"
              >
                <Pencil size={15} aria-hidden="true" />
                프로필 수정
              </button>
              <button
                type="button"
                onClick={() => {
                  setStatus("");
                  setDialog("signOut");
                }}
                disabled={signingOut}
                className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-control-border text-[14px] font-bold text-ink hover:bg-control-hover disabled:cursor-wait disabled:opacity-60"
              >
                <LogOut size={15} aria-hidden="true" />
                {signingOut ? "로그아웃 중…" : "로그아웃"}
              </button>
            </div>

            {/* 탈퇴는 자주 쓰지 않고 되돌릴 수 없어, 카드 맨 아래에 구분선을 두고 작게 둔다.
                카드 밖에 두면 그 높이만큼 카드 아래 끝이 찜한 코스 칸과 어긋난다. */}
            <div className="mt-4 border-t border-divider-soft pt-3 text-right md:text-center">
              <button
                type="button"
                onClick={() => setDialog("withdraw")}
                className="cursor-pointer text-[13px] text-caption underline-offset-2 hover:text-ink hover:underline"
              >
                회원 탈퇴
              </button>
            </div>
          </section>
        </aside>

        <Panel id="mypage-saved">
          <SectionHeader
            id="mypage-saved"
            title="찜한 코스"
            count={saved.status === "ready" ? String(saved.courses.length) : undefined}
            moreTo={saved.status === "ready" && saved.courses.length > 0 ? "/mypage/saved" : undefined}
          />
          <div className="mt-2">
            {saved.status === "loading" ? (
              <p role="status" className="py-12 text-center text-[14px] text-caption">
                찜한 코스를 불러오는 중…
              </p>
            ) : saved.status === "error" ? (
              <div className="py-12 text-center">
                <p className="text-[14px] text-ink">{saved.error.title}</p>
                <button type="button" onClick={saved.retry} className="mt-2 cursor-pointer text-[14px] font-bold text-accent hover:opacity-70">
                  다시 시도
                </button>
              </div>
            ) : saved.courses.length === 0 ? (
              <EmptyState
                icon={<Heart size={26} strokeWidth={1.75} />}
                title="아직 찜한 코스가 없어요"
                description={"마음에 드는 코스에서 하트를 눌러 두면\n여기서 바로 찾아볼 수 있어요."}
                action={{ to: "/courses", label: "코스 둘러보기" }}
              />
            ) : (
              <SavedCourseRows courses={saved.courses.slice(0, SAVED_PREVIEW_COUNT)} />
            )}
          </div>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2 lg:mt-6 lg:gap-6">
        <Panel id="mypage-records">
          <SectionHeader
            id="mypage-records"
            title="내 기록"
            count={recordsState.status === "ready" ? String(records.length) : undefined}
            moreTo={records.length > 0 ? "/mypage/records" : undefined}
          />
          <div className="mt-2">
            {recordsState.status === "loading" ? (
              <p role="status" className="py-12 text-center text-[14px] text-caption">
                기록을 불러오는 중…
              </p>
            ) : recordsState.status === "error" ? (
              <div className="py-12 text-center">
                <p className="text-[14px] text-ink">{recordsState.error.title}</p>
                <button type="button" onClick={recordsState.retry} className="mt-2 cursor-pointer text-[14px] font-bold text-accent hover:opacity-70">
                  다시 시도
                </button>
              </div>
            ) : records.length === 0 ? (
              <EmptyState
                icon={<Footprints size={26} strokeWidth={1.75} />}
                title="아직 완주한 기록이 없어요"
                description={"코스 따라가기를 끝까지 마치면\n거리·시간·페이스가 여기에 쌓여요."}
                action={{ to: "/courses", label: "코스 둘러보기" }}
              />
            ) : (
              <RecordRows records={records.slice(0, RECORD_PREVIEW_COUNT)} compact />
            )}
          </div>
        </Panel>

        <Panel id="mypage-stamps">
          <SectionHeader
            id="mypage-stamps"
            title="지역 스탬프"
            action={
              <button
                type="button"
                onClick={() => setDialog("stampMap")}
                className={PRIMARY_BUTTON}
              >
                스탬프 지도 보기
              </button>
            }
          />
          <div className="mt-3">
            {stampState.loading ? <p role="status">스탬프를 불러오는 중…</p> : stampState.error ? (
              <div className="py-12 text-center">
                <p role="alert" className="whitespace-pre-line text-[14px] text-ink">{stampState.error}</p>
                <button type="button" onClick={stampState.retry} className="mt-2 cursor-pointer text-[14px] font-bold text-accent hover:opacity-70">다시 시도</button>
              </div>
            ) : <StampBoard stamps={stamps} />}
          </div>
        </Panel>
      </div>

      <StatusMessage message={dialog === "signOut" ? "" : status} />
      {dialog === "signOut" && (
        <ModalDialog
          title="로그아웃하시겠어요?"
          titleAlign="center"
          onClose={() => { setStatus(""); setDialog(null); }}
          initialFocusRef={cancelSignOutRef}
          busy={signingOut}
        >
          <p className="break-keep text-center text-[13px] leading-5 text-caption">
            로그아웃 후에도 언제든<br />
            카카오 계정으로 다시 로그인할 수 있습니다.
          </p>
          {status && <p role="alert" className="mt-3 text-[13px] text-danger">{status}</p>}
          <div className="mt-5 flex gap-2">
            <button
              ref={cancelSignOutRef}
              type="button"
              onClick={() => { setStatus(""); setDialog(null); }}
              disabled={signingOut}
              className="h-11 flex-1 cursor-pointer rounded-lg border border-control-border text-[15px] font-bold text-ink hover:bg-control-hover disabled:cursor-default disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="h-11 flex-1 cursor-pointer rounded-lg bg-accent text-[15px] font-bold text-white hover:bg-accent-strong disabled:cursor-wait disabled:opacity-60"
            >
              {signingOut ? "로그아웃 중…" : "로그아웃"}
            </button>
          </div>
        </ModalDialog>
      )}
      {dialog === "edit" && (
        <ProfileEditDialog
          user={user}
          onClose={() => setDialog(null)}
          onSaved={() => setStatus("프로필을 저장했어요.")}
        />
      )}
      {dialog === "withdraw" && <WithdrawDialog onClose={() => setDialog(null)} onWithdrawn={onWithdrawn} />}
      {dialog === "stampMap" && <StampMapDialog stamps={stamps} statuses={stampState.statuses}
        loading={stampState.loading} error={stampState.error} onRetry={stampState.retry}
        saving={stampState.saving} saveError={stampState.saveError} onStamp={stampState.stamp} onClose={() => setDialog(null)} />}
    </>
  );
}

/** 영역 하나. 제목(h2)의 id로 이름을 붙여 화면낭독기의 영역 목록에서 찾을 수 있게 한다. */
function Panel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={`min-w-0 ${PANEL} ${id === "mypage-stamps" ? "[&_h2]:scroll-mt-28 md:[&_h2]:scroll-mt-32" : ""}`}>
      {children}
    </section>
  );
}
