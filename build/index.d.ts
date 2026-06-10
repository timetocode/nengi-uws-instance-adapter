import type { AppOptions, TemplatedApp, us_listen_socket } from 'uWebSockets.js';
import { Buffer } from 'buffer';
import { IServerNetworkAdapter, InstanceNetwork, User } from 'nengi';
import type { BinaryAdapter } from 'nengi';
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
    network: InstanceNetwork;
    binary: BinaryAdapter<Buffer>;
    app: TemplatedApp | null;
    token: us_listen_socket | null;
    private config;
    constructor(network: InstanceNetwork, config?: UwsInstanceAdapterConfig);
    listen(options: UwsListenOptions, ready?: () => void): void;
    disconnect(user: User, reason: any): void;
    send(user: User, buffer: Buffer): void;
}
declare const uWebSocketsInstanceAdapter: typeof UwsInstanceAdapter;
export { UwsInstanceAdapter, UwsInstanceAdapterConfig, UwsListenOptions, uWebSocketsInstanceAdapter };
