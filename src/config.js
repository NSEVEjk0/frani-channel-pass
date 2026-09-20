// Frani Channel Pass — configuration.
// Made by CRYPTFRANI. Owner / creator: Itachi. Unicity testnet2 only.

import process from 'node:process';

export const NETWORK = process.env.CHANNEL_NETWORK || 'testnet2';

export const config = {
  network: NETWORK,
  dataDir: process.env.CHANNEL_DATA_DIR || './wallet-data',
  walletApiBaseUrl:
    process.env.CHANNEL_WALLET_API || 'https://wallet-api.unicity.network',
  oracleApiKey:
    process.env.CHANNEL_ORACLE_KEY || 'sk_ddc3cfcc001e4a28ac3fad7407f99590',
  deviceId: process.env.CHANNEL_DEVICE_ID || 'frani-channel-1',
  nametag: process.env.CHANNEL_NAMETAG || '',
  dataFile: process.env.CHANNEL_STATE || './channel-data/state.json',
  // Channel identity.
  channelName: process.env.CHANNEL_NAME || 'Frani Channel',
  // Price of a pass (whole UCT) and how many days it grants.
  passPriceUct: process.env.CHANNEL_PASS_PRICE_UCT || '5',
  passDays: Number(process.env.CHANNEL_PASS_DAYS || '30'),
  // Teaser shown to unpaid users when a post goes out.
  teaser: process.env.CHANNEL_TEASER || 'A members-only post just went out. Send "join" to get a pass and read the full channel.',
  decimals: Number(process.env.CHANNEL_DECIMALS || '18'),
};

export function assertTestnet2() {
  if (config.network !== 'testnet2' && !process.env.CHANNEL_ALLOW_NONTESTNET2) {
    throw new Error(
      `Frani Channel Pass is testnet2-only. Refusing to start on '${config.network}'. ` +
        `Set CHANNEL_ALLOW_NONTESTNET2=1 only if you truly mean it.`,
    );
  }
}
