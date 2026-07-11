import os
import re
import time
import uuid
from collections import defaultdict, deque

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

load_dotenv()

DIFY_BASE_URL = os.environ.get("DIFY_BASE_URL", "http://localhost/v1")
DIFY_CHATFLOW_API_KEY = os.environ.get("DIFY_CHATFLOW_API_KEY", "")

MAX_MESSAGE_LENGTH = 2000
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_REQUESTS = 20
UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

app = Flask(__name__)

_request_log: dict[str, deque] = defaultdict(deque)


def _rate_limited(key: str) -> bool:
    now = time.monotonic()
    log = _request_log[key]
    while log and now - log[0] > RATE_LIMIT_WINDOW_SECONDS:
        log.popleft()
    if len(log) >= RATE_LIMIT_MAX_REQUESTS:
        return True
    log.append(now)
    return False


def _visitor_user_id(body: dict) -> str:
    visitor_id = body.get("visitor_id", "")
    if UUID_RE.match(visitor_id):
        return f"web-{visitor_id}"
    return f"web-{uuid.uuid4()}"


@app.route("/")
def chat():
    return render_template("chat.html")


@app.route("/chat-message", methods=["POST"])
def chat_message():
    if _rate_limited(request.remote_addr or "unknown"):
        return jsonify({"error": "Too many requests. Please slow down and try again shortly."}), 429

    body = request.json or {}
    message = body.get("message", "").strip()
    conversation_id = body.get("conversation_id", "")

    if not message:
        return jsonify({"error": "Please enter a message."}), 400
    if len(message) > MAX_MESSAGE_LENGTH:
        return jsonify({"error": f"Message is too long (max {MAX_MESSAGE_LENGTH} characters)."}), 400

    if not DIFY_CHATFLOW_API_KEY:
        return jsonify({"error": "Server is missing DIFY_CHATFLOW_API_KEY. Set it in .env and restart."}), 500

    try:
        resp = requests.post(
            f"{DIFY_BASE_URL}/chat-messages",
            headers={
                "Authorization": f"Bearer {DIFY_CHATFLOW_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "inputs": {},
                "query": message,
                "response_mode": "blocking",
                "conversation_id": conversation_id,
                "user": _visitor_user_id(body),
            },
            timeout=120,
        )
    except requests.RequestException as exc:
        print(f"[chat-message] Dify request failed: {exc}")
        return jsonify({"error": "Could not reach the assistant right now. Please try again."}), 502

    if resp.status_code != 200:
        print(f"[chat-message] Dify returned {resp.status_code}: {resp.text}")
        return jsonify({"error": "The assistant had trouble answering that. Please try again."}), 502

    data = resp.json()
    return jsonify({
        "answer": data.get("answer", ""),
        "conversation_id": data.get("conversation_id", conversation_id),
    })


@app.route("/clear-conversation", methods=["POST"])
def clear_conversation():
    body = request.json or {}
    conversation_id = body.get("conversation_id", "").strip()
    if not conversation_id:
        return jsonify({"cleared": True})

    if not DIFY_CHATFLOW_API_KEY:
        return jsonify({"error": "Server is missing DIFY_CHATFLOW_API_KEY. Set it in .env and restart."}), 500

    try:
        resp = requests.delete(
            f"{DIFY_BASE_URL}/conversations/{conversation_id}",
            headers={
                "Authorization": f"Bearer {DIFY_CHATFLOW_API_KEY}",
                "Content-Type": "application/json",
            },
            json={"user": _visitor_user_id(body)},
            timeout=30,
        )
    except requests.RequestException as exc:
        print(f"[clear-conversation] Dify request failed: {exc}")
        return jsonify({"error": "Could not reach the assistant right now. Please try again."}), 502

    if resp.status_code not in (200, 204):
        print(f"[clear-conversation] Dify returned {resp.status_code}: {resp.text}")
        return jsonify({"error": "Could not clear the conversation. Please try again."}), 502

    return jsonify({"cleared": True})


if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1", port=5001)
