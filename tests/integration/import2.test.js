import {
  HDSegwitElectrumSeedP2WPKHWallet,
  HDLegacyBreadwalletWallet,
  HDSegwitBech32Wallet,
  HDLegacyElectrumSeedP2PKHWallet,
  LegacyWallet,
  SegwitP2SHWallet,
  SegwitBech32Wallet,
  HDLegacyP2PKHWallet,
  HDSegwitP2SHWallet,
  WatchOnlyWallet,
  HDAezeedWallet,
  SLIP39SegwitP2SHWallet,
  SLIP39SegwitBech32Wallet,
} from '../../class';
import startImport from '../../class/wallet-import2';
const assert = require('assert');

global.net = require('net'); // needed by Electrum client. For RN it is proviced in shim.js
global.tls = require('tls'); // needed by Electrum client. For RN it is proviced in shim.js
const BlueElectrum = require('../../blue_modules/BlueElectrum'); // so it connects ASAP

// jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000;

afterAll(async () => {
  // after all tests we close socket so the test suite can actually terminate
  BlueElectrum.forceDisconnect();
});

beforeAll(async () => {
  // awaiting for Electrum to be connected. For RN Electrum would naturally connect
  // while app starts up, but for tests we need to wait for it
  await BlueElectrum.waitTillConnected();
});

jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000;

const createStore = password => {
  const state = { wallets: [] };
  const history = [];

  const onProgress = data => {
    history.push({ action: 'progress', data });
    state.progress = data;
  };

  const onFinish = data => {
    history.push({ action: 'finish', data });
    state.finish = data;
  };

  const onWallet = data => {
    console.info('onWallet', data.getID());
    history.push({ action: 'wallet', data });
    state.wallets.push(data);
  };

  const onPassword = () => {
    history.push({ action: 'password', data: password });
    state.password = password;
    return password;
  };

  const onNoQuestions = () => {
    history.push({ action: 'noQuestions' });
    state.noQuestions = true;
    return password;
  };

  return {
    state,
    history,
    callbacks: { onProgress, onFinish, onWallet, onPassword, onNoQuestions },
  };
};

describe('import procedure', () => {
  it.skip('can be cancelled', async () => {
    // returns undefined on first call, throws exception on second
    let flag = false;
    const onPassword = async () => {
      if (flag) throw new Error('Cancel Pressed');
      flag = true;
      return undefined;
    };
    const store = createStore();
    const imprt = await startImport('6PnU5voARjBBykwSddwCdcn6Eu9EcsK24Gs5zWxbJbPZYW7eiYQP8XgKbN', { ...store.callbacks, onPassword });
    assert.strictEqual(store.state.wallets.length, 0);
    assert.strictEqual(imprt.cancelled, true);
  });

  it('can import multiple wallets', async () => {
    const store = createStore();
    await startImport('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', store.callbacks);
    assert.strictEqual(store.state.wallets.length > 3, true);
    console.info('store.state.wallets.length', store.state.wallets.length)
  });
});
