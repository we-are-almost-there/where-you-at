import DocumentPage from "../../components/layout/DocumentPage";
import TermsContent from "./TermsContent";

/** 이용약관 페이지. 모양은 개인정보처리방침 페이지(PrivacyPage)와 같다. */
export default function TermsPage() {
  return (
    <DocumentPage title="이용약관" back={{ to: "/help", label: "고객지원" }}>
      {/* 제목 아래 첫 내용 글자까지 24px(넓은 화면 32px). DocumentPage 주석의 하위 화면 간격 규칙 */}
      <div className="mt-6 md:mt-8">
        <TermsContent />
      </div>
    </DocumentPage>
  );
}
