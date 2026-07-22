// In-memory room registry. A room is keyed by spaceId and holds its connected
// peers; the classroom is 1:1, so a room is normally two peers. This is
// transport-agnostic (a Peer is anything with a `send`), which keeps it unit
// testable without a real WebSocket. State is per-process — fine because a
// lesson's two peers land on the same single node; scaling to replicas would
// need a shared relay (Redis pub/sub), noted for later.

export interface Peer {
  readonly uid: string
  readonly name: string
  readonly leader: boolean
  send(data: string): void
}

export class Rooms {
  private readonly rooms = new Map<string, Set<Peer>>()

  /** Add a peer; returns the peers that were already present. */
  join(spaceId: string, peer: Peer): Peer[] {
    let room = this.rooms.get(spaceId)
    if (!room) {
      room = new Set()
      this.rooms.set(spaceId, room)
    }
    const existing = [...room]
    room.add(peer)
    return existing
  }

  remove(spaceId: string, peer: Peer): void {
    const room = this.rooms.get(spaceId)
    if (!room) return
    room.delete(peer)
    if (room.size === 0) this.rooms.delete(spaceId)
  }

  /** Deliver `data` to every peer in the room except the sender. */
  broadcast(spaceId: string, from: Peer, data: string): void {
    const room = this.rooms.get(spaceId)
    if (!room) return
    for (const peer of room) if (peer !== from) peer.send(data)
  }

  peers(spaceId: string): Peer[] {
    return [...(this.rooms.get(spaceId) ?? [])]
  }

  get size(): number {
    return this.rooms.size
  }
}
