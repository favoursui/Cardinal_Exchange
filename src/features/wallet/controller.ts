export const QMS_CHAIN_ID = '0x4c18'; // 19480
export type WalletTransaction = { from: string; to: string; data: string; value: string; chainId: string; gas?: string; gasPrice?: string; expiresAt: number };
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
  signInMessage = async (message:string):Promise<string> => {
    const provider=this.provider,epoch=this.epoch,account=this.state.account;
    const revision=this.accountRevision,chainRevision=this.chainRevision;
    if(!provider||!account||this.state.busy||this.sending||this.state.chainId!==QMS_CHAIN_ID||!message||message.length>2048)throw new Error('Connect your wallet to QMS Testnet first.');
    this.update({busy:true});
    const check=()=>{if(this.epoch!==epoch||this.accountRevision!==revision||this.chainRevision!==chainRevision||this.state.account!==account||this.state.chainId!==QMS_CHAIN_ID)throw new Error('Wallet changed. Please sign in again.');};
    try {
      const [accounts,chain]=await Promise.all([provider.request({method:'eth_accounts'}),provider.request({method:'eth_chainId'})]);
      check();if(accountOf(accounts)?.toLowerCase()!==account.toLowerCase()||chainOf(chain)!==QMS_CHAIN_ID)throw new Error('Wallet changed. Please sign in again.');
      const bytes=new TextEncoder().encode(message);
      const hex='0x'+Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
      const signature=await provider.request({method:'personal_sign',params:[hex,account]});
      const [currentAccounts,currentChain]=await Promise.all([provider.request({method:'eth_accounts'}),provider.request({method:'eth_chainId'})]);
      check();
      if(accountOf(currentAccounts)?.toLowerCase()!==account.toLowerCase()||chainOf(currentChain)!==QMS_CHAIN_ID)throw new Error('Wallet changed. Please sign in again.');
      if(typeof signature!=='string'||!/^0x[0-9a-fA-F]{130}$/.test(signature))throw new Error('Unsupported wallet signature.');
      return signature;
    }catch(error){if(errorCode(error)!==undefined)throw new Error(errorMessage(error));throw error;}
    finally{if(this.epoch===epoch)this.update({busy:false});}
  };
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
  private sending = false;
  readRpc = async (method: string, params: readonly unknown[] = []): Promise<unknown> => {
    if (!['eth_getBalance','eth_call','eth_getCode','eth_gasPrice','eth_getTransactionReceipt','eth_blockNumber'].includes(method)) throw new Error('Unsupported wallet read.');
    const provider = this.provider, epoch = this.epoch;
    if (!provider || !this.state.account || this.state.chainId !== QMS_CHAIN_ID) throw new Error('Connect on QMS Testnet first.');
    const revision = this.chainRevision;
    const read = async () => {
      if (chainOf(await provider.request({method:'eth_chainId'})) !== QMS_CHAIN_ID) throw new Error('Wrong wallet network.');
      const result = await provider.request({method,params});
      if (epoch !== this.epoch || revision !== this.chainRevision) throw new Error('Wallet changed during request.');
      return result;
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([read(), new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Wallet read timed out.')),20_000);})]); }
    finally { clearTimeout(timer); }
  };
  sendTransaction = async (tx: WalletTransaction): Promise<string> => {
    const provider = this.provider, epoch = this.epoch, account = this.state.account;
    const accountRevision = this.accountRevision, chainRevision = this.chainRevision;
    if (!provider || !account || this.state.chainId !== QMS_CHAIN_ID || this.state.busy || this.sending) throw new Error('Wallet is not ready.');
    const quantity = (value: string) => {
      if (!/^0x[0-9a-fA-F]+$/.test(value) || BigInt(value) >= BigInt(2)**BigInt(256)) throw new Error('Invalid transaction quantity.');
      return BigInt(value);
    };
    if (tx.chainId !== QMS_CHAIN_ID || tx.from.toLowerCase() !== account.toLowerCase() || !/^0x[0-9a-fA-F]{40}$/.test(tx.to) || !/^0x(?:[0-9a-fA-F]{2})*$/.test(tx.data)) throw new Error('Invalid transaction intent.');
    if (!Number.isFinite(tx.expiresAt) || tx.expiresAt > Date.now()+60_000) throw new Error('Invalid review expiry.');
    const value = quantity(tx.value);
    const assertCurrent = () => {
      if (epoch !== this.epoch || accountRevision !== this.accountRevision || chainRevision !== this.chainRevision || Date.now() >= tx.expiresAt) throw new Error('Wallet changed or review expired. Prepare again.');
    };
    const checkWallet = async () => {
      const [accounts, chain] = await Promise.all([provider.request({method:'eth_accounts'}),provider.request({method:'eth_chainId'})]);
      assertCurrent();
      if (accountOf(accounts)?.toLowerCase() !== account.toLowerCase() || chainOf(chain) !== QMS_CHAIN_ID) throw new Error('Wallet account or network changed.');
    };
    const bounded = async <T,>(work: Promise<T>): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Wallet preflight timed out. Prepare again.')),20_000);})]); }
      finally { clearTimeout(timer); }
    };
    this.sending = true; this.update({busy:true,error:null});
    try {
      await bounded(checkWallet());
      const call = {from:account,to:tx.to,data:tx.data,value:tx.value};
      const results = await bounded(Promise.all([provider.request({method:'eth_call',params:[call,'latest']}),provider.request({method:'eth_estimateGas',params:[call]}),provider.request({method:'eth_gasPrice'}),provider.request({method:'eth_getBalance',params:[account,'latest']})]));
      assertCurrent();
      const estimate = quantity(String(results[1])), price = quantity(String(results[2])), balance = quantity(String(results[3]));
      if (!estimate || estimate > BigInt(5_000_000) || !price) throw new Error('Invalid wallet gas estimate.');
      if (tx.data.slice(0,10).toLowerCase()==='0x095ea7b3' && results[0] === '0x'+'0'.repeat(64)) throw new Error('Token rejected approval.');
      const gas = tx.gas ? quantity(tx.gas) : (estimate*BigInt(120)+BigInt(99))/BigInt(100)+BigInt(10_000);
      const gasPrice = tx.gasPrice ? quantity(tx.gasPrice) : price*BigInt(2);
      if (gas < estimate || gas > BigInt(6_500_000) || gasPrice < price || gasPrice >= BigInt(2)**BigInt(256)) throw new Error('Gas estimate changed. Prepare again.');
      if (balance < value + gas*gasPrice) throw new Error('Not enough native QMS for transaction value and gas.');
      await bounded(checkWallet());
      // Only explicit fields; never forward arbitrary API fields to the wallet.
      const hash = await provider.request({method:'eth_sendTransaction',params:[{...call,chainId:QMS_CHAIN_ID,gas:`0x${gas.toString(16)}`,gasPrice:`0x${gasPrice.toString(16)}`} ]});
      if (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('Wallet returned an invalid transaction hash. Check your wallet before retrying.');
      // Preserve the hash even if the user switched accounts while confirming.
      return hash;
    } finally { this.sending = false; if (epoch === this.epoch) this.update({busy:false}); }
  };

  verifyTransaction = async (hash: string): Promise<void> => {
    const provider = this.provider, epoch = this.epoch;
    const account = this.state.account, accountRevision = this.accountRevision, chainRevision = this.chainRevision;
    if (!provider || !account || this.state.busy || this.state.chainId !== QMS_CHAIN_ID) throw new Error('Connect your wallet on QMS Testnet first.');
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('Enter a valid transaction hash.');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const verify = async () => {
      const current = () => {
        if (epoch !== this.epoch || accountRevision !== this.accountRevision || chainRevision !== this.chainRevision || this.state.chainId !== QMS_CHAIN_ID) throw new Error('Wallet or network changed. Try again.');
      };
      if (chainOf(await provider.request({ method: 'eth_chainId' })) !== QMS_CHAIN_ID) throw new Error('Switch to QMS Testnet first.');
      current();
      const tx = await provider.request({ method: 'eth_getTransactionByHash', params: [hash] });
      current();
      if (!tx || typeof tx !== 'object' || !('hash' in tx) || typeof tx.hash !== 'string' || tx.hash.toLowerCase() !== hash.toLowerCase()) throw new Error('Transaction not found by your wallet. Check the hash and network.');
      if (!('from' in tx) || typeof tx.from !== 'string' || tx.from.toLowerCase() !== account.toLowerCase()) throw new Error('This transaction was not sent by the connected account.');
      if (chainOf(await provider.request({ method: 'eth_chainId' })) !== QMS_CHAIN_ID) throw new Error('Switch to QMS Testnet first.');
      current();
    };
    try {
      await Promise.race([verify(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Transaction lookup timed out. Please try again.')), 20_000); })]);
    } finally { clearTimeout(timer); }
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
