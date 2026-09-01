from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    checkout_api_url: str = "http://localhost:8080"
    agent_service_token: str = "dev-service-token"
    request_timeout_seconds: float = 30.0
    cors_allowed_origins: str = "http://localhost:5173"

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allowed_origins.split(",") if origin.strip()]

    llm_provider: str = "gemini"
    google_api_key: str | None = None
    gemini_model: str = "gemini-3.5-flash"
    groq_api_key: str | None = None
    groq_model: str = "openai/gpt-oss-120b"
    fallback_offline: bool = True
    max_output_tokens: int = 2048

    @property
    def active_api_key(self) -> str | None:
        return {"gemini": self.google_api_key, "groq": self.groq_api_key}.get(self.llm_provider)

    @property
    def active_model(self) -> str:
        return {"gemini": self.gemini_model, "groq": self.groq_model}.get(self.llm_provider, "none")

    default_instruction: str = (
        "Restock what is on the list. Buy the smallest sensible quantity of each item "
        "and stay well inside the remaining budget."
    )


settings = Settings()
