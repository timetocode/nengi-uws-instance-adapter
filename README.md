# nengi-uws-instance-adapter

uWebSockets.js server adapter for nengi.

```ts
import { Instance } from 'nengi'
import { UwsInstanceAdapter } from 'nengi-uws-instance-adapter'

const instance = new Instance(context)
const adapter = new UwsInstanceAdapter(instance.network)

adapter.listen(8079, () => {
    console.log('listening')
})
```

`listen` accepts either a port number or an options object:

```ts
adapter.listen({
    host: '0.0.0.0',
    port: 8079,
    path: '/*'
})
```

For direct TLS, pass `ssl: true` with the `uWebSockets.js` SSL app options:

```ts
adapter.listen({
    port: 8079,
    ssl: true,
    appOptions: {
        key_file_name: 'server.key',
        cert_file_name: 'server.crt'
    }
})
```

## Node support

This package depends on `uWebSockets.js`, which ships native binaries for
selected Node/V8 ABI versions. In practice, that usually means current even/LTS
Node majors are the safest choices. Odd or newly released Node majors can fail
to load until `uWebSockets.js` publishes a matching binary.

If that happens, the adapter throws an error that includes the active Node
version and modules ABI. Use an even/LTS Node version supported by the installed
`uWebSockets.js` release, or update the `uWebSockets.js` GitHub dependency when
a newer release adds support.
