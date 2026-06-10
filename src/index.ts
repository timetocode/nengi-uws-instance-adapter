import type { AppOptions, TemplatedApp, WebSocket, us_listen_socket } from 'uWebSockets.js'
import { Buffer } from 'buffer'
import {
    IServerNetworkAdapter,
    InstanceNetwork,
    User
} from 'nengi'
import type { BinaryAdapter } from 'nengi'
import { bufferBinary } from 'nengi-buffers'

type UserData = {
    user?: User
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
    network: InstanceNetwork
    binary: BinaryAdapter<Buffer>
    app: TemplatedApp | null = null
    token: us_listen_socket | null = null
    private config: UwsInstanceAdapterConfig

    constructor(network: InstanceNetwork, config: UwsInstanceAdapterConfig = {}) {
        this.network = network
        this.binary = config.binary ?? bufferBinary
        this.config = config
    }

    listen(options: UwsListenOptions, ready?: () => void) {
        const listenOptions = typeof options === 'number' ? { port: options } : options
        const appOptions = listenOptions.appOptions ?? this.config.appOptions ?? {}
        const path = listenOptions.path ?? this.config.path ?? '/*'
        const ssl = listenOptions.ssl ?? this.config.ssl ?? false
        const behavior = listenOptions.behavior ?? this.config.behavior ?? {}
        const uWS = loadUws()

        this.app = ssl ? uWS.SSLApp(appOptions) : uWS.App(appOptions)
        this.app.ws<UserData>(path, {
            compression: 0,
            maxPayloadLength: 16 * 1024 * 1024,
            idleTimeout: 120,
            ...behavior,

            open: socket => {
                behavior.open?.(socket)
                const user = new User(socket, this)
                socket.getUserData().user = user
                try {
                    user.remoteAddress = Buffer.from(socket.getRemoteAddressAsText()).toString('utf8')
                } catch (err) {
                    user.remoteAddress = ''
                }
                this.network.onOpen(user)
            },

            message: (socket, message, isBinary) => {
                behavior.message?.(socket, message, isBinary)
                const user = socket.getUserData().user
                if (!isBinary || !user) {
                    return
                }
                this.network.onMessage(user, Buffer.from(message))
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
            this.token = token
            ready?.()
        }

        if (listenOptions.host) {
            this.app.listen(listenOptions.host, listenOptions.port, onListen)
        } else {
            this.app.listen(listenOptions.port, onListen)
        }
    }

    disconnect(user: User, reason: any): void {
        user.socket.end(1000, closePayload(reason))
    }

    send(user: User, buffer: Buffer): void {
        user.socket.send(buffer, true)
    }
}

const uWebSocketsInstanceAdapter = UwsInstanceAdapter

export {
    UwsInstanceAdapter,
    UwsInstanceAdapterConfig,
    UwsListenOptions,
    uWebSocketsInstanceAdapter
}
