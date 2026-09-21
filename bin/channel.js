#!/usr/bin/env node
// Frani Channel Pass — CLI + daemon entrypoint.
// Made by CRYPTFRANI. Owner / creator: Itachi. Unicity testnet2 only.

import process from 'node:process';
import { config } from '../src/config.js';
import { openWallet, closeWallet, uctCoinId } from '../src/wallet.js';
import { ChannelStore } from '../src/store.js';
import {
  grantPass,
  isActiveMember,
  cancelMembership,
  activeMembers,
  addPost,
  membershipStatus,
} from '../src/channel.js';
import { toBaseUnits, fromBaseUnits } from '../src/amounts.js';
import { refundOnce } from '../src/refund.js';
import { handleMessage, HELP, aboutText } from '../src/service.js';

const log = (...a) => console.log(new Date().toISOString(), ...a);

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) out[a.slice(2, eq)] = a.slice(eq + 1);
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[a.slice(2)] = argv[++i];
      else out[a.slice(2)] = true;
    } else {
      out._.push(a);
    }
  }
  return out;
}

async function cmdHelp() {
  console.log(HELP);
}

async function cmdAbout() {
  try {
    const { sphere } = await openWallet();
    console.log(aboutText(sphere.identity));
    await closeWallet(sphere);
  } catch {
    console.log(aboutText(null));
  }
}

async function cmdMembers() {
  const store = new ChannelStore(config.dataFile, { channelName: config.channelName, network: config.network });
  await store.load();
  const members = activeMembers(store.state);
  console.log(`${config.channelName}: ${members.length} active member(s)`);
  for (const m of members) {
    const daysLeft = Math.ceil((m.expiresAt - Date.now()) / 86400000);
    console.log(`  ${m.pubkey.slice(0, 16)}…  ${daysLeft}d left  paid ${fromBaseUnits(m.totalPaidBase)} UCT`);
  }
  const total = Object.keys(store.state.members).length;
  console.log(`(${total} total member records, ${store.state.posts.length} posts)`);
}

// Post from the CLI is queued into state; the running daemon delivers it. If no
// daemon is running, use `channel post --deliver` inside the daemon process.
async function cmdPost(args) {
  const body = args.body || args._.join(' ');
  if (!body) {
    console.error('Usage: channel post "your message" (run while the daemon is up to deliver)');
    process.exit(1);
  }
  // Deliver immediately by opening a wallet here.
  const { sphere } = await openWallet();
  const store = new ChannelStore(config.dataFile, { channelName: config.channelName, network: config.network });
  await store.load();
  try {
    const post = addPost(store.state, body);
    await store.save();
    const members = activeMembers(store.state);
    let delivered = 0;
    for (const m of members) {
      try {
        await sphere.communications.sendDM(m.pubkey, `[${config.channelName}] ${post.id}\n\n${body}`);
        delivered += 1;
      } catch (e) {
        log('deliver to', m.pubkey.slice(0, 12), 'failed:', e.message);
      }
    }
    console.log(`Posted ${post.id} to ${delivered}/${members.length} active member(s).`);
  } finally {
    await closeWallet(sphere);
  }
}

async function cmdDaemon() {
  const { sphere, created, generatedMnemonic } = await openWallet();
  const store = new ChannelStore(config.dataFile, { channelName: config.channelName, network: config.network });
  await store.load();

  if (created && generatedMnemonic) {
    log('A NEW wallet was created. Back up', config.dataDir, '— the mnemonic is not shown again.');
  }

  const identity = sphere.identity;
  const coinId = await uctCoinId();
  const passPriceBase = toBaseUnits(config.passPriceUct, config.decimals);
  log(config.channelName, '(Frani Channel Pass) is live on', config.network);
  log('wallet pubkey:', identity?.chainPubkey);
  if (identity?.directAddress) log('direct address:', identity.directAddress);
  if (identity?.nametag) log('nametag: @' + identity.nametag);
  log('pass:', config.passPriceUct, 'UCT for', config.passDays, 'days');

  // Membership is keyed by the payer's CHAIN pubkey (from the incoming
  // transfer). A DM sender is a TRANSPORT pubkey, so resolve it before any
  // membership lookup, or a paid member would look like a stranger.
  const resolveChain = async (sender) => {
    try {
      const peer = await sphere.resolve(sender);
      if (peer?.chainPubkey) return peer.chainPubkey;
    } catch {
      /* best effort */
    }
    return sender;
  };

  const deps = {
    identity,
    requestPass: async (sender) => {
      return sphere.payments.requests.create(sender, {
        coinId,
        amount: passPriceBase,
        memo: `${config.channelName} pass (${config.passDays} days)`,
      });
    },
    getStatus: async (sender) => membershipStatus(store.state, await resolveChain(sender)),
    cancel: async (sender) => {
      const m = cancelMembership(store.state, await resolveChain(sender));
      if (m) await store.save();
      return !!m;
    },
  };

  sphere.on('message:dm', async (msg) => {
    const sender = msg.senderPubkey;
    const label = msg.senderNametag ? '@' + msg.senderNametag : sender?.slice(0, 12);
    log('dm from', label, '::', String(msg.content || '').slice(0, 60));
    try {
      const { reply } = await handleMessage(msg.content, sender, deps);
      if (reply) {
        await sphere.communications.sendDM(sender, reply);
        log('reply sent to', label);
      }
    } catch (err) {
      log('handler error:', err.message);
    }
  });

  // Pass purchase: grant/extend membership on confirmed payment; refund excess.
  sphere.on('transfer:incoming', async (transfer) => {
    let sum = 0n;
    for (const t of transfer.tokens || []) {
      if (t.coinId === coinId && t.amount != null) {
        try {
          sum += BigInt(t.amount);
        } catch {
          /* ignore */
        }
      }
    }
    if (sum <= 0n) return;
    const buyer = transfer.senderPubkey;
    const arrived = sum.toString();
    log('incoming', fromBaseUnits(arrived), 'UCT from', buyer?.slice(0, 12));

    const price = BigInt(passPriceBase);
    if (sum < price) {
      log('underpaid pass; refunding');
      await refundOnce(sphere, { recipient: buyer, amountBase: arrived, coinId, memo: 'Refund (underpayment) — channel pass' });
      await sphere.communications.sendDM(buyer, `The pass is ${config.passPriceUct} UCT but ${fromBaseUnits(arrived)} arrived. Refunded — please pay the full amount.`).catch(() => {});
      return;
    }

    const member = grantPass(store.state, buyer, { days: config.passDays, paidBase: price.toString() });
    await store.save();
    log('pass granted to', buyer?.slice(0, 12), 'until', new Date(member.expiresAt).toISOString());
    await sphere.communications
      .sendDM(buyer, `Welcome to ${config.channelName}! Your pass is active until ${new Date(member.expiresAt).toISOString()}. You will receive posts here.`)
      .catch(() => {});

    const over = (sum - price).toString();
    if (BigInt(over) > 0n) {
      log('overpaid; refunding', fromBaseUnits(over));
      const r = await refundOnce(sphere, { recipient: buyer, amountBase: over, coinId, memo: 'Overpayment refund — channel pass' });
      await sphere.communications.sendDM(buyer, `Refunded ${fromBaseUnits(over)} UCT overpayment (${r.status}).`).catch(() => {});
    }
  });

  const shutdown = async () => {
    log('shutting down...');
    await closeWallet(sphere);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  log('listening for joins, payments, and DMs. Ctrl-C to stop.');
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const args = parseArgs(rest);
  switch (cmd) {
    case 'daemon':
      return cmdDaemon();
    case 'post':
      return cmdPost(args);
    case 'members':
      return cmdMembers();
    case 'about':
      return cmdAbout();
    case 'help':
    case undefined:
    case '--help':
    case '-h':
      return cmdHelp();
    default:
      console.error(`Unknown command "${cmd}". Try "channel help".`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('fatal:', err.message);
  process.exit(1);
});
