# services/cara-telegram/main.py
import os
import threading
from dotenv import load_dotenv
from telegram import Update
from telegram.ext import Application, MessageHandler, ContextTypes, filters

import mundi

def handle_to_name(update: Update) -> str:
    u = update.effective_user
    if not u:
        return "unknown"
    if u.username:
        return f"@{u.username}"
    name = " ".join([p for p in [u.first_name, u.last_name] if p])
    return name or "unknown"

async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.message or not update.message.text:
        return

    if not update.effective_chat or not update.effective_chat.id:
        return

    chat_id = str(update.effective_chat.id)
    text = update.message.text.strip()
    handle = handle_to_name(update)

    # 1) Insert into Mundi
    ticket = mundi.insert_ticket(chat_id=chat_id, handle=handle, message=text)
    ticket_id = ticket["id"]

    # 2) Generate reply (Gemini direct, MVP)
    reply = mundi.gemini_generate_reply(
        f"Channel: Telegram\nCustomer: {handle}\nMessage: {text}"
    )

    # 3) Persist and send
    mundi.update_ticket_reply(ticket_id, reply)
    await context.bot.send_message(chat_id=chat_id, text=reply)

    mundi.log_agent("telegram_inbound_and_reply", {"ticket_id": ticket_id, "chat_id": chat_id})

def approval_notifier_loop(app: Application):
    # polls pending_orders for approved orders and notifies customer
    while True:
        try:
            orders = mundi.fetch_pending_orders_to_notify()
            for o in orders:
                chat_id = mundi.get_ticket_chat_id(o["ticket_id"])
                if not chat_id:
                    mundi.mark_order_notified(o["id"])
                    continue

                product = o.get("product_name") or "your item"
                qty = o.get("qty") or 1

                msg = f"Your order was approved. ✅\n\nItem: {product}\nQty: {qty}\n\nWe’ll follow up with next steps shortly."
                app.bot.send_message(chat_id=int(chat_id), text=msg)

                mundi.mark_order_notified(o["id"])
                mundi.log_agent("telegram_order_approved_notified", {"order_id": o["id"], "chat_id": chat_id})
        except Exception as e:
            # keep loop alive
            print("[notifier] error:", e)

        import time
        time.sleep(mundi.sleep_seconds())

def main():
    load_dotenv()

    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        raise RuntimeError("Missing TELEGRAM_BOT_TOKEN")

    # Validate required env early
    for k in ["MUNDI_USER_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY"]:
        if not os.getenv(k):
            raise RuntimeError(f"Missing {k}")

    app = Application.builder().token(token).build()
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))

    # Start approval notifier in background
    t = threading.Thread(target=approval_notifier_loop, args=(app,), daemon=True)
    t.start()

    print("Cara Telegram service running (polling)...")
    app.run_polling(drop_pending_updates=True)

if __name__ == "__main__":
    main()
