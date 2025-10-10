import os
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field

PROXY_URL = os.getenv("ARMORIQ_PROXY_URL", "http://localhost:5001")


class Permissions(BaseModel):
    read: Optional[bool] = Field(None, description="Allow READ operations")
    create: Optional[bool] = Field(None, description="Allow CREATE operations")
    update: Optional[bool] = Field(None, description="Allow UPDATE operations")
    delete: Optional[bool] = Field(None, description="Allow DELETE operations")


class PolicyCreate(BaseModel):
    agentId: str = Field(..., description="Unique identifier for the agent")
    endpointId: str = Field(..., description="Registered endpoint identifier")
    permissions: Permissions = Field(default_factory=Permissions)


class PolicyUpdate(BaseModel):
    permissions: Permissions = Field(default_factory=Permissions)


app = FastAPI(
    title="ArmorIQ Admin API",
    description="REST interface for configuring ArmorIQ proxy policies, status, and logs.",
    version="1.0.0",
)


async def proxy_request(method: str, path: str, *, json: Optional[dict] = None, expected: tuple[int, ...] = (200,)) -> Optional[dict]:
    url = f"{PROXY_URL}{path}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.request(method, url, json=json)

    if response.status_code not in expected:
        try:
            detail = response.json()
        except ValueError:
            detail = {"error": response.text or response.reason_phrase}
        raise HTTPException(status_code=response.status_code, detail=detail)

    if response.status_code == status.HTTP_204_NO_CONTENT:
        return None

    if not response.content:
        return None

    try:
        return response.json()
    except ValueError as exc:
        raise HTTPException(status_code=500, detail={"error": "Invalid JSON from proxy", "details": str(exc)}) from exc


@app.get("/status", summary="Proxy health and inventory")
async def get_status():
    return await proxy_request("GET", "/health")


@app.get("/logs", summary="Recent audit logs")
async def get_logs():
    return await proxy_request("GET", "/api/audit-logs")


@app.get("/endpoints", summary="Registered MCP endpoints")
async def get_endpoints():
    return await proxy_request("GET", "/api/endpoints")


@app.get("/policies", summary="List all agent policies")
async def list_policies():
    return await proxy_request("GET", "/api/policies")


@app.get("/policies/{agent_id}", summary="Retrieve a single agent policy")
async def get_policy(agent_id: str):
    return await proxy_request("GET", f"/api/policies/{agent_id}")


@app.post("/policies", status_code=201, summary="Create a new agent policy")
async def create_policy(payload: PolicyCreate):
    return await proxy_request(
        "POST",
        "/api/policies",
        json=payload.model_dump(mode="json"),
        expected=(201,),
    )


@app.put("/policies/{agent_id}", summary="Update an existing policy")
async def update_policy(agent_id: str, payload: PolicyUpdate):
    return await proxy_request(
        "PUT",
        f"/api/policies/{agent_id}",
        json=payload.model_dump(mode="json"),
    )


@app.delete("/policies/{agent_id}", status_code=204, summary="Delete a policy")
async def delete_policy(agent_id: str):
    await proxy_request("DELETE", f"/api/policies/{agent_id}", expected=(204,))
    return
