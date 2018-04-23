import {action, computed, observable, runInAction} from 'mobx';
import {add, find, pathOr} from 'rambda';
import {BalanceListApi} from '../api/index';
import tradingWalletKeys from '../constants/tradingWalletKeys';
import {AssetBalanceModel, WalletModel} from '../models';
import MarketService from '../services/marketService';
import {BaseStore, RootStore} from './index';

class BalanceListStore extends BaseStore {
  @computed
  get getWalletsWithPositiveBalances() {
    return this.walletList
      .filter(b => b.totalBalance > 0)
      .sort((a, b) => b.totalBalance - a.totalBalance);
  }

  @computed
  get getBalances() {
    return this.walletList
      .filter(b => b.totalBalance > 0)
      .sort((a, b) => b.totalBalance - a.totalBalance);
  }

  @computed
  get totalBalance() {
    return this.walletList.map(b => b.totalBalanceInBaseAsset).reduce(add, 0);
  }

  @computed
  get tradingWalletBalances() {
    return (this.tradingWallet && this.tradingWallet.balances) || [];
  }

  @observable currentWalletId: string;

  @computed
  get currentWallet() {
    return (
      this.walletList.find(w => w.id === this.currentWalletId) ||
      this.walletList.find(w => w.type === tradingWalletKeys.trading)
    );
  }

  @computed
  get tradingWallet() {
    return find(w => w.type === tradingWalletKeys.trading, this.walletList);
  }

  @observable.shallow private walletList: WalletModel[] = [];
  @observable.shallow private tradingAssets: AssetBalanceModel[] = [];

  constructor(store: RootStore, private readonly api: BalanceListApi) {
    super(store);
  }

  fetchAll = () => {
    return this.api
      .fetchAll()
      .then((resp: any) => {
        runInAction(() => {
          this.walletList = resp.map((wallet: any) => new WalletModel(wallet));
          this.updateWalletBalances();
        });
        return Promise.resolve();
      })
      .catch(Promise.reject);
  };

  @action
  updateWalletBalances = async () => {
    const {
      baseAssetId,
      getInstrumentById,
      getAssetById
    } = this.rootStore.referenceStore;
    this.walletList.forEach(wallet => {
      wallet.balances.forEach((assetBalance: AssetBalanceModel) => {
        const {balance, id} = assetBalance;

        const asset = getAssetById(id);

        assetBalance.name = pathOr('', ['name'], asset);
        assetBalance.accuracy = pathOr('', ['accuracy'], asset);

        assetBalance.balanceInBaseAsset = MarketService.convert(
          balance,
          id,
          baseAssetId,
          getInstrumentById
        );
      });
    });
  };

  changeWallet = (walletId: string) => {
    this.currentWalletId = walletId;
  };

  subscribe = (session: any) => {
    session.subscribe(`balances`, this.onUpdateBalance);
  };

  onUpdateBalance = async () => {
    this.fetchAll();
  };

  reset = () => {
    this.walletList = [];
    this.tradingAssets = [];
  };
}

export default BalanceListStore;
