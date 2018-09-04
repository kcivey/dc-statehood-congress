#!/usr/bin/env node

require('dotenv').config();
const yaml = require('js-yaml');
const _ = require('underscore');
const ppc = require('propublica-congress').create(process.env.PROPUBLICA_API_KEY);

getMembers().then(
    members => {
        const promises = ['hr1291', 's1278'].map(
            billId => ppc.getAdditionalBillDetails(billId, 'cosponsors')
        );
        Promise.all(promises).then(
            responses => {
                console.log(yaml.safeDump(responses.map(
                    r => {
                        const results = r.results[0];
                        let sponsors = results.cosponsors.map(
                            c => ({
                                id: c.cosponsor_id,
                                name: c.name,
                                title: c.cosponsor_title,
                                state: c.cosponsor_state,
                                party: c.cosponsor_party,
                                uri: c.cosponsor_uri,
                                date: c.date,
                            })
                        );
                        sponsors.unshift(
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

                        return sponsors.map(
                            sponsor => {
                                const member = _.findWhere(members, {id: sponsor.id});
                                if (!member) {
                                    throw new Error(`id ${sponsor.id} not found`);
                                }
                                sponsor.inOffice = member.in_office;
                                if (member.district) {
                                    sponsor.district = member.district;
                                }
                                return sponsor;
                            }
                        );
                    }
                )))
            }
        );
    }
);

function getMembers() {
    const promises = ['house', 'senate'].map(chamber => ppc.getMemberList(chamber));
    return Promise.all(promises).then(
        responses => {
            let members = [];
            responses.forEach(r => members.push(...r.results[0].members));
            return members;
        }
    );
}