-- 기록 저장 기능 공개용 FAQ. 번호순 스키마 적용에는 포함하지 않는다.
-- 기본 seed_help 및 프론트 연동 배포 후, RECORD_FEATURES_ENABLED=true 직전에 실행한다.
-- 실행: python -m scripts.seed_help --record-features
-- 기존 질문과 ID를 유지한다. 누락·중복이면 전체 변경을 롤백한다.
do $$
declare
    changed integer;
begin
    update faq
    set answer = E'로그인한 뒤 마이페이지 저장을 선택하고 저장이 완료된 완주 기록과 기록 카드는 서버에 보관됩니다. 저장한 내용은 페이지를 닫거나 새로고침한 뒤에도 마이페이지에서 다시 확인할 수 있습니다.\n\n이미지를 기기에 내려받거나 공유하는 것만으로는 마이페이지에 저장되지 않습니다. 마이페이지 저장이 완료되었는지 확인해 주세요.',
        is_published = true
    where question = '따라가기 기록은 저장되나요?';
    get diagnostics changed = row_count;
    if changed <> 1 then
        raise exception '기록 저장 FAQ가 없거나 중복됩니다. 기본 FAQ 시드와 기존 행을 확인하세요.';
    end if;

    update faq
    set answer = E'기록 카드는 마이페이지에 보관하거나 이미지 파일로 기기에 저장·공유할 수 있습니다.\n\n- **마이페이지 보관**: 로그인한 뒤 마이페이지 저장을 선택하고 저장이 완료되면 마이페이지에서 다시 조회할 수 있습니다.\n- **기기 저장·공유**: ‘이미지 저장’을 누르면 공유를 지원하는 기기에서는 공유 창이 열리고, 그 밖에는 이미지 파일로 내려받습니다. 이 동작만으로는 마이페이지에 저장되지 않습니다.\n\n기기에 이미지가 저장되지 않으면 화면을 캡처해 주세요.',
        is_published = true
    where question = '기록 카드 이미지는 어떻게 저장하나요?';
    get diagnostics changed = row_count;
    if changed <> 1 then
        raise exception '기록 카드 FAQ가 없거나 중복됩니다. 기본 FAQ 시드와 기존 행을 확인하세요.';
    end if;
end;
$$;
