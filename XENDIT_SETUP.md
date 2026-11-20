# Xendit callback integration

The in-app Xendit checkout and invoice creation flow has been removed. New
installment payments are submitted from `/dashboard/angsuran` by bank transfer
and proof upload, then reviewed by staff.

The webhook at `/api/webhooks/xendit` remains active to record callbacks for
previously created invoices and to forward callbacks belonging to other apps
sharing the Xendit account. Existing pending invoice links may still be opened
from their payment notifications while valid. Do not remove the webhook or
change its shared callback token without coordinating every connected app.

## 1. Webhook token

In Xendit Settings → Developers → Webhooks (or Settings → Webhooks), configure
the Invoice webhook URL as:

`https://<your-domain>/api/webhooks/xendit`

Set `XENDIT_CALLBACK_TOKEN` in the server environment to the webhook
verification token. It must be identical in every app sharing the account.
Never expose this value to the client, commit it, or paste it into chat.

The webhook verifies `x-callback-token`, idempotently records `PAID`/`SETTLED`
and `EXPIRED` status for matching payment records, and adds a paid installment
to its application when the record still exists. Firestore rules remain
deny-all; webhook writes use the Firebase Admin SDK.

## 2. Shared Xendit account (forwarded callbacks)

The Xendit account is shared with other apps, so `/api/webhooks/xendit` forwards
callbacks that belong to them **before** any VSV payment logic runs. The raw
body and original `x-callback-token` are passed through unchanged; a non-2xx
answer from the target returns `502` so Xendit retries.

| `external_id` prefix | Owner                                                      | Target (env, optional)                                                                     |
| -------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `trm-`               | Turrima / Agrisys (store & distributor VAs)                | `TURRIMA_WEBHOOK_URL` (default `https://turrima.integratedfarming.id/api/xendit/callback`) |
| `vsv-`               | Previous VentureGo app (36 legacy contracts, own database) | `LEGACY_VSV_WEBHOOK_URL` (default `https://venture-go.vercel.app/api/webhooks/xendit`)     |

- `XENDIT_CALLBACK_TOKEN` must be **identical** in every app sharing the account.
- Do not remove these forwarding routes. Otherwise callbacks are answered with
  `200` and lost; Xendit will not retry.
- Keep the previous VentureGo deployment running until its contracts are
  migrated here.
