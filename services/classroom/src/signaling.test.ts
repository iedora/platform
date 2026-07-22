import { describe, expect, it } from "vitest"

import { type Peer, Rooms } from "./signaling.ts"

interface TestPeer extends Peer {
  inbox: string[]
}
const mkPeer = (uid: string): TestPeer => {
  const inbox: string[] = []
  return { uid, name: uid, leader: false, send: (d) => inbox.push(d), inbox }
}

describe("Rooms", () => {
  it("join returns the peers already present", () => {
    const rooms = new Rooms()
    const a = mkPeer("a")
    const b = mkPeer("b")
    expect(rooms.join("room1", a)).toEqual([])
    expect(rooms.join("room1", b)).toEqual([a])
  })

  it("broadcast reaches other peers but not the sender", () => {
    const rooms = new Rooms()
    const a = mkPeer("a")
    const b = mkPeer("b")
    rooms.join("room1", a)
    rooms.join("room1", b)
    rooms.broadcast("room1", a, "hello")
    expect(b.inbox).toEqual(["hello"])
    expect(a.inbox).toEqual([])
  })

  it("keeps rooms isolated", () => {
    const rooms = new Rooms()
    const a = mkPeer("a")
    const b = mkPeer("b")
    rooms.join("room1", a)
    rooms.join("room2", b)
    rooms.broadcast("room1", a, "hi")
    expect(b.inbox).toEqual([])
  })

  it("removes a peer and drops empty rooms", () => {
    const rooms = new Rooms()
    const a = mkPeer("a")
    rooms.join("room1", a)
    expect(rooms.size).toBe(1)
    rooms.remove("room1", a)
    expect(rooms.size).toBe(0)
    expect(rooms.peers("room1")).toEqual([])
  })
})
