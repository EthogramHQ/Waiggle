// Tests de la clé de quota tirée de l'adresse IP d'un visiteur (audit de sécurité du 7/11/2026,
// N3) : une adresse IPv4 compte seule, une adresse IPv6 compte avec tout son réseau « /64 ».
import { describe, expect, it } from 'vitest'
import { ipCounterId } from './ip'

describe('ipCounterId', () => {
  it('keeps an IPv4 address as it is', () => {
    expect(ipCounterId('198.51.100.7')).toBe('198.51.100.7')
  })

  it('counts every address of one IPv6 /64 network together', () => {
    const one = ipCounterId('2001:db8:1:2::1')
    expect(ipCounterId('2001:db8:1:2:ffff:ffff:ffff:ffff')).toBe(one)
    expect(ipCounterId('2001:0DB8:0001:0002:0000:0000:0000:0009')).toBe(one)
    // Le réseau voisin compte à part.
    expect(ipCounterId('2001:db8:1:3::1')).not.toBe(one)
  })

  it('reads the short forms of IPv6, whatever the place of « :: »', () => {
    expect(ipCounterId('2001:db8::1')).toBe(ipCounterId('2001:db8:0:0:1::'))
    expect(ipCounterId('::1')).toBe(ipCounterId('0:0:0:0:ffff::'))
  })

  it('counts an IPv4 address written as IPv6 like the IPv4 address itself', () => {
    expect(ipCounterId('::ffff:198.51.100.7')).toBe('198.51.100.7')
  })

  it('keeps one counter for a request that came without an address', () => {
    expect(ipCounterId(undefined)).toBe('unknown')
    expect(ipCounterId('')).toBe('unknown')
  })
})
