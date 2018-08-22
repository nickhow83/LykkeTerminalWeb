import * as React from 'react';
import {Mosaic, MosaicDirection, MosaicNode} from 'react-mosaic-component';
import {AnalyticsEvents} from '../../constants/analyticsEvents';
import paths from '../../constants/paths';
import {keys} from '../../models';
import Widgets from '../../models/mosaicWidgets';
import {AnalyticsService} from '../../services/analyticsService';
import {AuthStore, BalanceListStore, ReferenceStore} from '../../stores';
import {getHashCode} from '../../utils/hashcode';
import {StorageUtils} from '../../utils/index';
import Backdrop from '../Backdrop/Backdrop';
import {Footer} from '../Footer';
import {Header} from '../Header';
import Modal from '../Modal/Modal';
import {NotificationList} from '../Notification';
import {Order} from '../Order';
import OrderBook from '../OrderBook';
import {Orders} from '../OrderList';
import {SessionNotificationComponent} from '../Session';
import styled, {colors} from '../styled';
import {ChartTabbedTile, TabbedTile, Tile} from '../Tile';
import {TradeLog, Trades} from '../TradeList';
import {Wallet} from '../TradingWallet';
import {TerminalProps} from './index';

const Shell = styled.div`
  background: ${colors.darkGraphite};
  height: 100vh;
  width: 100vw;
  padding: 0;
  margin: 0;
`;

const layoutStorage = StorageUtils(keys.layout);

const MAX_LEFT_PADDING = 20;
const MAX_RIGHT_PADDING = 75;
const MIN_PANE_SIZE_PERCENTAGE = 20;

const {
  ChartWidget,
  OrderWidget,
  OrderBookWidget,
  OrderListWidget,
  TradeListWidget,
  TradingWalletWidget
} = Widgets;

const ELEMENT_MAP: {[viewId: string]: JSX.Element} = {
  [ChartWidget]: (
    <ChartTabbedTile tabs={['Price chart', 'Depth chart']} authorize={false} />
  ),
  [TradeListWidget]: (
    <Tile title="Trade log">
      <TradeLog />
    </Tile>
  ),
  [OrderBookWidget]: (
    <Tile title="Order book">
      <OrderBook />
    </Tile>
  ),
  [OrderListWidget]: (
    <TabbedTile tabs={['Orders', 'Trades']}>
      <Orders />
      <Trades />
    </TabbedTile>
  ),
  [OrderWidget]: (
    <Tile title="Order" authorize={true} className="no-padding">
      <Order />
    </Tile>
  ),
  [TradingWalletWidget]: (
    <Tile title="Funds">
      <Wallet />
    </Tile>
  )
};

class Terminal extends React.Component<TerminalProps, {}> {
  state = {
    initialValue: {
      direction: 'row' as MosaicDirection,
      first: {
        direction: 'column' as MosaicDirection,
        first: OrderWidget,
        second: TradingWalletWidget,
        splitPercentage: 70
      },
      second: {
        direction: 'row' as MosaicDirection,
        first: {
          direction: 'column' as MosaicDirection,
          first: ChartWidget,
          second: OrderListWidget,
          splitPercentage: 65
        },
        second: {
          direction: 'column' as MosaicDirection,
          first: OrderBookWidget,
          second: TradeListWidget,
          splitPercentage: 70
        },
        splitPercentage: MAX_RIGHT_PADDING
      },
      splitPercentage: MAX_LEFT_PADDING
    }
  };

  private authStore: AuthStore = this.props.rootStore.authStore;
  private balanceListStore: BalanceListStore = this.props.rootStore
    .balanceListStore;
  private referenceStore: ReferenceStore = this.props.rootStore.referenceStore;
  private isMosaicChanged: boolean = false;

  handleVisibilityChange = () => {
    this.props.rootStore.uiStore.setPageVisibility(
      document.visibilityState === 'visible'
    );
  };

  componentDidMount() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.props.rootStore.uiStore.setPageVisibility(
      document.visibilityState === 'visible'
    );
    this.start().then(resp => {
      if (!resp) {
        return;
      }
      this.updateLayoutFromLocalStorage();
      this.bindChartOverlayHandler();

      AnalyticsService.handleIdentify(
        this.authStore.userInfo.email,
        AnalyticsEvents.UserIdentifyTraits(this.authStore.userInfo)
      );
    });
  }

  updateLayoutFromLocalStorage() {
    const layout = layoutStorage.get();
    if (!layout) {
      return;
    }

    const layoutFromLocalstorage = JSON.parse(layout);
    const currentStateHashCode = this.getStateHashCode(this.state.initialValue);
    const savedStateHashCode = this.getStateHashCode(layoutFromLocalstorage);
    if (currentStateHashCode !== savedStateHashCode) {
      layoutStorage.set('');
      return;
    }

    this.setState({
      initialValue: Object.assign(this.state.initialValue, JSON.parse(layout))
    });
  }

  bindChartOverlayHandler() {
    const firstColSplitter = document.getElementsByClassName(
      'mosaic-split -column'
    )[0];
    const rowSplitters = document.getElementsByClassName('mosaic-split -row');
    const splitters = [...Array.from(rowSplitters), firstColSplitter];
    const mouseUp = (event: MouseEvent) => {
      event.stopPropagation();
      document.body.removeEventListener('mouseup', mouseUp);

      this.toggleChartOverlayHelper(false);
    };

    if (splitters) {
      splitters.forEach(e => {
        // tslint:disable-next-line:no-unused-expression
        e &&
          e.addEventListener('mousedown', () => {
            document.body.addEventListener('mouseup', mouseUp);
            this.toggleChartOverlayHelper(true);
          });
      });
    }
  }

  toggleChartOverlayHelper(show = false) {
    const transparentDiv = document.getElementById('transparentDiv');
    if (transparentDiv) {
      transparentDiv!.style.display = show ? 'block' : 'none';
    }
  }

  handleRenderTile = (id: string) => ELEMENT_MAP[id];

  handleChange = (args: any) => {
    this.setState({
      initialValue: args
    });
    layoutStorage.set(JSON.stringify(args));

    if (!this.isMosaicChanged) {
      this.isMosaicChanged = true;
      setTimeout(() => (this.isMosaicChanged = false), 1000);

      AnalyticsService.handleClick(AnalyticsEvents.SectionSplitterMoved);
    }
  };

  async start() {
    if (this.authStore.isAuth) {
      await this.referenceStore.fetchReferenceData();

      await Promise.all([
        this.authStore.fetchUserInfo(),
        this.balanceListStore.fetchAll()
      ]);

      if (this.authStore.noKycAndFunds) {
        this.props.history.push(paths.kycAndFundsCheck);
        return false;
      } else {
        this.props.rootStore.start();
      }
    } else {
      this.authStore.signIn();
    }
    return true;
  }

  render() {
    return (
      <Shell>
        <NotificationList />
        {this.props.rootStore.modalStore.isModals ? (
          <div>
            <Backdrop />
            <Modal modals={this.props.rootStore.modalStore.modals} />
          </div>
        ) : null}
        {this.props.rootStore.sessionStore.sessionNotificationsBlockShown && (
          <SessionNotificationComponent />
        )}
        <Header history={this.props.history} />
        <Mosaic
          renderTile={this.handleRenderTile}
          onChange={this.handleChange}
          resize={{minimumPaneSizePercentage: MIN_PANE_SIZE_PERCENTAGE}}
          initialValue={this.state.initialValue}
        />
        <Footer />
      </Shell>
    );
  }

  private getStateHashCode = (state: MosaicNode<string>) =>
    getHashCode(this.getWidgetsArray(state));

  private getWidgetsArray = (
    state: MosaicNode<string>,
    widgetsArray: string[] = []
  ) => {
    const propertyNames = ['first', 'second'];
    propertyNames.forEach(property => {
      const widgetState = state[property];
      if (typeof widgetState === 'string') {
        widgetsArray.push(widgetState);
      } else if (!!widgetState) {
        this.getWidgetsArray(widgetState, widgetsArray);
      }
    });

    return widgetsArray;
  };
}

export default Terminal;
