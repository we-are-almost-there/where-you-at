-- 기능 비활성화·공개 연기 시 FAQ 복구. 번호순 스키마 적용에는 포함하지 않는다.
-- RECORD_FEATURES_ENABLED=false 재배포 후 실행:
-- python -m scripts.seed_help --no-record-features
-- 질문·ID를 유지하며 누락·중복이면 두 FAQ의 변경 전체를 롤백한다.
do $$
declare
    changed integer;
begin
    update faq
    set answer = E'현재 완주 기록과 기록 카드의 서버 저장 기능은 제공하지 않습니다. 따라가기를 종료한 뒤 기록 카드 이미지를 기기에 저장하거나 공유해 주세요.\n\n기기에 이미지를 저장하거나 공유하는 것만으로는 마이페이지에 새 기록이나 카드가 저장되지 않습니다. 서버 저장 기능이 다시 제공되면 안내하겠습니다.',
        is_published = true
    where question = '따라가기 기록은 저장되나요?';
    get diagnostics changed = row_count;
    if changed <> 1 then
        raise exception '기록 저장 FAQ가 없거나 중복됩니다. 기본 FAQ 시드와 기존 행을 확인하세요.';
    end if;

    update faq
    set answer = E'기록 카드에서 ‘이미지 저장’을 누르세요. 공유를 지원하는 기기에서는 공유 창이 열리고, 그 밖에는 이미지 파일로 내려받습니다.\n\n현재 서버 저장 기능은 제공하지 않으므로 기기 저장·공유만 이용할 수 있습니다. 기기에 이미지가 저장되지 않으면 화면을 캡처해 주세요.',
        is_published = true
    where question = '기록 카드 이미지는 어떻게 저장하나요?';
    get diagnostics changed = row_count;
    if changed <> 1 then
        raise exception '기록 카드 FAQ가 없거나 중복됩니다. 기본 FAQ 시드와 기존 행을 확인하세요.';
    end if;
end;
$$;
