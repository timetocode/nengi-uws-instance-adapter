import type { AppOptions, TemplatedApp, WebSocket, us_listen_socket } from 'uWebSockets.js';
import { Buffer } from 'buffer';
import type { BinaryAdapter, IServerNetworkAdapter, ServerAdapterHost, ServerConnection } from 'nengi';
type UserData = {
    user?: ServerConnection<WebSocket<UserData>>;
};
type UwsWebSocketBehavior = Parameters<TemplatedApp['ws']>[1];
type UwsListenOptions = number | {
    port: number;
    host?: string;
    path?: string;
    ssl?: boolean;
    appOptions?: AppOptions;
    behavior?: Partial<UwsWebSocketBehavior>;
};
type UwsInstanceAdapterConfig = {
    binary?: BinaryAdapter<Buffer>;
    ssl?: boolean;
    appOptions?: AppOptions;
    path?: string;
    behavior?: Partial<UwsWebSocketBehavior>;
};
declare class UwsInstanceAdapter implements IServerNetworkAdapter<Buffer, Buffer, UwsListenOptions> {
    network: ServerAdapterHost;
    binary: BinaryAdapter<Buffer>;
    app: TemplatedApp | null;
    token: us_listen_socket | null;
    private config;
    private shutdownPromise?;
    readonly serverAdapterVersion: 1;
    constructor(network: ServerAdapterHost, config?: UwsInstanceAdapterConfig);
    listen(options: UwsListenOptions, ready?: () => void): void;
    shutdown(reason?: any): Promise<void>;
    disconnect(user: ServerConnection<WebSocket<UserData>>, reason: any): void;
    terminate(user: ServerConnection<WebSocket<UserData>>, reason: any): void;
    send(user: ServerConnection<WebSocket<UserData>>, buffer: Buffer): void;
}
declare const uWebSocketsInstanceAdapter: typeof UwsInstanceAdapter;
export { UwsInstanceAdapter, UwsInstanceAdapterConfig, UwsListenOptions, uWebSocketsInstanceAdapter };
