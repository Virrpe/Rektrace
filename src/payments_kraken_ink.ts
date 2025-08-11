import { ApiPromise, WsProvider } from '@polkadot/api';

let _api: ApiPromise | null = null;
async function getApi() {
  if (_api) return _api;
  const rpc = process.env.KRAKEN_INK_RPC!;
  if (!rpc) throw new Error('KRAKEN_INK_RPC missing');
  const provider = new WsProvider(rpc);
  _api = await ApiPromise.create({ provider });
  return _api;
}

export async function verifyInkPayment(opts: { hash: string; to: string; minAmount: number; assetId?: number }): Promise<boolean> {
  const api = await getApi();
  const { hash, to, minAmount, assetId } = opts;
  // Simplified: check recent events in latest block for transfer to recipient.
  const head = await api.rpc.chain.getHeader();
  const h = head.hash;
  const events = await api.query.system.events.at(h) as any;
  if (!assetId) {
    const evt = (events as any[]).find((e:any)=> e.event.section==='balances' && e.event.method==='Transfer');
    if (!evt) return false;
    const data = (evt as any).event.data as any[];
    const dest = String(data[1]);
    const amount = BigInt(String(data[2]));
    const needed = BigInt(Math.floor(Number(minAmount) * 1_000_000_000)); // assume 9 dp
    return dest === to && amount >= needed;
  }
  const evt = (events as any[]).find((e:any)=> e.event.section==='assets' && e.event.method==='Transferred');
  if (!evt) return false;
  const d = (evt as any).event.data as any[];
  const id = Number(d[0]);
  const dest = String(d[2]);
  const qty = BigInt(String(d[3]));
  const needed = BigInt(Math.floor(Number(minAmount) * 1_000_000)); // assume 6 dp
  return id === assetId && dest === to && qty >= needed;
}
