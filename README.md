# Frani Channel Pass

A paywalled broadcast channel on Unicity testnet2. Pay once for a pass and receive the channel's posts by DM for its duration. Unpaid users get only a teaser. This is **access control** — who may read the channel — not a market-scanning product.

Made by **CRYPTFRANI**. Owner / creator: **Itachi**.

---

## Track

Social and messaging.

## Is it Agentic?

No. Frani Channel Pass sells passes, maintains an allow list, and delivers posts to active members. No autonomous behaviour, no model in the loop.

## Runs on AstridOS?

No.

## Live on-network

- Network: **testnet2**
- Wallet pubkey (from a live boot): `027d3ce868994be98a619387f404a579394df7db4759657a153eb8a802fdcd4daf`

Each deployment holds its own wallet and prints its address at startup.

## SDK features used

| Feature | Where |
| --- | --- |
| `sphere.payments.requests.create()` | Payment request for a channel pass on `join` |
| `transfer:incoming` event | Grants / extends a pass on confirmed payment |
| `sphere.communications.sendDM()` | Delivers posts to active members |
| `sphere.payments.send()` + safety guards | Refund of over/underpayment (only outbound path) |

## What makes it different

This is a **membership gate**, deliberately separate from any content product. It does not generate posts, scan markets, or produce intelligence — the operator writes posts, and the channel's only job is deciding **who receives them**. (It is not a Daily Market Digest clone; there is no market analysis here at all.)

Passes are **duration-based and stacking**: a pass grants N days, and paying again extends from the later of now or the current expiry, so an early renewal never loses time. There is **no recurring charge** — a pass simply lapses when its days run out, and `cancel` stops delivery immediately. It is **earn-only**: pass fees come in, and the only outbound payment is a refund of under- or over-payment. Cancelling does not refund remaining pass time (stated plainly, so expectations are clear).

## Access rules

- **Active member** (paid, not expired, not cancelled) → receives every post by DM.
- **Unpaid / expired / cancelled** → receives the teaser and a prompt to `join`; never the post body.
- **Underpayment** → refunded in full, no pass granted.
- **Overpayment** → pass granted, the excess refunded.

## Try it without a wallet

Membership, expiry stacking, and access logic run with no network:

```bash
npm install
npm test
```

## Commands

```
channel post "your message"     Deliver a post to all active members
channel members                 List active members
channel about                   What this service is
channel help                    Command list
channel daemon                  Run the pass + delivery service
```

Over DM: `join` (get a pass payment request), `status` (days left), `cancel`, `about`, `help`.

## Run it

```bash
# 1. install
npm install

# 2. copy config (defaults to testnet2)
cp .env.example .env

# 3. run the daemon (sells passes, grants access, answers DMs)
node bin/channel.js daemon

# 4. broadcast a members-only post
node bin/channel.js post "This week's members-only note ..."

# 5. see who is subscribed
node bin/channel.js members
```

### As a service

```bash
sudo cp systemd/frani-channel-pass.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now frani-channel-pass
journalctl -u frani-channel-pass -f
```

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `CHANNEL_NETWORK` | `testnet2` | Network. testnet2 only; other values are refused. |
| `CHANNEL_DATA_DIR` | `./wallet-data` | Where the wallet keys/state live. |
| `CHANNEL_WALLET_API` | `https://wallet-api.unicity.network` | testnet2 wallet-api. |
| `CHANNEL_ORACLE_KEY` | public testnet2 key | Oracle key (not a secret on testnet2). |
| `CHANNEL_DEVICE_ID` | `frani-channel-1` | Stable per-machine session id. |
| `CHANNEL_NAMETAG` | _(empty)_ | Optional @nametag to register on first run. |
| `CHANNEL_STATE` | `./channel-data/state.json` | Members + posts state file. |
| `CHANNEL_NAME` | `Frani Channel` | Channel display name. |
| `CHANNEL_PASS_PRICE_UCT` | `5` | Pass price in UCT. |
| `CHANNEL_PASS_DAYS` | `30` | Days granted per pass. |
| `CHANNEL_TEASER` | _(see file)_ | Text shown to unpaid users. |

## Structure

```
bin/channel.js       CLI + daemon entrypoint
src/config.js        env-driven config, testnet2 guard
src/wallet.js        Sphere SDK boundary (holds its own keys)
src/amounts.js       BigInt UCT ↔ base-unit conversion
src/channel.js       membership + expiry + post model
src/refund.js        single-attempt, double-pay-safe refunds
src/store.js         single-file state persistence
src/service.js       DM command handler
test/channel.test.js membership + expiry + access tests
systemd/             service unit
```

## Tests

```bash
npm test
```

Eight checks cover pass activation, expiry stacking (early renewal and post-expiry), total-paid accumulation, cancellation, active-member filtering, post numbering, and status reporting.

## Keys and safety

Frani Channel Pass holds its own wallet under `wallet-data/`. It never asks anyone for a seed or private key, runs on testnet2 only, and refuses to start on another network unless explicitly overridden. The only outbound payment is a refund of under/overpayment. `.env`, `wallet-data/`, and `channel-data/` are gitignored.

---

MIT licensed. Not financial software; provided as-is.
