#!/usr/bin/env node

require('dotenv').config();
const yaml = require('js-yaml');
const ppc = require('propublica-congress').create(process.env.PROPUBLICA_API_KEY);
let promises = ['hr1291', 's1278'].map(
    (billId) => ppc.getAdditionalBillDetails(billId, 'cosponsors')
);
Promise.all(promises).then(
    (responses) => {
        console.log(yaml.safeDump(responses.map(
            (r) => {
                let results = r.results[0];
                let sponsors = results.cosponsors.map((c) => (
                    {
                        id:    c.cosponsor_id,
                        name:  c.name,
                        title: c.cosponsor_title,
                        state: c.cosponsor_state,
                        party: c.cosponsor_party,
                        uri:   c.cosponsor_uri,
                        date:  c.date,
                    }
                ));
                sponsors.unshift(
                    {
                        id:    results.sponsor_id,
                        name:  results.sponsor_name,
                        title: results.sponsor_title,
                        state: results.sponsor_state,
                        party: results.sponsor_party,
                        uri:   results.sponsor_uri,
                        date:  results.introduced_date,
                    }
                );
                return sponsors;
            }
        )))
    }
);
