#!/usr/bin/env node

require('dotenv').config();
const yaml = require('js-yaml');
const _ = require('underscore');
const ppc = require('propublica-congress').create(process.env.PROPUBLICA_API_KEY);
const makeRaceCode = require('./utils').makeRaceCode;
const db = require('./db')(process.env.MONGODB_URL);

Promise
    .all([
        getMembers(),
        ppc.getAdditionalBillDetails('hr1291', 'cosponsors'),
        ppc.getAdditionalBillDetails('s1278', 'cosponsors'),
    ])
    .then(
        function (responses) {
            const members = responses.shift();
            let sponsors = [];
            responses.forEach(
                r => {
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
                            c => ({
                                id: c.cosponsor_id,
                                name: c.name,
                                title: c.cosponsor_title,
                                state: c.cosponsor_state,
                                party: c.cosponsor_party,
                                uri: c.cosponsor_uri,
                                date: c.date,
                            })
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
            console.log(yaml.safeDump(sponsors));
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
            db.createIndex('sponsors', {id: 1}, {unique: true})
                .then(() => db.bulkWrite('sponsors', operations))
                .then(() => process.exit());
        }
    );

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
