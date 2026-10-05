const { Instance, Context, UserConnectionState, Channel } = require('nengi')
const { UwsInstanceAdapter } = require('../build')

it.each([0, 1])('retains an accepted snapshot for uWS send status %s', status => {
    const instance = new Instance(new Context())
    const adapter = new UwsInstanceAdapter(instance.adapterHost)
    const socket = { send: jest.fn(() => status), end: jest.fn() }
    const user = instance.adapterHost.createConnection(socket, adapter)
    user.instance = instance
    instance.network.onConnectionAccepted(user, {})
    instance.step()
    expect(instance.users.size).toBe(1)
    expect(user.lastSentInstanceTick).toBe(instance.tick)
    expect(socket.end).not.toHaveBeenCalled()
})

it('disconnects on a dropped committed snapshot while another user keeps receiving', () => {
    const instance = new Instance(new Context())
    const adapter = new UwsInstanceAdapter(instance.adapterHost)
    const users = [2, 1].map(status => {
        const socket = { send: jest.fn(() => status), end: jest.fn() }
        const user = instance.adapterHost.createConnection(socket, adapter)
        user.instance = instance
        instance.network.onConnectionAccepted(user, {})
        return user
    })
    const channel = new Channel(instance.localState)
    users.forEach(user => channel.subscribe(user))
    const errors = []
    instance.onSnapshotSendError = event => errors.push(event)
    instance.step()
    expect(users[0].connectionState).toBe(UserConnectionState.Closed)
    expect(users[0].subscriptions.size).toBe(0)
    expect(users[0].socket.end).toHaveBeenCalledTimes(1)
    expect(users[1].lastSentInstanceTick).toBe(instance.tick)
    expect(instance.users.size).toBe(1)
    expect(errors).toHaveLength(1)
    expect(errors[0].user).toBe(users[0])
})

it('does not access an invalidated native socket after close', () => {
    const instance = new Instance(new Context())
    const adapter = new UwsInstanceAdapter(instance.adapterHost)
    const user = instance.adapterHost.createConnection({ send: jest.fn() }, adapter)
    user.connectionState = UserConnectionState.Closed
    expect(() => adapter.send(user, Buffer.alloc(1))).toThrow(/closed/)
    expect(user.socket.send).not.toHaveBeenCalled()
})
