import { useState } from "react";
import { UserRound } from "lucide-react";

const SIZES = {
  sm: { box: "size-10", icon: 24 },
  md: { box: "size-16 md:size-20", icon: 32 },
  lg: { box: "size-20", icon: 40 },
} as const;

/**
 * 기본 프로필 아바타. 상단바(#160)의 연보라 원 아바타와 같은 모양을 크게 그린다.
 * 프로필 사진이 생기면 imageUrl을 받아 img로 그리고, 불러오지 못하면(onError) 이 기본 모양으로 돌아온다.
 * 장식이라 화면낭독기에는 숨긴다. 이름은 옆의 닉네임이 전한다.
 */
export default function ProfileAvatar({ size = "md", imageUrl }: { size?: keyof typeof SIZES; imageUrl?: string | null }) {
  const { box, icon } = SIZES[size];
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (imageUrl && failedUrl !== imageUrl) {
    return (
      <span aria-hidden="true" className={`block shrink-0 overflow-hidden rounded-full bg-lavender ${box}`}>
        <img src={imageUrl} alt="" className="size-full object-cover" onError={() => setFailedUrl(imageUrl)} />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full bg-lavender text-accent ${box}`}>
      <UserRound size={icon} strokeWidth={1.75} />
    </span>
  );
}
