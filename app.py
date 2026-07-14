import json
import os
import re
import time
import uuid
from collections import defaultdict, deque

import requests
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, render_template, request, stream_with_context

load_dotenv()

DIFY_BASE_URL = os.environ.get("DIFY_BASE_URL", "http://localhost/v1")
DIFY_CHATFLOW_API_KEY = os.environ.get("DIFY_CHATFLOW_API_KEY", "")
BOOK_REQUEST_SECRET = os.environ.get("BOOK_REQUEST_SECRET", "")
APPS_SCRIPT_URL = os.environ.get("APPS_SCRIPT_URL", "")
APPS_SCRIPT_TOKEN = os.environ.get("APPS_SCRIPT_TOKEN", "")

MAX_MESSAGE_LENGTH = 2000
MAX_BOOK_FIELD_LENGTH = 500
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_REQUESTS = 20
UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
_DEFAULT_CONFIRMATIONS = {
    "yes": "Got it — I've noted this for the librarian to consider purchasing.",
    "no": "No problem! Let me know if you'd like help finding something else.",
}

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


def _drain_dify_stream(resp) -> dict:
    answer = ""
    conversation_id = ""
    message_id = ""
    for raw_line in resp.iter_lines():
        if not raw_line:
            continue
        line = raw_line.decode("utf-8")
        if not line.startswith("data:"):
            continue
        payload = line[len("data:"):].strip()
        if not payload:
            continue
        event = json.loads(payload)
        conversation_id = event.get("conversation_id", conversation_id)
        message_id = event.get("message_id", message_id)
        event_type = event.get("event")

        if event_type == "message":
            answer += event.get("answer", "")
        elif event_type == "human_input_required":
            data = event.get("data", {})
            return {
                "requires_action": True,
                "conversation_id": conversation_id,
                "message_id": message_id,
                "answer": answer,
                "form_token": data.get("form_token", ""),
                "question": data.get("form_content", ""),
                "actions": [
                    {"id": a.get("id"), "title": a.get("title")}
                    for a in data.get("actions", [])
                ],
            }
        elif event_type == "message_end":
            break
        elif event_type == "error":
            raise RuntimeError(event.get("message", "Dify workflow error"))

    return {"answer": answer, "conversation_id": conversation_id}


def _poll_for_answer(conversation_id: str, message_id: str, user: str, attempts: int = 10, delay: float = 1.0):
    for attempt in range(attempts):
        if attempt > 0:
            time.sleep(delay)
        try:
            resp = requests.get(
                f"{DIFY_BASE_URL}/messages",
                headers={"Authorization": f"Bearer {DIFY_CHATFLOW_API_KEY}"},
                params={"conversation_id": conversation_id, "user": user},
                timeout=15,
            )
        except requests.RequestException:
            continue
        if resp.status_code != 200:
            continue
        for msg in resp.json().get("data", []):
            if msg.get("id") == message_id and msg.get("answer"):
                return msg["answer"]
    return None


@app.route("/stream-test")
def stream_test():
    def generate():
        for i in range(5):
            yield f"data: chunk {i} at {time.time()}\n\n"
            time.sleep(2)

    return Response(stream_with_context(generate()), mimetype="text/event-stream")


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
                "response_mode": "streaming",
                "conversation_id": conversation_id,
                "user": _visitor_user_id(body),
            },
            timeout=120,
            stream=True,
        )
    except requests.RequestException as exc:
        print(f"[chat-message] Dify request failed: {exc}")
        return jsonify({"error": "Could not reach the assistant right now. Please try again."}), 502

    if resp.status_code != 200:
        print(f"[chat-message] Dify returned {resp.status_code}: {resp.text}")
        return jsonify({"error": "The assistant had trouble answering that. Please try again."}), 502

    try:
        result = _drain_dify_stream(resp)
    except RuntimeError as exc:
        print(f"[chat-message] Dify workflow error: {exc}")
        return jsonify({"error": "The assistant had trouble answering that. Please try again."}), 502

    result.setdefault("conversation_id", conversation_id)
    return jsonify(result)


@app.route("/human-input-submit", methods=["POST"])
def human_input_submit():
    if _rate_limited(request.remote_addr or "unknown"):
        return jsonify({"error": "Too many requests. Please slow down and try again shortly."}), 429

    body = request.json or {}
    form_token = (body.get("form_token") or "").strip()
    action_id = (body.get("action_id") or "").strip()
    message_id = (body.get("message_id") or "").strip()
    conversation_id = (body.get("conversation_id") or "").strip()
    prior_answer = body.get("prior_answer") or ""

    if not form_token or not action_id or not message_id:
        return jsonify({"error": "Missing form_token, action_id, or message_id."}), 400

    if not DIFY_CHATFLOW_API_KEY:
        return jsonify({"error": "Server is missing DIFY_CHATFLOW_API_KEY. Set it in .env and restart."}), 500

    user = _visitor_user_id(body)

    try:
        resp = requests.post(
            f"{DIFY_BASE_URL}/form/human_input/{form_token}",
            headers={
                "Authorization": f"Bearer {DIFY_CHATFLOW_API_KEY}",
                "Content-Type": "application/json",
            },
            json={"action": action_id, "inputs": {}, "user": user},
            timeout=30,
        )
    except requests.RequestException as exc:
        print(f"[human-input-submit] Dify submit failed: {exc}")
        return jsonify({"error": "Could not submit your response right now. Please try again."}), 502

    if resp.status_code != 200:
        print(f"[human-input-submit] Dify submit returned {resp.status_code}: {resp.text}")
        return jsonify({"error": "Could not submit your response right now. Please try again."}), 502

    answer = _poll_for_answer(conversation_id, message_id, user)
    if answer is None:
        return jsonify({
            "error": "Your response was recorded, but the assistant is taking longer than "
                     "expected. Please check back in a moment."
        }), 504

    # Dify's persisted answer is often identical to what was already shown before the pause
    # (no separate confirmation text gets appended after resuming). Only surface genuinely
    # new content; otherwise fall back to a short canned confirmation instead of a duplicate.
    if prior_answer and answer.startswith(prior_answer):
        new_text = answer[len(prior_answer):].strip()
    elif answer == prior_answer:
        new_text = ""
    else:
        new_text = answer

    if not new_text:
        new_text = _DEFAULT_CONFIRMATIONS.get(action_id, "Thanks for letting me know!")

    return jsonify({"answer": new_text, "conversation_id": conversation_id})


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


@app.route("/api/book-requests", methods=["POST"])
def book_requests():
    if not BOOK_REQUEST_SECRET or request.headers.get("X-API-Key") != BOOK_REQUEST_SECRET:
        return jsonify({"error": "Unauthorized"}), 401

    if _rate_limited(request.remote_addr or "unknown"):
        return jsonify({"error": "Too many requests. Please slow down and try again shortly."}), 429

    body = request.json or {}
    title = (body.get("requested_title") or "").strip()
    author = (body.get("requested_author") or "").strip()
    original_request = (body.get("student_query") or "").strip()

    if not title:
        return jsonify({"error": "Missing book title."}), 400
    if any(len(field) > MAX_BOOK_FIELD_LENGTH for field in (title, author, original_request)):
        return jsonify({"error": f"Field too long (max {MAX_BOOK_FIELD_LENGTH} characters)."}), 400

    if not APPS_SCRIPT_URL:
        return jsonify({"error": "Server is missing APPS_SCRIPT_URL. Set it in .env and restart."}), 500

    try:
        resp = requests.post(
            APPS_SCRIPT_URL,
            json={
                "token": APPS_SCRIPT_TOKEN,
                "title": title,
                "author": author,
                "original_request": original_request,
            },
            timeout=30,
        )
        ok = resp.status_code == 200 and (resp.json() or {}).get("ok") is True
    except (requests.RequestException, ValueError) as exc:
        print(f"[book-requests] Apps Script call failed: {exc}")
        return jsonify({"error": "Could not save the request right now. Please try again."}), 502

    if not ok:
        print(f"[book-requests] Apps Script rejected: {resp.status_code} {resp.text}")
        return jsonify({"error": "Could not save the request right now. Please try again."}), 502

    return jsonify({"stored": True})


if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1", port=5001)
