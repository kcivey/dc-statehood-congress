#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const assert = require('assert');
const cheerio = require('cheerio');
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
const request = require('./lib/request');
const makeRaceCode = require('./lib/utils').makeRaceCode;
const db = argv.mongo && require('./lib/db')(process.env.MONGODB_URL);
const urls = [
    'https://en.wikipedia.org/wiki/United_States_House_of_Representatives_elections,_2020',
    'https://en.wikipedia.org/wiki/United_States_Senate_elections,_2020',
];

Promise.all(urls.map(processPage))
    .then(function (results) {
        let races = [];
        results.forEach(function (result) {
            races = races.concat(result);
        });
        const data = {};
        races.sort((a, b) => a.code.localeCompare(b.code))
            .forEach(function (race) {
                const r = Object.assign({}, race);
                data[r.code] = r;
                delete r.code;
            });
        return writeData(data);
    })
    .then(() => db && db.close())
    .catch(err => console.error(err));

function processPage(url) {
    return request(url)
        .then(
            function (html) {
                const $ = cheerio.load(html.replace(/<br\s*\/?>/g, '\n'));
                const races = [];
                $('table.wikitable').each((i, table) => races.push(...processTable($, $(table))));
                return Promise
                    .all(
                        races.map(
                            function (race) {
                                const names = race.candidates.map(c => c.name);
                                return db ?
                                    db.find('sponsors', {code: race.code, name: {$in: names}})
                                        .then(cursor => cursor.toArray()) :
                                    null;
                            }
                        )
                    )
                    .then(() => races);
            }
        )
        .then(
            function (races) {
                const operations = races.map(
                    function (race) {
                        return {
                            updateMany: {
                                filter: {code: race.code},
                                update: {$set: race},
                                upsert: true,
                            },
                        };
                    }
                );
                const promise = db ?
                    db.createIndex('races', {code: 1}, {unique: true})
                        .then(() => db.bulkWrite('races', operations)) :
                    Promise.resolve();
                return promise.then(() => races);
            }
        );
}

function processTable($, $table) {
    let headerRows = 1;
    const text1 = $table.find('tr').eq(0).find('th').eq(0).text().replace(/\s+/g, ' ').trim();
    const text2 = $table.find('tr').eq(1).find('th').eq(0).text().trim();
    if (text1 === 'District' && text2 === 'Location') {
        headerRows = 2;
    }
    else if (text1 === 'State (linked to summaries below)' && text2 === 'Senator') {
        headerRows = 2;
    }
    else {
        return [];
    }
    const heads = [];
    const rowspans = [];
    const tableData = [];
    let expectedDistrict = 0;
    $table.find('tr').each(
        function (rowIndex, row) {
            const $row = $(row);
            const rowData = {};
            let columnIndex = 0;
            const inHeader = (rowIndex < headerRows);
            $row.find('th,td').each(
                function (cellIndex, cell) {
                    const $cell = $(cell);
                    let colspan = +$cell.attr('colspan') || 1;
                    const rowspan = +$cell.attr('rowspan') || 1;
                    const text = $(cell).text().trim();
                    while (rowspans[columnIndex]) {
                        rowspans[columnIndex]--;
                        columnIndex++;
                    }
                    while (colspan--) {
                        rowspans[columnIndex] = rowspan - 1;
                        if (inHeader) {
                            heads[columnIndex] = text.replace(/\s+/g, ' ')
                                .replace(/\s*\[[^\]]+\]/g, '');
                        }
                        else {
                            rowData[heads[columnIndex]] = text;
                        }
                        columnIndex++;
                    }
                }
            );
            while (rowspans[columnIndex]) {
                rowspans[columnIndex]--;
                columnIndex++;
            }
            if (!inHeader) {
                let code;
                if (rowData.Location) {
                    expectedDistrict++;
                    code = makeRaceCode(rowData.Location);
                    if (code.substr(-2) !== 'AL') {
                        assert.strictEqual(expectedDistrict, +code.substr(-2),
                            `Expected ${expectedDistrict} for ${code}`);
                    }
                }
                else if (rowData['State (linked to summaries below)']) {
                    code = makeRaceCode(rowData['State (linked to summaries below)']);
                }
                tableData.push(makeRecord(code, rowData));
            }
        }
    );
    return tableData;
}

function makeRecord(code, rowData) {
    const record = {
        code,
        pvi: rowData['2017 PVI'],
        party: rowData.Party,
        candidates: rowData.Candidates.split('\n')
            .map(
                function (text) {
                    const m = text.match(/^(.+?)\s+\(([^)]+)\)/);
                    if (!m) {
                        if (/^(?:TBD|None yet)?$/) {
                            return null;
                        }
                        throw new Error(`Unexpected format "${text}"`);
                    }
                    return {
                        name: m[1],
                        party: m[2],
                    };
                }
            )
            .filter(v => !!v),
    };
    if (record.pvi === undefined) {
        delete record.pvi;
    }
    return record;
}

function writeData(data) {
    const dataFile = __dirname + '/candidates.yaml';
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
