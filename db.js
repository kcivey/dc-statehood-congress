const MongoClient = require('mongodb').MongoClient;

module.exports = function (url) {
    const connectionPromise = MongoClient.connect(url, {useNewUrlParser: true})
        .then(client => client.db());

    // Proxy all methods to collection
    return new Proxy({}, {
        get(target, methodName) {
            return function (...args) {
                const collectionName = args.shift();
                return connectionPromise.then(
                    db => db.collection(collectionName)[methodName](...args)
                );
            };
        },
    });
};
