const fsStore = require('cache-manager-fs');
const requestPlus = require('request-plus');
const cacheManager = require('cache-manager');
const cacheReady = new Promise(
    (resolve, reject) => {
        const cache = cacheManager.caching({
            store: fsStore,
            options: {
                ttl: 6 * 60 * 60 /* seconds */,
                maxsize: 100e6 /* max size in bytes on disk */,
                fillcallback: () => resolve(cache),
            }
        });
    }
).then(
    cache => requestPlus({cache: {cache}})
);

module.exports = (...args) => cacheReady.then(rp => rp(...args));
