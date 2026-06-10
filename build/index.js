"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uWebSocketsInstanceAdapter = exports.UwsInstanceAdapter = void 0;
const buffer_1 = require("buffer");
const nengi_1 = require("nengi");
const nengi_buffers_1 = require("nengi-buffers");
function loadUws() {
    try {
        // Lazy require lets unsupported Node/native ABI failures point at the
        // adapter instead of surfacing as an opaque module-load crash.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('uWebSockets.js');
    }
    catch (err) {
        const detail = (err === null || err === void 0 ? void 0 : err.message) ? ` ${err.message}` : '';
        throw new Error(`nengi-uws-instance-adapter could not load uWebSockets.js on Node ${process.version} ` +
            `(modules ABI ${process.versions.modules}). uWebSockets.js ships native binaries for selected ` +
            `Node/V8 ABI versions; prefer current even/LTS Node majors supported by the uWebSockets.js release.${detail}`);
    }
}
function closePayload(reason) {
    return typeof reason === 'string' ? reason : JSON.stringify(reason !== null && reason !== void 0 ? reason : 'closed');
}
function listenFailure(port) {
    return new Error(`uWebSockets.js failed to listen on port ${port}. ` +
        `The port may be in use or the process may not have permission to bind it.`);
}
class UwsInstanceAdapter {
    constructor(network, config = {}) {
        var _a;
        this.app = null;
        this.token = null;
        this.network = network;
        this.binary = (_a = config.binary) !== null && _a !== void 0 ? _a : nengi_buffers_1.bufferBinary;
        this.config = config;
    }
    listen(options, ready) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const listenOptions = typeof options === 'number' ? { port: options } : options;
        const appOptions = (_b = (_a = listenOptions.appOptions) !== null && _a !== void 0 ? _a : this.config.appOptions) !== null && _b !== void 0 ? _b : {};
        const path = (_d = (_c = listenOptions.path) !== null && _c !== void 0 ? _c : this.config.path) !== null && _d !== void 0 ? _d : '/*';
        const ssl = (_f = (_e = listenOptions.ssl) !== null && _e !== void 0 ? _e : this.config.ssl) !== null && _f !== void 0 ? _f : false;
        const behavior = (_h = (_g = listenOptions.behavior) !== null && _g !== void 0 ? _g : this.config.behavior) !== null && _h !== void 0 ? _h : {};
        const uWS = loadUws();
        this.app = ssl ? uWS.SSLApp(appOptions) : uWS.App(appOptions);
        this.app.ws(path, {
            compression: 0,
            maxPayloadLength: 16 * 1024 * 1024,
            idleTimeout: 120,
            ...behavior,
            open: socket => {
                var _a;
                (_a = behavior.open) === null || _a === void 0 ? void 0 : _a.call(behavior, socket);
                const user = new nengi_1.User(socket, this);
                socket.getUserData().user = user;
                try {
                    user.remoteAddress = buffer_1.Buffer.from(socket.getRemoteAddressAsText()).toString('utf8');
                }
                catch (err) {
                    user.remoteAddress = '';
                }
                this.network.onOpen(user);
            },
            message: (socket, message, isBinary) => {
                var _a;
                (_a = behavior.message) === null || _a === void 0 ? void 0 : _a.call(behavior, socket, message, isBinary);
                const user = socket.getUserData().user;
                if (!isBinary || !user) {
                    return;
                }
                this.network.onMessage(user, buffer_1.Buffer.from(message));
            },
            close: (socket, code, message) => {
                var _a;
                (_a = behavior.close) === null || _a === void 0 ? void 0 : _a.call(behavior, socket, code, message);
                const user = socket.getUserData().user;
                if (!user) {
                    return;
                }
                this.network.onClose(user);
                socket.getUserData().user = undefined;
            }
        });
        const onListen = (token) => {
            if (!token) {
                throw listenFailure(listenOptions.port);
            }
            this.token = token;
            ready === null || ready === void 0 ? void 0 : ready();
        };
        if (listenOptions.host) {
            this.app.listen(listenOptions.host, listenOptions.port, onListen);
        }
        else {
            this.app.listen(listenOptions.port, onListen);
        }
    }
    disconnect(user, reason) {
        user.socket.end(1000, closePayload(reason));
    }
    send(user, buffer) {
        user.socket.send(buffer, true);
    }
}
exports.UwsInstanceAdapter = UwsInstanceAdapter;
const uWebSocketsInstanceAdapter = UwsInstanceAdapter;
exports.uWebSocketsInstanceAdapter = uWebSocketsInstanceAdapter;
