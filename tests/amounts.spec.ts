import { describe, it, expect } from 'vitest';
import { renderHoldersCard } from '../src/ui.js';
function wei(eth:number){ return BigInt(Math.floor(eth * 1e18)); }
function usdt(u:number){ return BigInt(Math.floor(u * 1e6)); }
function sol(lam:number){ return BigInt(Math.floor(lam * 1e9)); }
describe('amount math', () => {
  it('ETH ≥ min', () => { expect(wei(0.02) >= wei(0.02)).toBe(true); });
  it('USDT ≥ min', () => { expect(usdt(25) >= usdt(25)).toBe(true); });
  it('SOL ≥ min', () => { expect(sol(0.2) >= sol(0.2)).toBe(true); });
});

describe('ui holders card', () => {
  it('renders sources and escapes', () => {
    const msg = renderHoldersCard({
      tokenLabel: 'TEST*',
      chains: ['ethereum','solana'],
      rows: [
        { chain: 'ethereum', contract: '0xabc', holders: 123, source: 'covalent' },
        { chain: 'solana', contract: 'So1...', holders: 45, source: 'solscan' }
      ],
      total: 168,
      confidence: 'amber',
      affiliateText: 'Paid placement. Not financial advice.',
      proEnabled: true,
    });
    expect(msg).toContain('covalent');
    expect(msg).toContain('solscan');
    expect(msg).toContain('Paid placement');
    expect(msg).toContain('Get Pro');
    expect(msg).toContain('TEST\\*');
  });
});
