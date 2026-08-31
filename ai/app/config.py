from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    checkout_api_url: str = "http://localhost:8080"
    agent_service_token: str = "dev-service-token"
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-opus-5"
    max_tokens: int = 8192
    request_timeout_seconds: float = 30.0
    default_instruction: str = (
        "Restock what is on the list. Buy the smallest sensible quantity of each item "
        "and stay well inside the remaining budget."
    )


settings = Settings()
