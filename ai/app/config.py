from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    checkout_api_url: str = "http://localhost:8080"
    agent_service_token: str = "dev-service-token"
    request_timeout_seconds: float = 30.0

    llm_provider: str = "gemini"
    google_api_key: str | None = None
    gemini_model: str = "gemini-3.5-flash"
    max_output_tokens: int = 2048

    default_instruction: str = (
        "Restock what is on the list. Buy the smallest sensible quantity of each item "
        "and stay well inside the remaining budget."
    )


settings = Settings()
