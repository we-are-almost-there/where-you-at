import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import AppHeader from "../../components/layout/AppHeader";

interface HelpLink {
  label: string;
  to: string;
}

const LINKS: HelpLink[] = [
  { label: "공지사항", to: "/notices" },
  { label: "자주 묻는 질문", to: "/faq" },
  { label: "이용약관", to: "/terms" },
  { label: "개인정보처리방침", to: "/privacy" },
  { label: "데이터 출처", to: "/data-sources" },
  { label: "1:1 문의", to: "/contact" },
];

export default function HelpPage() {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-white">
      <AppHeader variant="wide" />
      <div className="mx-auto w-full max-w-[720px] flex-1 overflow-y-auto px-4 py-10 md:py-16">
        <h1 className="font-bold text-ink text-[20px] md:text-[26px]">고객지원</h1>

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
      </div>
    </div>
  );
}
