export const QMS_CHAIN_ID = '0x4c18'; // 19480
export type Listener = (value: unknown) => void;
export interface WalletProvider {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
  on(event: string, listener: Listener): void;
  removeListener(event: string, listener: Listener): void;
}
export type WalletOption = { id: string; name: string; icon?: string; provider: WalletProvider };
export type WalletState = { account: string | null; chainId: string | null; name: string | null; busy: boolean; error: string | null };
export type ChainParameters = { chainId: string; chainName: string; nativeCurrency: { name: string; symbol: string; decimals: number }; rpcUrls: string[]; blockExplorerUrls: string[] };
const initial: WalletState = { account: null, chainId: null, name: null, busy: false, error: null };
export function isProvider(value: unknown): value is WalletProvider {
  const p = value as Partial<WalletProvider> | null;
  return !!p && typeof p.request === 'function' && typeof p.on === 'function' && typeof p.removeListener === 'function';
}
function accountOf(value: unknown): string | null {
  if (!Array.isArray(value) || !value.length) return null;
  return typeof value[0] === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value[0]) && !/^0x0{40}$/.test(value[0]) ? value[0] : null;
}
function chainOf(value: unknown): string | null {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{1,64}$/.test(value) ? `0x${BigInt(value).toString(16)}` : null;
}
function errorCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return;
  return typeof error.code === 'number' ? error.code : undefined;
}
function errorMessage(error: unknown): string {
  switch (errorCode(error)) {
    case 4001: return 'Request declined in your wallet. You can try again.';
    case -32002: return 'A request is already pending. Open your wallet to finish it.';
    case 4200: return 'This wallet does not support that request. Switch networks in your wallet.';
    case 4900: return 'Your wallet is offline. Reopen it and try again.';
    default: return 'Could not complete the wallet request. Check your wallet and try again.';
  }
}

// No signing, sending, account persistence or permission prompts on page load.
export class WalletController {
  private state: WalletState = initial;
  private listeners = new Set<() => void>();
  private provider: WalletProvider | null = null;
  private epoch = 0;
  private accountRevision = 0;
  private chainRevision = 0;
  private detach = () => {};
  getSnapshot = () => this.state;
  getServerSnapshot = () => initial;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<WalletState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  disconnect = () => {
    this.epoch++;
    this.detach(); this.detach = () => {};
    this.provider = null;
    this.update(initial);
  };
  private attach(provider: WalletProvider, epoch: number) {
    const accounts: Listener = value => {
      if (epoch !== this.epoch) return;
      this.accountRevision++;
      const account = accountOf(value);
      if (!account) { this.disconnect(); return; }
      this.update({ account });
    };
    const chain: Listener = value => {
      if (epoch !== this.epoch) return;
      this.chainRevision++;
      this.update({ chainId: chainOf(value) });
    };
    const disconnected: Listener = () => { if (epoch === this.epoch) this.disconnect(); };
    // Register cleanup before attaching so partial registration can be unwound.
    this.detach = () => {
      for (const [event, listener] of [['accountsChanged', accounts], ['chainChanged', chain], ['disconnect', disconnected]] as const) {
        try { provider.removeListener(event, listener); } catch { /* A broken provider must not prevent local disconnect. */ }
      }
    };
    provider.on('accountsChanged', accounts);
    provider.on('chainChanged', chain);
    provider.on('disconnect', disconnected);
  }
  private async sync(provider: WalletProvider, epoch: number) {
    const accountRevision = this.accountRevision, chainRevision = this.chainRevision;
    const [accounts, chain] = await Promise.all([provider.request({ method: 'eth_accounts' }), provider.request({ method: 'eth_chainId' })]);
    if (epoch !== this.epoch) return;
    const account = accountRevision === this.accountRevision ? accountOf(accounts) : this.state.account;
    const chainId = chainRevision === this.chainRevision ? chainOf(chain) : this.state.chainId;
    if (!account || !chainId) throw new Error('Invalid wallet state');
    this.update({ account, chainId });
  }
  connect = async (wallet: WalletOption) => {
    if (this.state.busy) return;
    this.disconnect();
    const epoch = this.epoch;
    this.provider = wallet.provider;
    this.update({ busy: true, name: wallet.name });
    try {
      this.attach(wallet.provider, epoch);
      await wallet.provider.request({ method: 'eth_requestAccounts' });
      if (epoch !== this.epoch) return;
      await this.sync(wallet.provider, epoch);
    } catch (error) {
      if (epoch !== this.epoch) return;
      this.disconnect();
      this.update({ error: errorMessage(error) });
    } finally { if (epoch === this.epoch) this.update({ busy: false }); }
  };
  switchNetwork = async (chain: ChainParameters) => {
    const provider = this.provider, epoch = this.epoch;
    if (!provider || this.state.busy || !this.state.account) return;
    this.update({ busy: true, error: null });
    try {
      if (chain.chainId !== QMS_CHAIN_ID) throw new Error('Unsupported network');
      try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: QMS_CHAIN_ID }] }); }
      catch (error) {
        if (epoch !== this.epoch) return;
        if (errorCode(error) !== 4902) throw error;
        await provider.request({ method: 'wallet_addEthereumChain', params: [chain] });
        if (epoch !== this.epoch) return;
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: QMS_CHAIN_ID }] });
      }
      if (epoch !== this.epoch) return;
      await this.sync(provider, epoch);
      if (epoch === this.epoch && this.state.chainId !== QMS_CHAIN_ID) this.update({ error: 'Select QMS Testnet in your wallet to continue.' });
    } catch (error) { if (epoch === this.epoch) this.update({ error: errorMessage(error) }); }
    finally { if (epoch === this.epoch) this.update({ busy: false }); }
  };
}
