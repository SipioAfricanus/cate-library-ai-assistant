import os

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

load_dotenv()

DIFY_BASE_URL = os.environ.get("DIFY_BASE_URL", "http://localhost/v1")
DIFY_CHATFLOW_API_KEY = os.environ.get("DIFY_CHATFLOW_API_KEY", "")

app = Flask(__name__)


@app.route("/")
def chat():
    return render_template("chat.html")


@app.route("/chat-message", methods=["POST"])
def chat_message():
    body = request.json or {}
    message = body.get("message", "").strip()
    conversation_id = body.get("conversation_id", "")

    if not message:
        return jsonify({"error": "Please enter a message."}), 400

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
                "user": "local-website-user",
            },
            timeout=120,
        )
    except requests.RequestException as exc:
        return jsonify({"error": f"Could not reach Dify: {exc}"}), 502

    if resp.status_code != 200:
        return jsonify({"error": f"Dify returned {resp.status_code}: {resp.text}"}), 502

    data = resp.json()
    return jsonify({
        "answer": data.get("answer", ""),
        "conversation_id": data.get("conversation_id", conversation_id),
    })


@app.route("/clear-conversation", methods=["POST"])
def clear_conversation():
    conversation_id = (request.json or {}).get("conversation_id", "").strip()
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
            json={"user": "local-website-user"},
            timeout=30,
        )
    except requests.RequestException as exc:
        return jsonify({"error": f"Could not reach Dify: {exc}"}), 502

    if resp.status_code not in (200, 204):
        return jsonify({"error": f"Dify returned {resp.status_code}: {resp.text}"}), 502

    return jsonify({"cleared": True})


if __name__ == "__main__":
    app.run(debug=True, port=5001)
