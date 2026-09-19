import { Link } from "react-router";
import { Items, LegalSection, LegalToc, P, type LegalSectionInfo } from "./LegalDocument";
import { CONTEST, EFFECTIVE_DATE, OPERATOR, PREVIOUS_VERSIONS, SERVICE } from "./legalInfo";

/*
 * 이용약관 본문. 구조(목차 → 조항)와 모양은 개인정보처리방침과 같다(LegalDocument).
 *
 * 결제가 없는 무료 서비스라 요금·환불 조항은 두지 않았다. 회원 가입은 카카오 로그인으로 하는 선택 기능이라
 * 가입·탈퇴와 프로필(닉네임·한 줄 소개)은 조의2·조의3으로 덧붙였다. 뒤 조항 번호를 밀면 다른 문서·주석의 조항
 * 인용(제7조, 제10조, 제13조 등)이 어긋나서다. 쪽지·리뷰가 생기면 게시물 조항을 같은 방식으로 더한다.
 * 대신 이 서비스에서 실제로 문제가 될 수 있는 것을 조항으로 정했다.
 * - 공공데이터를 그대로 보여 주므로 실제와 다를 수 있다는 점(제7조) — 푸터 고지와 같은 내용
 * - 이동 중 안전(제10조), 코스 이용 중 사고의 책임(제13조) — 푸터 고지와 같은 내용
 * - 위치 기능(제8조), 기기 안에서만 처리하는 기록 카드 사진(제9조)
 *
 * 제13조(책임의 제한): 「약관의 규제에 관한 법률」 제7조에 따라 사업자의 고의·중대한 과실로 인한 책임을
 * 배제하는 조항은 무효라서 단서로 그 경우를 뺐다. 면책 범위가 넓으면 같은 조의 "상당한 이유 없는 책임 제한"으로
 * 다툼이 될 수 있으니 문구를 넓히기 전에 검토한다.
 */

const S = {
  purpose: { id: "terms-purpose", label: "제1조(목적)" },
  definitions: { id: "terms-definitions", label: "제2조(용어의 정의)" },
  posting: { id: "terms-posting", label: "제3조(약관의 게시와 변경)" },
  otherRules: { id: "terms-other-rules", label: "제4조(약관 외 준칙)" },
  services: { id: "terms-services", label: "제5조(서비스의 제공)" },
  changes: { id: "terms-changes", label: "제6조(서비스의 변경과 중단)" },
  accuracy: { id: "terms-accuracy", label: "제7조(정보의 정확성)" },
  location: { id: "terms-location", label: "제8조(위치 기능)" },
  recordCard: { id: "terms-record-card", label: "제9조(기록 카드)" },
  duties: { id: "terms-duties", label: "제10조(이용자의 의무)" },
  inquiry: { id: "terms-inquiry", label: "제11조(1:1 문의)" },
  membership: { id: "terms-membership", label: "제11조의2(회원 가입과 탈퇴)" },
  profile: { id: "terms-profile", label: "제11조의3(프로필)" },
  copyright: { id: "terms-copyright", label: "제12조(저작권과 데이터 출처)" },
  liability: { id: "terms-liability", label: "제13조(책임의 제한)" },
  disputes: { id: "terms-disputes", label: "제14조(분쟁 해결과 준거법)" },
  addendum: { id: "terms-addendum", label: "부칙" },
} satisfies Record<string, LegalSectionInfo>;

const SECTIONS = Object.values(S);

export default function TermsContent() {
  return (
    <div>
      <LegalToc label="이용약관 목차" sections={SECTIONS} />

      <LegalSection section={S.purpose}>
        <P>
          이 약관은 {OPERATOR}(이하 &lsquo;운영팀&rsquo;)이 제공하는 {SERVICE} 서비스(이하 &lsquo;서비스&rsquo;)의 이용
          조건과 절차, 운영팀과 이용자의 권리·의무 및 책임에 관한 사항을 정하는 것을 목적으로 합니다.
        </P>
      </LegalSection>

      <LegalSection section={S.definitions}>
        <Items ordered>
          <li>
            &lsquo;서비스&rsquo;란 운영팀이 웹사이트로 제공하는 걷기·자전거 코스 탐색과 따라가기, 대회 행사, 방문 혜택,
            자전거 대여소 안내와 고객지원 기능을 말합니다.
          </li>
          <li>
            &lsquo;이용자&rsquo;란 이 약관에 따라 서비스를 이용하는 사람을 말합니다. 서비스는 로그인하지 않고도 이용할
            수 있습니다.
          </li>
          <li>
            &lsquo;회원&rsquo;이란 카카오 로그인으로 가입해 마이페이지를 이용하는 이용자를 말합니다.
          </li>
          <li>
            &lsquo;공공데이터&rsquo;란 서비스가 보여 주는 코스, 관광 정보, 대회 행사, 자전거 대여소 정보의 출처가 되는
            공공기관의 데이터를 말합니다.
          </li>
        </Items>
      </LegalSection>

      <LegalSection section={S.posting}>
        <Items ordered>
          <li>운영팀은 이용자가 쉽게 볼 수 있도록 이 약관을 서비스의 고객지원 화면에 게시합니다.</li>
          <li>운영팀은 「약관의 규제에 관한 법률」 등 관계 법령을 위반하지 않는 범위에서 이 약관을 바꿀 수 있습니다.</li>
          <li>
            약관을 바꿀 때는 적용일과 바꾸는 이유를 밝혀 적용일 7일 전부터 공지사항으로 알립니다. 이용자에게 불리하게
            바꾸는 경우에는 적용일 30일 전부터 알립니다. 다만 새 기능을 추가하는 등 이용자에게 불리하지 않은 변경은
            공지한 날부터 적용할 수 있습니다.
          </li>
          <li>
            이용자는 바뀐 약관에 동의하지 않으면 서비스 이용을 멈출 수 있습니다. 적용일 이후에도 서비스를 계속 이용하면
            바뀐 약관에 동의한 것으로 봅니다.
          </li>
        </Items>
      </LegalSection>

      <LegalSection section={S.otherRules}>
        <P>
          이 약관에서 정하지 않은 사항은 관계 법령과 일반적인 관례에 따릅니다. 개인정보 처리에 관한 사항은{" "}
          <Link to="/privacy" className="underline underline-offset-4">
            개인정보처리방침
          </Link>
          에 따릅니다.
        </P>
      </LegalSection>

      <LegalSection section={S.services}>
        <P>운영팀은 다음 서비스를 제공합니다.</P>
        <Items ordered>
          <li>
            <strong>코스 탐색</strong>: 걷기·자전거 코스 검색, 코스 상세 정보와 주변 관광 정보 안내
          </li>
          <li>
            <strong>코스 따라가기</strong>: 현재 위치를 이용한 진행률·코스 이탈 안내와 기록 카드 만들기
          </li>
          <li>
            <strong>대회 행사</strong>: 대회·행사 일정과 상세 정보 안내
          </li>
          <li>
            <strong>방문 혜택</strong>: 지역별 방문 혜택 제도 안내와 예상 환급액 계산
          </li>
          <li>
            <strong>자전거 대여</strong>: 자전거 대여소 위치·운영 정보와 실시간 대여 가능 수 안내
          </li>
          <li>
            <strong>마이페이지</strong>: 회원의 프로필(닉네임·한 줄 소개) 관리, 찜한 코스·완주 기록·지역 스탬프 모아
            보기
          </li>
          <li>
            <strong>고객지원</strong>: 공지사항, 자주 묻는 질문, 1:1 문의
          </li>
        </Items>
        <P>
          서비스는 무료이며 로그인하지 않고도 이용할 수 있습니다. 마이페이지는 회원만 이용할 수 있습니다. 서비스는{" "}
          {CONTEST} 출품작으로 운영됩니다.
        </P>
      </LegalSection>

      <LegalSection section={S.changes}>
        <Items ordered>
          <li>운영팀은 서비스 개선이나 공공데이터 제공 조건 변경 등 필요한 경우 서비스의 내용을 바꿀 수 있습니다.</li>
          <li>
            운영팀은 서버 점검·장애, 공공데이터나 지도 등 외부 서비스의 제공 중단·변경, 천재지변 같은 불가항력이 있는
            경우 서비스의 전부 또는 일부를 일시적으로 중단할 수 있습니다.
          </li>
          <li>
            서비스는 공모전 출품작으로 운영되므로 운영팀의 사정에 따라 운영을 끝낼 수 있습니다. 이 경우 종료일 30일
            전부터 공지사항으로 알립니다.
          </li>
          <li>
            제1항부터 제3항까지의 변경·중단이 이용자에게 중요한 영향을 주는 경우 미리 공지사항으로 알립니다. 다만 장애처럼
            미리 알릴 수 없는 사유가 있으면 사유가 해소된 뒤 알립니다.
          </li>
        </Items>
      </LegalSection>

      <LegalSection section={S.accuracy}>
        <Items ordered>
          <li>
            서비스의 코스, 관광 정보, 대회 행사, 자전거 대여소 정보는 공공데이터를 받아 그대로 제공하므로 실제와 다르거나
            늦게 반영될 수 있습니다.
          </li>
          <li>
            방문 혜택 정보는 문화체육관광부와 한국관광공사가 안내하는 제도 내용을 운영팀이 정리한 것이고, 예상 환급액은
            참고용 계산 결과입니다. 실제 지원 여부와 금액은 각 제도를 운영하는 기관이 정합니다.
          </li>
          <li>
            이용자는 방문, 대회 참가, 혜택 신청 전에 주최 기관이나 해당 지방자치단체에 내용을 다시 확인해야 합니다.
          </li>
        </Items>
      </LegalSection>

      <LegalSection section={S.location}>
        <Items ordered>
          <li>
            가까운 코스·자전거 대여소 안내와 코스 따라가기는 이용자가 브라우저나 기기에서 위치 사용을 허용한 경우에만
            현재 위치를 이용합니다.
          </li>
          <li>
            이용자는 위치 사용을 언제든지 거부하거나 해제할 수 있습니다. 거부하면 가까운 순 정렬 없이 기본 순서로 목록을
            보여 주며, 코스 따라가기는 위치 없이 이용할 수 없습니다.
          </li>
          <li>
            현재 위치는 기기와 주변 환경에 따라 실제와 다를 수 있어, 진행률과 코스 이탈 안내가 정확하지 않을 수 있습니다.
          </li>
          <li>
            운영팀은 현재 위치를 운영팀 서버로 보내거나 저장하지 않으며, 가까운 순서와 진행률은 이용자의 기기 안에서
            계산합니다. 지도와 코스 사진을 불러오는 외부 서비스에 전달되는 정보를 포함해 자세한 내용은{" "}
            <Link to="/privacy" className="underline underline-offset-4">
              개인정보처리방침
            </Link>
            에서 안내합니다.
          </li>
        </Items>
      </LegalSection>

      <LegalSection section={S.recordCard}>
        <Items ordered>
          <li>
            기록 카드는 이용자가 고른 사진과 코스 기록으로 이미지를 만드는 기능입니다. 사진과 만든 이미지는 이용자의 기기
            안에서만 처리하며 운영팀 서버로 보내지 않습니다.
          </li>
          <li>
            기록 카드에 넣는 사진에 대한 권리와 책임은 이용자에게 있습니다. 이용자는 다른 사람의 초상권이나 저작권을
            침해하는 사진을 쓰거나 공유해서는 안 됩니다.
          </li>
        </Items>
      </LegalSection>

      <LegalSection section={S.duties}>
        <P>이용자는 코스를 이용할 때 다음을 지켜야 합니다.</P>
        <Items ordered>
          <li>이동 중에는 화면을 보지 말고 주변을 살핍니다.</li>
          <li>「도로교통법」 등 교통 법규와 현장의 안내·통제를 따릅니다.</li>
          <li>날씨, 코스 상태, 자신의 건강 상태를 확인하고 무리하지 않습니다.</li>
        </Items>
        <P>이용자는 다음 행위를 해서는 안 됩니다.</P>
        <Items ordered>
          <li>자동화된 프로그램으로 서비스의 정보를 대량으로 수집하거나 서버에 과도한 요청을 보내는 행위</li>
          <li>다른 사람의 이메일을 쓰거나 거짓 내용으로 1:1 문의를 보내는 행위</li>
          <li>서비스 운영을 방해하거나 보안 기능을 우회하는 행위</li>
          <li>그 밖에 관계 법령을 위반하는 행위</li>
        </Items>
        <P>운영팀은 위 행위에 해당하는 이용을 제한할 수 있습니다.</P>
      </LegalSection>

      <LegalSection section={S.inquiry}>
        <Items ordered>
          <li>
            이용자는 1:1 문의로 서비스를 이용하며 궁금한 점이나 잘못된 정보를 알릴 수 있으며, 운영팀은 이용자가 입력한
            이메일로 답변합니다.
          </li>
          <li>확인에 시간이 걸리는 문의는 답변이 늦어질 수 있습니다.</li>
          <li>짧은 시간에 여러 번 보내는 문의는 제한될 수 있습니다.</li>
        </Items>
      </LegalSection>

      <LegalSection section={S.membership}>
        <Items ordered>
          <li>
            이용자는 카카오 로그인으로 회원 가입을 할 수 있으며, 가입하지 않아도 마이페이지를 뺀 서비스를 이용할 수
            있습니다.
          </li>
          <li>
            서비스는 법정대리인의 동의를 받는 절차를 제공하지 않으므로 회원 가입은 만 14세 이상만 할 수 있습니다.
            운영팀은 14세 미만 아동이 가입한 사실을 알게 되면 회원 정보를 삭제하고 가입을 취소할 수 있습니다.
          </li>
          <li>
            회원은 마이페이지에서 언제든지 탈퇴할 수 있습니다. 탈퇴하면 카카오 계정과의 연결이 해제되고 회원 정보와
            마이페이지에 모인 기록이 삭제되며, 삭제한 정보는 되돌릴 수 없습니다.
          </li>
          <li>
            회원이 카카오 계정관리나 카카오톡에서 서비스와의 연결을 끊거나 카카오계정을 탈퇴하면 탈퇴한 것으로 보고, 회원
            정보와 마이페이지에 모인 기록을 삭제합니다.
          </li>
          <li>
            회원은 자신의 카카오 계정을 안전하게 관리해야 하며, 다른 사람의 계정으로 로그인해서는 안 됩니다. 회원이 처리하는
            개인정보에 관한 자세한 내용은{" "}
            <Link to="/privacy" className="underline underline-offset-4">
              개인정보처리방침
            </Link>
            에서 안내합니다.
          </li>
        </Items>
      </LegalSection>

      <LegalSection section={S.profile}>
        <Items ordered>
          <li>
            회원은 마이페이지에서 닉네임과 한 줄 소개를 정하고 바꿀 수 있습니다. 한 줄 소개는 선택 항목이며, 쪽지·리뷰 등
            앞으로 추가되는 기능에서 다른 이용자에게 보일 수 있습니다.
          </li>
          <li>
            회원은 닉네임과 한 줄 소개에 다음 내용을 적어서는 안 됩니다: 다른 사람의 개인정보나 다른 사람을 사칭하는
            내용, 다른 사람의 명예나 권리를 침해하는 내용, 욕설·음란·혐오 표현, 광고, 그 밖에 관계 법령을 위반하는 내용.
          </li>
          <li>
            운영팀은 제2항에 해당하는 닉네임이나 한 줄 소개를 알게 되면 회원에게 알리고 수정을 요청하거나, 해당 내용을
            지우고 기본값으로 바꿀 수 있습니다.
          </li>
        </Items>
      </LegalSection>

      <LegalSection section={S.copyright}>
        <Items ordered>
          <li>
            서비스의 화면 구성과 운영팀이 만든 콘텐츠에 대한 권리는 운영팀에 있습니다. 이용자는 운영팀의 허락 없이 이를
            복제해 영리 목적으로 쓸 수 없습니다.
          </li>
          <li>
            공공데이터와 코스·관광지 사진에 대한 권리는 각 제공 기관에 있으며, 사진마다 공공누리 이용조건이 다를 수
            있습니다. 이용자가 이를 다른 곳에 쓰려면 제공 기관의 이용조건을 따라야 합니다.
          </li>
          <li>
            서비스가 이용하는 공공데이터와 지도·경로 계산 등 외부 서비스의 출처는 서비스 화면 하단의 데이터 출처 안내에서
            확인할 수 있습니다.
          </li>
        </Items>
      </LegalSection>

      <LegalSection section={S.liability}>
        <P>
          운영팀은 무료로 제공하는 서비스와 관련해 다음 손해에 대해서는 책임을 지지 않습니다. 다만 운영팀의 고의 또는
          중대한 과실로 생긴 손해는 그렇지 않습니다.
        </P>
        <Items ordered>
          <li>이용자가 코스를 이용하거나 이동하는 중에 생긴 사고와 손해</li>
          <li>공공데이터나 외부 서비스의 오류, 지연, 중단으로 생긴 손해</li>
          <li>이용자가 제7조에 따른 확인 없이 방문, 대회 참가, 혜택 신청을 해서 생긴 손해</li>
          <li>제6조에 따라 서비스를 변경하거나 중단해서 생긴 손해</li>
          <li>이용자가 이 약관이나 관계 법령을 지키지 않아 생긴 손해</li>
        </Items>
      </LegalSection>

      <LegalSection section={S.disputes}>
        <Items ordered>
          <li>
            운영팀과 이용자는 서비스와 관련해 생긴 분쟁을 원만하게 해결하기 위해 성실히 협의합니다. 이용자는 1:1 문의로
            의견이나 불만을 알릴 수 있습니다.
          </li>
          <li>협의로 해결되지 않은 분쟁에는 대한민국 법을 적용하며, 관할 법원은 「민사소송법」에 따라 정합니다.</li>
        </Items>
      </LegalSection>

      <LegalSection section={S.addendum}>
        <P>이 약관은 {EFFECTIVE_DATE}부터 시행합니다.</P>
        <P>이전 이용약관</P>
        <ul className="mt-1 list-disc pl-5 text-[14px] leading-relaxed text-ink">
          {PREVIOUS_VERSIONS.map((version) => (
            <li key={version.termsPath}>
              <Link to={version.termsPath} className="text-accent underline underline-offset-4">
                {version.period} 적용
              </Link>
            </li>
          ))}
        </ul>
      </LegalSection>
    </div>
  );
}
