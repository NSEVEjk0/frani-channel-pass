// Frani Channel Pass — DM command handler.
// A visitor DMs `join` to get a payment request for a pass, `status` to check
// their membership, and `cancel` to stop auto-anything (there is no recurring
// charge; cancel simply marks them so they receive no more posts). Pure and
// testable; wallet-backed capability is injected via `deps`.

import { config } from './config.js';
import { membershipStatus } from './channel.js';

const HELP = [
  `${config.channelName} — paid channel on Unicity testnet2.`,
  '',
  'Commands (DM me):',
  '  join            → get a payment request for a channel pass',
  '  status          → your membership status and days left',
  '  cancel          → stop receiving posts (no auto-charge exists anyway)',
  '  about           → what this is',
  '  help            → this message',
  '',
  `A pass costs ${config.passPriceUct} UCT for ${config.passDays} days. Paying again extends your pass.`,
].join('\n');

function aboutText(identity) {
  const lines = [
    config.channelName + ' (Frani Channel Pass)',
    'A paywalled broadcast channel. Pay once for a pass and receive channel',
    'posts by DM for its duration. Unpaid users get only a teaser. This is',
    'access control — it does not generate or scan markets.',
    '',
    `Wallet pubkey: ${identity?.chainPubkey || '(unknown)'}`,
  ];
  if (identity?.directAddress) lines.push(`Direct address: ${identity.directAddress}`);
  if (identity?.nametag) lines.push(`Nametag: @${identity.nametag}`);
  lines.push('', `Pass: ${config.passPriceUct} UCT / ${config.passDays} days. Overpayment refunded.`);
  lines.push('', 'Made by CRYPTFRANI · Owner/creator: Itachi · testnet2 only.');
  return lines.join('\n');
}

function parse(body) {
  const trimmed = String(body || '').trim();
  if (!trimmed) return { command: 'help', rest: '' };
  const space = trimmed.indexOf(' ');
  if (space === -1) return { command: trimmed.toLowerCase(), rest: '' };
  return { command: trimmed.slice(0, space).toLowerCase(), rest: trimmed.slice(space + 1).trim() };
}

// deps:
//   identity
//   requestPass(sender)   -> { success, requestId?, error? }
//   getStatus(sender)     -> membershipStatus object
//   cancel(sender)        -> bool (was a member)
export async function handleMessage(body, sender, deps) {
  const { command } = parse(body);

  switch (command) {
    case 'help':
    case '?':
      return { reply: HELP };

    case 'about':
      return { reply: aboutText(deps.identity) };

    case 'status': {
      const st = await deps.getStatus(sender);
      if (!st.member) return { reply: 'You are not a member. Send "join" to get a pass.' };
      if (st.active) return { reply: `Active member. ${st.daysLeft} day(s) left (until ${st.expiresAtIso}).` };
      if (st.cancelled) return { reply: 'Your membership is cancelled. Send "join" to start again.' };
      return { reply: `Your pass expired on ${st.expiresAtIso}. Send "join" to renew.` };
    }

    case 'join':
    case 'subscribe': {
      const res = await deps.requestPass(sender);
      if (!res || !res.success) {
        return { reply: `Could not create the pass request${res?.error ? ': ' + res.error : ''}. Try again shortly.` };
      }
      return {
        reply: [
          `${config.channelName} pass: ${config.passPriceUct} UCT for ${config.passDays} days.`,
          'Pay the request and your pass activates immediately. Paying again extends it.',
          'Overpayment is refunded automatically.',
          `Request id: ${res.requestId}`,
        ].join('\n'),
      };
    }

    case 'cancel':
    case 'unsubscribe': {
      const was = await deps.cancel(sender);
      return {
        reply: was
          ? 'Cancelled. You will receive no more posts. There is no recurring charge, and no refund of the remaining pass time.'
          : 'You have no active membership to cancel.',
      };
    }

    default:
      return { reply: `Unknown command "${command}". Send "help".` };
  }
}

export { HELP, aboutText, parse };
