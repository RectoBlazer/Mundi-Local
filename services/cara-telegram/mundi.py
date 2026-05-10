# services/cara-telegram/mundi.py
import os
import time
import requests

def env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise RuntimeError(f"Missing env var: {name}")
    return v

def supabase_headers():
    # Service role: server-side only
    return {
        "apikey": env("SUPABASE_SERVICE_ROLE_KEY"),
        "Authorization": f"Bearer {env('SUPABASE_SERVICE_ROLE_KEY')}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

def supabase_url(path: str) -> str:
    base = env("SUPABASE_URL").rstrip("/")
    return f"{base}{path}"

def insert_ticket(chat_id: str, handle: str, message: str) -> dict:
    payload = {
        "user_id": env("MUNDI_USER_ID"),
        "channel": "telegram",
        "customer_handle": handle,
        "message": message,
        "status": "open",
        "external_id": chat_id,
    }
    r = requests.post(
        supabase_url("/rest/v1/customer_tickets"),
        headers=supabase_headers(),
        json=payload,
        timeout=15,
    )
    r.raise_for_status()
    return r.json()[0]

def log_agent(action: str, payload: dict):
    body = {
        "user_id": env("MUNDI_USER_ID"),
        "agent": "cara",
        "action": action,
        "status": "success",
        "payload": payload,
    }
    requests.post(
        supabase_url("/rest/v1/agent_logs"),
        headers=supabase_headers(),
        json=body,
        timeout=15,
    )

# --- Gemini direct (MVP) ---
def gemini_generate_reply(text: str) -> str:
    api_key = env("GEMINI_API_KEY")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"

    system = (
        "You are Cara, a helpful customer support agent for a small business. "
        "Write a concise reply the owner can send. Keep it under 120 words. "
        "Ask at most 1 clarifying question."
    )

    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": text}]}],
        "generationConfig": {"temperature": 0.3},
    }

    r = requests.post(url, json=body, timeout=25)
    r.raise_for_status()
    j = r.json()
    parts = j.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    out = "".join([p.get("text", "") for p in parts]).strip()
    if not out:
        out = "Thanks for reaching out—can you share a bit more detail so I can help?"
    return out

def update_ticket_reply(ticket_id: str, reply: str):
    # PATCH via PostgREST
    r = requests.patch(
        supabase_url(f"/rest/v1/customer_tickets?id=eq.{ticket_id}"),
        headers=supabase_headers(),
        json={"ai_reply": reply, "status": "replied"},
        timeout=15,
    )
    r.raise_for_status()

def fetch_pending_orders_to_notify():
    # Requires you to add a column pending_orders.notified boolean default false
    # Query: approved and not notified
    params = {
        "select": "id,ticket_id,product_name,qty,status",
        "status": "eq.approved",
        "notified": "eq.false",
        "user_id": f"eq.{env('MUNDI_USER_ID')}",
    }
    r = requests.get(
        supabase_url("/rest/v1/pending_orders"),
        headers=supabase_headers(),
        params=params,
        timeout=15,
    )
    r.raise_for_status()
    return r.json()

def get_ticket_chat_id(ticket_id: str) -> str | None:
    params = {"select": "external_id", "id": f"eq.{ticket_id}"}
    r = requests.get(
        supabase_url("/rest/v1/customer_tickets"),
        headers=supabase_headers(),
        params=params,
        timeout=15,
    )
    r.raise_for_status()
    rows = r.json()
    if not rows:
        return None
    return rows[0].get("external_id")

def mark_order_notified(order_id: str):
    r = requests.patch(
        supabase_url(f"/rest/v1/pending_orders?id=eq.{order_id}"),
        headers=supabase_headers(),
        json={"notified": True},
        timeout=15,
    )
    r.raise_for_status()

def sleep_seconds() -> int:
    try:
        return int(os.getenv("POLL_INTERVAL", "3"))
    except:
        return 3