// Frani Channel Pass — membership and post model.
//
// Access control, not content generation. A member holds a pass that grants
// access until an expiry timestamp. Paying extends the pass (stacking days).
// Posts are broadcast only to members whose pass is currently active; unpaid or
// expired users receive a teaser instead of the content.

export function newState({ channelName, network }) {
  return {
    channelName,
    network,
    createdAt: Date.now(),
    members: {}, // pubkey -> { since, expiresAt, cancelled, totalPaidBase }
    posts: [], // { id, at, body }
  };
}

// Compute a new expiry when a member pays: stack from the later of now or the
// current expiry, so paying early extends rather than resets.
export function extendExpiry(currentExpiresAt, days, now = Date.now()) {
  const base = currentExpiresAt && currentExpiresAt > now ? currentExpiresAt : now;
  return base + days * 86400000;
}

export function grantPass(state, pubkey, { days, paidBase }, now = Date.now()) {
  const existing = state.members[pubkey];
  const expiresAt = extendExpiry(existing?.expiresAt, days, now);
  const member = {
    since: existing?.since || now,
    expiresAt,
    cancelled: false,
    totalPaidBase: (BigInt(existing?.totalPaidBase || '0') + BigInt(paidBase || '0')).toString(),
  };
  state.members[pubkey] = member;
  return member;
}

export function isActiveMember(state, pubkey, now = Date.now()) {
  const m = state.members[pubkey];
  return !!m && !m.cancelled && m.expiresAt > now;
}

export function cancelMembership(state, pubkey) {
  const m = state.members[pubkey];
  if (!m) return null;
  m.cancelled = true;
  m.cancelledAt = Date.now();
  return m;
}

export function activeMembers(state, now = Date.now()) {
  return Object.entries(state.members)
    .filter(([, m]) => !m.cancelled && m.expiresAt > now)
    .map(([pubkey, m]) => ({ pubkey, ...m }));
}

export function addPost(state, body) {
  const post = {
    id: 'POST-' + (state.posts.length + 1).toString().padStart(4, '0'),
    at: Date.now(),
    body,
  };
  state.posts.push(post);
  return post;
}

export function membershipStatus(state, pubkey, now = Date.now()) {
  const m = state.members[pubkey];
  if (!m) return { member: false, active: false };
  const active = !m.cancelled && m.expiresAt > now;
  return {
    member: true,
    active,
    cancelled: !!m.cancelled,
    expiresAt: m.expiresAt,
    expiresAtIso: new Date(m.expiresAt).toISOString(),
    daysLeft: active ? Math.ceil((m.expiresAt - now) / 86400000) : 0,
  };
}
