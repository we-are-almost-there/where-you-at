from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    durunubi_api_key: str = ""
    kakao_rest_api_key: str = ""
    tour_api_key: str = ""
    supabase_url: str = ""
    supabase_key: str = ""
    inquiry_webhook_url: str = ""
    # Render 공개 트래픽은 Cloudflare를 거친다. 그 배포에서만 true로 켜고,
    # 로컬이나 다른 호스팅에서는 클라이언트가 직접 보낼 수 있는 헤더를 믿지 않는다.
    trust_cloudflare_ip_header: bool = False

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
