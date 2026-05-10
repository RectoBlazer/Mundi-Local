import os
import asyncio
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

    # 2) Generate reply (Gemini direct)
    reply = mundi.gemini_generate_reply(
        f"Channel: Telegram\nCustomer: {handle}\nMessage: {text}"
    )

    # 3) Persist and send
    mundi.update_ticket_reply(ticket_id, reply)
    await context.bot.send_message(chat_id=chat_id, text=reply)

    mundi.log_agent(
        "telegram_inbound_and_reply", {"ticket_id": ticket_id, "chat_id": chat_id}
    )


async def approval_notifier_loop(app: Application):
    # Poll pending_orders for approved orders and notify customer chats
    while True:
        try:
            orders = mundi.fetch_pending_orders_to_notify()
            # print("[notifier] fetched orders:", orders)  # optional debug

            for o in orders:
                chat_id = mundi.get_ticket_chat_id(o["ticket_id"])
                if not chat_id:
                    mundi.mark_order_notified(o["id"])
                    continue

                product = o.get("product_name") or "your item"
                qty = o.get("qty") or 1

                msg = (
                    "Your order was approved. ✅\n\n"
                    f"Item: {product}\n"
                    f"Qty: {qty}\n\n"
                    "We’ll follow up with next steps shortly."
                )

                await app.bot.send_message(chat_id=int(chat_id), text=msg)

                mundi.mark_order_notified(o["id"])
                mundi.log_agent(
                    "telegram_order_approved_notified",
                    {"order_id": o["id"], "chat_id": chat_id},
                )

        except Exception as e:
            print("[notifier] error:", e)

        await asyncio.sleep(mundi.sleep_seconds())

async def post_init(app: Application) -> None:
    app.create_task(approval_notifier_loop(app))

def main():
    load_dotenv()

    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        raise RuntimeError("Missing TELEGRAM_BOT_TOKEN")

    for k in ["MUNDI_USER_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY"]:
        if not os.getenv(k):
            raise RuntimeError(f"Missing {k}")

    app = Application.builder().token(token).post_init(post_init).build()
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))

    # Schedule notifier on the application's event loop (no threads)
    # app.create_task(approval_notifier_loop(app))

    print("Cara Telegram service running (polling)...")

    # Python 3.14: ensure a loop exists in main thread
    asyncio.set_event_loop(asyncio.new_event_loop())
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()