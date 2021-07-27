import {
  HDAezeedWallet,
  HDLegacyBreadwalletWallet,
  HDLegacyElectrumSeedP2PKHWallet,
  HDLegacyP2PKHWallet,
  HDSegwitBech32Wallet,
  HDSegwitElectrumSeedP2WPKHWallet,
  HDSegwitP2SHWallet,
  LegacyWallet,
  LightningCustodianWallet,
  MultisigHDWallet,
  PlaceholderWallet,
  SLIP39LegacyP2PKHWallet,
  SLIP39SegwitBech32Wallet,
  SLIP39SegwitP2SHWallet,
  SegwitBech32Wallet,
  SegwitP2SHWallet,
  WatchOnlyWallet,
} from '.';

import loc from '../loc';
import bip39WalletFormats from './bip39_wallet_formats.json';

const bip38 = require('../blue_modules/bip38');
const wif = require('wif');

const startImport = (importTextOrig, { onProgress, onFinish, onWallet, onPassword, onNoQuestions }) => {
  // state
  let promiseResolve;
  let position = 0;
  const total = 10;
  const promise = new Promise((resolve, reject) => {
    promiseResolve = resolve;
  });

  // actions
  const reportProgress = () => {
    if (position < total) position += 1;
    onProgress({ position, total });
  };
  const reportFinish = (cancelled = false) => {
    position = total;
    reportProgress();
    promiseResolve({ cancelled });
  };
  const reportWallet = wallet => {
    onWallet(wallet);
  };

  const importFunc = async () => {
    // The plan:
    // 1. ask for password, if needed and validate it
    // 2. call onNoQuestions
    //
    let text = importTextOrig.trim();
    let password;

    // BIP38 password required
    if (text.startsWith('6P')) {
      do {
        password = await onPassword(loc.wallets.looks_like_bip38, loc.wallets.enter_bip38_password);
      } while (!password);
    }

    // HD BIP39 wallet password is optinal
    const hd = new HDSegwitBech32Wallet();
    hd.setSecret(text);
    if (hd.validateMnemonic()) {
      password = await onPassword(loc.wallets.import_passphrase_title, loc.wallets.import_passphrase_message);
    }

    // AEZEED password needs to be correct
    const aezeed = new HDAezeedWallet();
    aezeed.setSecret(text);
    if (await aezeed.mnemonicInvalidPassword()) {
      do {
        password = await onPassword('', loc.wallets.enter_bip38_password);
        aezeed.setPassphrase(password);
      } while (await aezeed.mnemonicInvalidPassword());
    }

    // SLIP39 wallet password is optinal
    if (text.includes('\n')) {
      const s1 = new SLIP39SegwitP2SHWallet();
      s1.setSecret(text);

      if (s1.validateMnemonic()) {
        password = await onPassword(loc.wallets.import_passphrase_title, loc.wallets.import_passphrase_message);
      }
    }

    onNoQuestions(); // we don't need to ask for password, signalling that import UI can be closed

    if (text.startsWith('6P')) {
      const decryptedKey = await bip38.decrypt(text, password);

      if (decryptedKey) {
        text = wif.encode(0x80, decryptedKey.privateKey, decryptedKey.compressed);
      }
    }

    // is it multisig?
    // try {
    const ms = new MultisigHDWallet();
    ms.setSecret(text);
    if (ms.getN() > 0 && ms.getM() > 0) {
      await ms.fetchBalance();
      reportWallet(ms);
    }
    // } catch (e) {
    //   console.log(e);
    // }
    reportProgress();

    // is it lightning custodian?
    if (text.startsWith('blitzhub://') || text.startsWith('lndhub://')) {
      const lnd = new LightningCustodianWallet();
      if (text.includes('@')) {
        const split = text.split('@');
        lnd.setBaseURI(split[1]);
        lnd.setSecret(split[0]);
      }
      lnd.init();
      await lnd.authorize();
      await lnd.fetchTransactions();
      await lnd.fetchUserInvoices();
      await lnd.fetchPendingTransactions();
      await lnd.fetchBalance();
      reportWallet(lnd);
    }
    reportProgress();

    // check bip39 wallets
    for (const i of bip39WalletFormats) {
      let paths;
      if (i.iterate_accounts) {
        const basicPath = i.derivation_path.slice(0, -2); // remove 0' from the end
        paths = [...Array(5).keys()].map(j => basicPath + j + "'");
      } else {
        paths = [i.derivation_path];
      }
      let WalletClass;
      switch (i.script_type) {
        case 'p2pkh':
          WalletClass = HDLegacyP2PKHWallet;
          break;
        case 'p2wpkh-p2sh':
          WalletClass = HDSegwitP2SHWallet;
          break;
        default:
          WalletClass = HDSegwitBech32Wallet;
      }
      for (const path of paths) {
        const wallet = new WalletClass();
        wallet.setSecret(text);
        wallet.setPassphrase(password);
        wallet.setDerivationPath(path);
        if (await wallet.wasEverUsed()) reportWallet(wallet);
        reportProgress();
      }
    }

    // trying other wallet types
    // const hd4 = new HDSegwitBech32Wallet();
    // hd4.setSecret(text);
    // if (hd4.validateMnemonic()) {
    //   hd4.setPassphrase(password);
    //   if (await hd4.wasEverUsed()) {
    //     await hd4.fetchBalance(); fetching balance for BIP84 only on purpose
    //     reportWallet(hd4);
    //   }
    //   reportProgress();
    //
    //   const hd2 = new HDSegwitP2SHWallet();
    //   hd2.setSecret(text);
    //   hd2.setPassphrase(password);
    //   if (await hd2.wasEverUsed()) {
    //     reportWallet(hd2);
    //   }
    //   reportProgress();
    //
    //   const hd3 = new HDLegacyP2PKHWallet();
    //   hd3.setSecret(text);
    //   hd3.setPassphrase(password);
    //   if (await hd3.wasEverUsed()) {
    //     reportWallet(hd3);
    //   }
    //   reportProgress();
    //
    //   const hd1 = new HDLegacyBreadwalletWallet();
    //   hd1.setSecret(text);
    //   hd1.setPassphrase(password);
    //   if (await hd1.wasEverUsed()) {
    //     reportWallet(hd1);
    //   }
    //   reportProgress();
    //
    //   no scheme (BIP84/BIP49/BIP44/Bread) was ever used. lets import as default BIP84:
    //   reportWallet(hd4);
    // }
    // reportProgress();

    const segwitWallet = new SegwitP2SHWallet();
    segwitWallet.setSecret(text);
    if (segwitWallet.getAddress()) {
      // ok its a valid WIF

      const segwitBech32Wallet = new SegwitBech32Wallet();
      segwitBech32Wallet.setSecret(text);
      if (await segwitBech32Wallet.wasEverUsed()) {
        // yep, its single-address bech32 wallet
        await segwitBech32Wallet.fetchBalance();
        reportWallet(segwitBech32Wallet);
      }
      reportProgress();

      if (await segwitWallet.wasEverUsed()) {
        // yep, its single-address bech32 wallet
        await segwitWallet.fetchBalance();
        reportWallet(segwitWallet);
      }
      reportProgress();

      // default wallet is Legacy
      const legacyWallet = new LegacyWallet();
      legacyWallet.setSecret(text);
      reportWallet(legacyWallet);
    }
    reportProgress();

    // case - WIF is valid, just has uncompressed pubkey
    const legacyWallet = new LegacyWallet();
    legacyWallet.setSecret(text);
    if (legacyWallet.getAddress()) {
      await legacyWallet.fetchBalance();
      await legacyWallet.fetchTransactions();
      reportWallet(legacyWallet);
    }
    reportProgress();

    // if we're here - nope, its not a valid WIF

    // maybe its a watch-only address?
    const watchOnly = new WatchOnlyWallet();
    watchOnly.setSecret(text);
    if (watchOnly.valid()) {
      await watchOnly.fetchBalance();
      reportWallet(watchOnly);
    }
    reportProgress();

    // nope, not watch-only
    // try {
    const el2 = new HDSegwitElectrumSeedP2WPKHWallet();
    el2.setSecret(text);
    if (el2.validateMnemonic()) {
      // not fetching txs or balances, fuck it, yolo, life is too short
      reportWallet(el2);
    }
    reportProgress();
    // } catch (_) {}

    // try {
    const el3 = new HDLegacyElectrumSeedP2PKHWallet();
    el3.setSecret(text);
    if (el3.validateMnemonic()) {
      // not fetching txs or balances, fuck it, yolo, life is too short
      reportWallet(el3);
    }
    reportProgress();
    // } catch (_) {}

    // is it AEZEED?
    // try {
    const aezeed2 = new HDAezeedWallet();
    aezeed2.setSecret(text);
    aezeed2.setPassphrase(password);
    if (await aezeed2.validateMnemonicAsync()) {
      // not fetching txs or balances, fuck it, yolo, life is too short
      reportWallet(aezeed2);
    }
    reportProgress();
    // } catch (_) {}

    // if it is multi-line string, then it is probably SLIP39 wallet
    // each line - one share
    if (text.includes('\n')) {
      const s1 = new SLIP39SegwitP2SHWallet();
      s1.setSecret(text);

      if (s1.validateMnemonic()) {
        s1.setPassphrase(password);
        if (await s1.wasEverUsed()) {
          reportWallet(s1);
        }
        reportProgress();

        const s2 = new SLIP39LegacyP2PKHWallet();
        s2.setPassphrase(password);
        s2.setSecret(text);
        if (await s2.wasEverUsed()) {
          reportWallet(s2);
        }
        reportProgress();

        const s3 = new SLIP39SegwitBech32Wallet();
        s3.setSecret(text);
        s3.setPassphrase(password);
        reportWallet(s3);
      }
    }
    reportProgress();
  };

  // POEHALI
  importFunc()
    .then(() => reportFinish())
    .catch(e => {
      if (e.message === 'Cancel Pressed') {
        reportFinish(true);
        return;
      }
      console.warn('import error', e);
    });

  return promise;
};

export default startImport;
