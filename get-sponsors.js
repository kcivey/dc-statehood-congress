#!/usr/bin/env node

require('dotenv').config();
const assert = require('assert');
const fs = require('fs');
const yaml = require('js-yaml');
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

main().catch(console.trace);

async function main() {
    const members = await getMembers();
    const senateResponse = await ppc.getAdditionalBillDetails('s631', 'cosponsors');
    const houseResponse = await ppc.getAdditionalBillDetails('hr51', 'cosponsors');
    const sponsors = [];
    for (const r of [senateResponse, houseResponse]) {
        const results = r.results[0];
        sponsors.push( // main sponsor
            {
                code: null, // to set order
                id: results.sponsor_id,
                name: results.sponsor_name,
                title: results.sponsor_title,
                state: results.sponsor_state,
                party: results.sponsor_party,
                uri: results.sponsor_uri,
                date: results.introduced_date,
            },
            ...results.cosponsors.map(function (c) {
                return {
                    code: null, // to set order
                    id: c.cosponsor_id,
                    name: c.name,
                    title: c.cosponsor_title,
                    state: c.cosponsor_state,
                    party: c.cosponsor_party,
                    uri: c.cosponsor_uri,
                    date: c.date,
                };
            }),
        );
        for (const sponsor of sponsors) {
            const member = members.find(m => m.id === sponsor.id);
            assert(member, `id ${sponsor.id} not found`);
            sponsor.inOffice = member.in_office;
            sponsor.code = makeRaceCode(member.state, member.district);
        }
    }
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
        await db.createIndex('sponsors', {id: 1}, {unique: true});
        await db.bulkWrite('sponsors', operations);
        await db.close();
    }
    sponsors.sort(function (a, b) {
        return a.code.localeCompare(b.code) || a.date.localeCompare(b.date) || a.name.localeCompare(b.name);
    });
    return writeData(sponsors);
}

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
