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
  { label: "개인정보처리방침", to: "/privacy" },
  { label: "1:1 문의", to: "/contact" },
];

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
