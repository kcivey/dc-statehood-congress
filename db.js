const MongoClient = require('mongodb').MongoClient;

module.exports = function (url) {
    const connectionPromise = new Promise(function (resolve, reject) {
        MongoClient.connect(url, function (err, client) {
            if (err) {
                reject(err);
            }
            else {
                resolve(client.db());
            }
        });
    });

    // Proxy all methods to collection
    return new Proxy({}, {
        get(target, methodName) {
            return function (...args) {
                const collectionName = args.shift();
                return connectionPromise.then(
                    db => new Promise(function (resolve, reject) {
                        args.push((err, result) => err ? reject(err) : resolve(result));
                        return db.collection(collectionName)[methodName](...args);
                    })
                );
            }
        }
    });
};
