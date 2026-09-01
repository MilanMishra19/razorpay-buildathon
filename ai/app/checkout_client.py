import httpx

from .models import CartDecision, CartLine, CatalogItem, Mandate, RestockEntry


class CheckoutError(RuntimeError):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class CheckoutClient:
    def __init__(self, base_url: str, service_token: str, timeout: float) -> None:
        self._http = httpx.AsyncClient(base_url=base_url.rstrip("/"), timeout=timeout)
        self._service_token = service_token

    async def aclose(self) -> None:
        await self._http.aclose()

    def _headers(self, user_id: int) -> dict[str, str]:
        return {"X-Service-Token": self._service_token, "X-On-Behalf-Of": str(user_id)}

    async def _request(self, method: str, path: str, user_id: int, **kwargs) -> httpx.Response:
        try:
            response = await self._http.request(method, path, headers=self._headers(user_id), **kwargs)
        except httpx.HTTPError as exc:
            raise CheckoutError(f"checkout API unreachable: {exc}") from exc

        if response.status_code >= 400:
            raise CheckoutError(
                f"checkout API {method} {path} returned {response.status_code}: {response.text}",
                response.status_code,
            )
        return response

    async def active_mandates(self, user_id: int) -> list[Mandate]:
        response = await self._request("GET", "/intent-mandates/active", user_id)
        return [Mandate.model_validate(row) for row in response.json()]

    async def catalog(self, user_id: int, category: str) -> list[CatalogItem]:
        response = await self._request("GET", "/catalog", user_id, params={"category": category})
        return [CatalogItem.model_validate(row) for row in response.json()]

    async def restock_list(self, user_id: int) -> list[RestockEntry]:
        response = await self._request("GET", "/restock-list", user_id)
        return [RestockEntry.model_validate(row) for row in response.json()]

    async def consume_restock(self, user_id: int, catalog_ids: list[int] | None = None) -> list[int]:
        response = await self._request(
            "POST", "/restock-list/consume", user_id, json={"catalog_ids": catalog_ids or []}
        )
        return response.json()

    async def propose_cart(self, user_id: int, mandate_id: int, lines: list[CartLine]) -> CartDecision:
        body = {
            "intent_mandate_id": mandate_id,
            "cart_items": [line.model_dump() for line in lines],
        }
        response = await self._request("POST", "/cart-mandates", user_id, json=body)
        return CartDecision.model_validate(response.json())

    async def pay(self, user_id: int, cart_mandate_id: int) -> dict:
        response = await self._request(
            "POST", "/payment-mandates", user_id, json={"cart_mandate_id": cart_mandate_id}
        )
        return response.json()

    async def record_run(self, user_id: int, payload: dict) -> int:
        response = await self._request("POST", "/agent-runs", user_id, json=payload)
        return response.json()["id"]
