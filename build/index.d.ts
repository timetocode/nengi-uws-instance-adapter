import { Buffer } from 'buffer';
import { IServerNetworkAdapter, User, InstanceNetwork } from 'nengi';
import { BufferReader, BufferWriter } from 'nengi-buffers';
declare class uWebSocketsInstanceAdapter implements IServerNetworkAdapter {
    network: InstanceNetwork;
    constructor(network: InstanceNetwork, config: any);
    listen(port: number, ready: () => void): void;
    createBuffer(lengthInBytes: number): Buffer<ArrayBuffer>;
    createBufferWriter(lengthInBytes: number): BufferWriter;
    createBufferReader(buffer: Buffer): BufferReader;
    disconnect(user: User, reason: any): void;
    send(user: User, buffer: Buffer): void;
}
export { uWebSocketsInstanceAdapter };
