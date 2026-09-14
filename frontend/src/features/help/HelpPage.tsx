import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import DocumentPage from "../../components/layout/DocumentPage";

interface HelpLink {
  label: string;
  to: string;
}

const LINKS: HelpLink[] = [
  { label: "공지사항", to: "/notices" },
  { label: "자주 묻는 질문", to: "/faq" },
  { label: "이용약관", to: "/terms" },
  // 명칭은 붙여 쓴 "개인정보처리방침"으로 통일한다. 페이지·팝업 제목, 1:1 문의·이용약관의 링크도 같은 표기를 쓴다.
  { label: "개인정보처리방침", to: "/privacy" },
  { label: "1:1 문의", to: "/contact" },
];

// 고객지원 첫 화면의 목록은 원래 형식(넉넉한 간격, 넓은 화면에서 커지는 글자, 화살표 아이콘)을 유지한다.
// 공지·FAQ 같은 하위 화면의 목록만 대회 목록 형식에 맞춘다. 페이지 제목의 크기·위치는 둘이 같다 (DocumentPage 참고).
export default function HelpPage() {
  return (
    <DocumentPage title="고객지원">
      <ul className="mt-8 flex flex-col md:mt-10">
        {LINKS.map((link) => (
          <li key={link.label} className="border-b border-divider last:border-b-0">
            <Link
              to={link.to}
              className="flex items-center justify-between py-4 text-[15px] text-ink md:py-5 md:text-[16px]"
            >
              {link.label}
              <ChevronRight size={18} className="text-caption" />
            </Link>
          </li>
        ))}
      </ul>
    </DocumentPage>
  );
}
