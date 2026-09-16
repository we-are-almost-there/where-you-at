from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    durunubi_api_key: str = ""
    kakao_rest_api_key: str = ""
    tour_api_key: str = ""
    supabase_url: str = ""
    supabase_key: str = ""
    inquiry_webhook_url: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
