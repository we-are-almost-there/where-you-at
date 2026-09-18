from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    durunubi_api_key: str = ""
    kakao_rest_api_key: str = ""
    tour_api_key: str = ""
    supabase_url: str = ""
    supabase_key: str = ""
    inquiry_webhook_url: str = ""
    # 카카오 로그인 전용 앱의 값. 좌표 변환에 쓰는 kakao_rest_api_key와는 다른 앱이다.
    # 하나라도 비어 있으면 로그인 API가 503을 돌려준다.
    kakao_login_client_id: str = ""
    kakao_login_client_secret: str = ""
    kakao_login_redirect_uri: str = ""
    # 로그인 앱의 어드민 키. 탈퇴할 때 카카오 연결 해제에 쓴다. 비어 있으면 탈퇴 API가 503을 돌려준다.
    kakao_login_admin_key: str = ""
    # 로그인 토큰 서명 키. 32바이트 이상이 아니면 로그인과 인증 API가 503을 돌려준다.
    jwt_secret: str = ""
    # Render 공개 트래픽은 Cloudflare를 거친다. 그 배포에서만 true로 켜고,
    # 로컬이나 다른 호스팅에서는 클라이언트가 직접 보낼 수 있는 헤더를 믿지 않는다.
    trust_cloudflare_ip_header: bool = False
    # Cloudflare R2(S3 호환) 비공개 버킷. 프로필 사진과 기록 카드 이미지를 폴더로 나눠 둔다.
    # 하나라도 비어 있으면 이미지 저장 기능만 쓸 수 없다(storage.is_configured()).
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
