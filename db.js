const MongoClient = require('mongodb').MongoClient;
let client;

module.exports = function (url) {
    const connectionPromise = MongoClient.connect(url, {useNewUrlParser: true})
        .then(function(newClient) {
            client = newClient;
            return newClient.db();
        });

    // Proxy all methods to collection
    return new Proxy({}, {
        get(target, methodName) {
            if (methodName === 'close') {
                return function() {
                    connectionPromise.then(() => client.close());
                }
            }
            return function (...args) {
                const collectionName = args.shift();
                return connectionPromise.then(
                    db => db.collection(collectionName)[methodName](...args)
                );
            };
        },
    });
};
