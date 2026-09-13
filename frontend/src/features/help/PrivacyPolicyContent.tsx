/**
 * 개인정보처리방침 본문. /privacy 페이지와 1:1 문의의 동의 팝업(PrivacyPolicyDialog)이 함께 써서
 * 두 곳의 문안이 어긋나지 않게 한다.
 *
 * 문안은 아직 없다. 개인정보처리방침 작업 때 1:1 문의에서 수집하는 항목·목적·보유 기간
 * (ContactPage 동의 안내, sql/01_schema.sql inquiry 주석)과 맞춰 채운다.
 */
export default function PrivacyPolicyContent() {
  return (
    <p className="break-keep text-[14px] leading-relaxed text-caption">개인정보처리방침 문안을 준비하고 있어요.</p>
  );
}
