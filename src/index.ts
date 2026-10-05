import type { AppOptions, TemplatedApp, WebSocket, us_listen_socket } from 'uWebSockets.js'
import { Buffer } from 'buffer'
import type { BinaryAdapter, IServerNetworkAdapter, ServerAdapterHost, ServerConnection } from 'nengi'
import { bufferBinary } from 'nengi-buffers'

type UserData = {
    user?: ServerConnection<WebSocket<UserData>>
}

type UwsModule = typeof import('uWebSockets.js')

type UwsWebSocketBehavior = Parameters<TemplatedApp['ws']>[1]

type UwsListenOptions = number | {
    port: number
    host?: string
    path?: string
    ssl?: boolean
    appOptions?: AppOptions
    behavior?: Partial<UwsWebSocketBehavior>
}

type UwsInstanceAdapterConfig = {
    binary?: BinaryAdapter<Buffer>
    ssl?: boolean
    appOptions?: AppOptions
    path?: string
    behavior?: Partial<UwsWebSocketBehavior>
}

function loadUws(): UwsModule {
    try {
        // Lazy require lets unsupported Node/native ABI failures point at the
        // adapter instead of surfacing as an opaque module-load crash.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('uWebSockets.js') as UwsModule
    } catch (err: any) {
        const detail = err?.message ? ` ${err.message}` : ''
        throw new Error(
            `nengi-uws-instance-adapter could not load uWebSockets.js on Node ${process.version} ` +
            `(modules ABI ${process.versions.modules}). uWebSockets.js ships native binaries for selected ` +
            `Node/V8 ABI versions; prefer current even/LTS Node majors supported by the uWebSockets.js release.${detail}`
        )
    }
}

function closePayload(reason: any): string {
    return typeof reason === 'string' ? reason : JSON.stringify(reason ?? 'closed')
}

function listenFailure(port: number) {
    return new Error(
        `uWebSockets.js failed to listen on port ${port}. ` +
        `The port may be in use or the process may not have permission to bind it.`
    )
}

class UwsInstanceAdapter implements IServerNetworkAdapter<Buffer, Buffer, UwsListenOptions> {
    network: ServerAdapterHost
    binary: BinaryAdapter<Buffer>
    app: TemplatedApp | null = null
    token: us_listen_socket | null = null
    private config: UwsInstanceAdapterConfig
    private shutdownPromise?: Promise<void>

    readonly serverAdapterVersion = 1 as const

    constructor(network: ServerAdapterHost, config: UwsInstanceAdapterConfig = {}) {
        if (network?.serverAdapterVersion !== this.serverAdapterVersion) {
            throw new Error('This adapter requires nengi server adapter contract version 1. Pass instance.adapterHost from a compatible core.')
        }
        this.network = network
        this.binary = config.binary ?? bufferBinary
        this.config = config
    }

    listen(options: UwsListenOptions, ready?: () => void) {
        if (this.shutdownPromise) throw new Error('UwsInstanceAdapter has shut down. Create a new adapter to listen again.')
        if (this.app) throw new Error('UwsInstanceAdapter is already listening.')
        const listenOptions = typeof options === 'number' ? { port: options } : options
        const appOptions = listenOptions.appOptions ?? this.config.appOptions ?? {}
        const path = listenOptions.path ?? this.config.path ?? '/*'
        const ssl = listenOptions.ssl ?? this.config.ssl ?? false
        const behavior = listenOptions.behavior ?? this.config.behavior ?? {}
        const uWS = loadUws()

        this.app = ssl ? uWS.SSLApp(appOptions) : uWS.App(appOptions)
        this.app.ws<UserData>(path, {
            compression: 0,
            maxPayloadLength: this.network.limits.maxPacketBytes,
            idleTimeout: 120,
            ...behavior,

            open: socket => {
                behavior.open?.(socket)
                const user = this.network.createConnection(socket, this)
                socket.getUserData().user = user
                try {
                    user.remoteAddress = Buffer.from(socket.getRemoteAddressAsText()).toString('utf8')
                } catch (err) {
                    user.remoteAddress = ''
                }
                this.network.onOpen(user)
            },

            message: (socket, message, isBinary) => {
                const user = socket.getUserData().user
                if (!user || user.isClosed) return
                if (!isBinary) {
                    this.network.notifyInboundMessageError(user, Buffer.from(message), new Error('Nengi requires binary WebSocket messages.'))
                    this.network.disconnectUser(user, { reason: 'text_frame' }, true)
                    return
                }
                behavior.message?.(socket, message, isBinary)
                this.network.onMessage(user, Buffer.from(message))
            },

            ping: (socket, message) => {
                const user = socket.getUserData().user
                if (user && this.network.onTransportControl(user, message.byteLength)) behavior.ping?.(socket, message)
            },
            pong: (socket, message) => {
                const user = socket.getUserData().user
                if (user && this.network.onTransportControl(user, message.byteLength)) behavior.pong?.(socket, message)
            },
            close: (socket, code, message) => {
                behavior.close?.(socket, code, message)
                const user = socket.getUserData().user
                if (!user) {
                    return
                }
                this.network.onClose(user)
                socket.getUserData().user = undefined
            }
        })

        const onListen = (token: us_listen_socket | false) => {
            if (!token) {
                throw listenFailure(listenOptions.port)
            }
            if (this.shutdownPromise) {
                uWS.us_listen_socket_close(token)
                return
            }
            this.token = token
            ready?.()
        }

        if (listenOptions.host) {
            this.app.listen(listenOptions.host, listenOptions.port, onListen)
        } else {
            this.app.listen(listenOptions.port, onListen)
        }
    }

    shutdown(reason?: any): Promise<void> {
        if (this.shutdownPromise) return this.shutdownPromise
        let finish!: () => void
        let fail!: (error: unknown) => void
        this.shutdownPromise = new Promise<void>((resolve, reject) => {
            finish = resolve
            fail = reject
        })
        const app = this.app
        this.app = null
        this.token = null
        try {
            this.network.shutdownAdapter(this, reason)
            app?.close()
            finish()
        } catch (error) {
            fail(error)
        }
        return this.shutdownPromise
    }

    disconnect(user: ServerConnection<WebSocket<UserData>>, reason: any): void {
        user.socket.end(1000, closePayload(reason))
    }

    terminate(user: ServerConnection<WebSocket<UserData>>, reason: any): void {
        user.socket.close()
    }

    send(user: ServerConnection<WebSocket<UserData>>, buffer: Buffer): void {
        if (user.isClosed) {
            throw new Error('Cannot send a nengi snapshot on a closed uWS WebSocket.')
        }
        // 0 is accepted with backpressure; 2 is dropped. Snapshot construction
        // already committed the delta, so a dropped send must end this session.
        if (user.socket.send(buffer, true) === 2) {
            throw new Error('uWS WebSocket dropped a nengi snapshot due to backpressure.')
        }
    }
}

const uWebSocketsInstanceAdapter = UwsInstanceAdapter

export {
    UwsInstanceAdapter,
    UwsInstanceAdapterConfig,
    UwsListenOptions,
    uWebSocketsInstanceAdapter
}
