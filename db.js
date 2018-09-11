const MongoClient = require('mongodb').MongoClient;
const dbUrl = 'mongodb://localhost:27017';

module.exports = function (url, dbName) {
    const connectionPromise = new Promise(function (resolve, reject) {
        MongoClient.connect(url, function (err, client) {
            if (err) {
                reject(err);
            }
            else {
                resolve(client.db(dbName));
            }
        });
    });

    return {
        insertMany(collectionName, records) {
            return connectionPromise.then(
                db => new Promise(function (resolve, reject) {
                    db.collection(collectionName).insertMany(records, function (err, result) {
                        if (err) {
                            reject(err);
                        }
                        else {
                            resolve(result);
                        }
                    });
                })
            );
        }
    };
};
