import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { Heart } from "lucide-react";
import { StatusMessage } from "../../components/common/a11y";
import { toUserError } from "../../components/error/userError";
import { useAuth, useKakaoLogin } from "../auth";
import type { RouteType } from "../map/types";
import { clearSavedKeys, ensureSavedKeysLoaded, toggleSavedCourse, useSavedCourse } from "./savedStore";

interface Props {
  courseId: number;
  /** 화면낭독기가 어느 코스의 하트인지 알 수 있게 이름에 넣는다. */
  courseTitle: string;
  /** 찜할 종목. 목록은 보고 있는 탭, 상세는 고른 종목이다. */
  routeType: RouteType;
  /** 자리·크기·배경. 카드는 썸네일 우상단 흰 원판, 상세는 제목 옆 투명 버튼이다. */
  className?: string;
  /** 하트 아이콘 크기(px). */
  size?: number;
}

/**
 * 찜(하트) 버튼. 코스 목록 카드, 코스 상세, 찜한 코스 전체 보기가 함께 쓴다.
 *
 * 로그인하지 않았어도 하트를 빈 상태로 보여 주고, 누르면 만 14세 확인을 거쳐 카카오 로그인으로 보낸다.
 * 기능이 있다는 것을 로그인 전에도 알리기 위해서다. 로그인하고 돌아오면 보던 화면이며, 찜은 다시 눌러야 한다.
 */
export default function SaveHeartButton({ courseId, courseTitle, routeType, className = "", size = 20 }: Props) {
  const auth = useAuth();
  const location = useLocation();
  const { login, dialog } = useKakaoLogin();
  const { saved, busy } = useSavedCourse(courseId, routeType);
  const [status, setStatus] = useState("");

  // 로그인하면 무엇을 찜했는지 한 번 받아 두고, 로그아웃·탈퇴하면 비운다.
  // 하트가 있는 화면마다 부르지만 둘 다 이미 끝난 상태에서는 아무것도 하지 않는다.
  useEffect(() => {
    if (auth.status === "signedIn") ensureSavedKeysLoaded();
    else if (auth.status === "signedOut") clearSavedKeys();
  }, [auth.status]);

  const signedIn = auth.status === "signedIn";

  const handleClick = async () => {
    if (!signedIn) {
      login(location.pathname + location.search);
      return;
    }
    // 같은 문구를 다시 읽히려면 한 번 비워야 한다(마이페이지 프로필 저장 알림과 같은 이유).
    setStatus("");
    try {
      await toggleSavedCourse(courseId, routeType);
    } catch (error) {
      setStatus(toUserError(error, saved ? "찜을 해제하지 못했어요" : "찜하지 못했어요").title);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={saved ?? false}
        aria-label={`${courseTitle} ${saved ? "찜 해제" : "찜하기"}`}
        // 무엇을 찜했는지 아직 모르는 동안에는 누르지 못한다. 눌렀다가 곧바로 되돌아가는 일을 막는다.
        disabled={busy || (signedIn && saved === undefined)}
        className={`flex cursor-pointer items-center justify-center transition-colors disabled:cursor-default disabled:opacity-45 ${
          saved ? "text-accent" : "text-caption"
        } ${className}`}
      >
        <Heart size={size} strokeWidth={2} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
      </button>
      <StatusMessage message={status} />
      {dialog}
    </>
  );
}
