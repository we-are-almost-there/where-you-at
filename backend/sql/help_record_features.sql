-- 기록 저장 기능 공개용 FAQ. 번호순 스키마 적용에는 포함하지 않는다.
-- 기본 seed_help 및 프론트 연동 배포 후, RECORD_FEATURES_ENABLED=true 직전에 실행한다.
-- 실행: python -m scripts.seed_help --record-features
-- 기존 질문과 ID를 유지한다. 누락·중복이면 전체 변경을 롤백한다.
do $$
declare
    changed integer;
begin
    update faq
    set answer = E'로그인한 상태에서 50m 이상 이동한 뒤 따라가기를 종료하면 완주 기록을 서버에 저장합니다. 기록 카드에서 ‘이미지 저장’을 누르면 기기 저장·공유와 함께 해당 기록의 카드 이미지도 서버에 저장합니다.\n\n서버에 저장이 완료된 기록과 카드는 페이지를 닫거나 새로고침한 뒤에도 마이페이지에서 다시 확인할 수 있습니다. 기기 저장·공유가 성공했더라도 서버 저장은 실패할 수 있으니 화면의 저장 안내와 마이페이지를 확인해 주세요.\n\n로그인하지 않고 종료한 기록은 서버에 저장되지 않으며, 카드 이미지는 기기에 저장하거나 공유할 수 있습니다.',
        is_published = true
    where question = '따라가기 기록은 저장되나요?';
    get diagnostics changed = row_count;
    if changed <> 1 then
        raise exception '기록 저장 FAQ가 없거나 중복됩니다. 기본 FAQ 시드와 기존 행을 확인하세요.';
    end if;

    update faq
    set answer = E'기록 카드에서 ‘이미지 저장’을 누르세요. 공유를 지원하는 기기에서는 공유 창이 열리고, 그 밖에는 이미지 파일로 내려받습니다.\n\n로그인한 상태에서 종료한 기록은 완주 기록 저장이 완료되면 카드 이미지도 서버에 저장합니다. 저장한 계정의 마이페이지에서 다시 조회할 수 있습니다. 로그인하지 않고 종료한 기록은 기기 저장·공유만 제공합니다.\n\n기기 저장·공유와 서버 저장은 별도로 처리됩니다. 공유를 취소해도 서버에는 카드가 저장될 수 있고, 기기에 이미지를 저장했더라도 서버 저장은 실패할 수 있습니다. 화면의 저장 안내와 마이페이지를 확인해 주세요. 기기에 이미지가 저장되지 않으면 화면을 캡처해 주세요.',
        is_published = true
    where question = '기록 카드 이미지는 어떻게 저장하나요?';
    get diagnostics changed = row_count;
    if changed <> 1 then
        raise exception '기록 카드 FAQ가 없거나 중복됩니다. 기본 FAQ 시드와 기존 행을 확인하세요.';
    end if;
end;
$$;
