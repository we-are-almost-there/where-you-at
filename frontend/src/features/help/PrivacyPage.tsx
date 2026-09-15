import DocumentPage from "../../components/layout/DocumentPage";
import PrivacyPolicyContent from "./PrivacyPolicyContent";

/** 개인정보처리방침 페이지. 본문은 1:1 문의 동의 팝업(PrivacyPolicyDialog)과 같은 PrivacyPolicyContent를 쓴다. */
export default function PrivacyPage() {
  return (
    <DocumentPage title="개인정보처리방침" back={{ to: "/help", label: "고객지원" }}>
      {/* 제목 아래 첫 내용 글자까지 24px(넓은 화면 32px). DocumentPage 주석의 하위 화면 간격 규칙 */}
      <div className="mt-6 md:mt-8">
        <PrivacyPolicyContent />
      </div>
    </DocumentPage>
  );
}
