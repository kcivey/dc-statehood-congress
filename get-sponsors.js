#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const yaml = require('js-yaml');
const _ = require('underscore');
const argv = require('yargs')
    .options({
        mongo: {
            type: 'boolean',
            describe: 'use MongoDB',
        },
    })
    .strict(true)
    .argv;
const db = argv.mongo && require('./lib/db')(process.env.MONGODB_URL); // eslint-disable-line global-require
const currentCongress = 116;
const ppc = require('propublica-congress').create(process.env.PROPUBLICA_API_KEY, currentCongress);
const makeRaceCode = require('./lib/utils').makeRaceCode;

getMembers()
    .then(function (members) {
        return ppc.getAdditionalBillDetails('s631', 'cosponsors')
            .then(senateResponse => [members, senateResponse]);
    })
    .then(function (responses) {
        return ppc.getAdditionalBillDetails('hr51', 'cosponsors')
            .then(houseResponse => responses.concat([houseResponse]));
    })
    .then(
        function (responses) {
            const members = responses.shift();
            let sponsors = [];
            responses.forEach(
                function (r) {
                    const results = r.results[0];
                    sponsors.push(
                        {
                            id: results.sponsor_id,
                            name: results.sponsor_name,
                            title: results.sponsor_title,
                            state: results.sponsor_state,
                            party: results.sponsor_party,
                            uri: results.sponsor_uri,
                            date: results.introduced_date,
                        }
                    );
                    sponsors = sponsors.concat(
                        results.cosponsors.map(
                            function (c) {
                                return {
                                    id: c.cosponsor_id,
                                    name: c.name,
                                    title: c.cosponsor_title,
                                    state: c.cosponsor_state,
                                    party: c.cosponsor_party,
                                    uri: c.cosponsor_uri,
                                    date: c.date,
                                };
                            }
                        )
                    );
                }
            );
            sponsors.forEach(
                function (sponsor) {
                    const member = _.findWhere(members, {id: sponsor.id});
                    if (!member) {
                        throw new Error(`id ${sponsor.id} not found`);
                    }
                    sponsor.inOffice = member.in_office;
                    sponsor.code = makeRaceCode(member.state, member.district);
                }
            );
            let promise = Promise.resolve();
            if (db) {
                const operations = sponsors.map(
                    function (sponsor) {
                        return {
                            updateMany: {
                                filter: {id: sponsor.id},
                                update: {$set: sponsor},
                                upsert: true,
                            },
                        };
                    }
                );
                promise = promise.then(function () {
                    db.createIndex('sponsors', {id: 1}, {unique: true})
                        .then(() => db.bulkWrite('sponsors', operations))
                        .then(() => db.close());
                });
            }
            return promise.then(function () {
                const codes = sponsors.map(s => s.code).sort();
                const data = {};
                codes.forEach(function (code) {
                    data[code] = null;
                });
                sponsors.forEach(function (sponsor) {
                    const s = Object.assign({}, sponsor); // clone
                    data[s.code] = s;
                    delete s.code;
                });
                return writeData(data);
            });
        }
    )
    .catch(err => console.error(err));

function getMembers() {
    const promises = ['house', 'senate'].map(chamber => ppc.getMemberList(chamber));
    return Promise.all(promises).then(
        function (responses) {
            const members = [];
            responses.forEach(r => members.push(...r.results[0].members));
            return members;
        }
    );
}

function writeData(data) {
    const dataFile = __dirname + '/sponsors.yaml';
    return new Promise(function (resolve, reject) {
        fs.writeFile(dataFile, yaml.safeDump(data) + '\n', function (err) {
            if (err) {
                reject(err);
            }
            else {
                resolve(data);
            }
        });
    });
}
