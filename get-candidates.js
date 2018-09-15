#!/usr/bin/env node

require('dotenv').config();
const assert = require('assert');
const cheerio = require('cheerio');
const yaml = require('js-yaml');
const request = require('./request');
const db = require('./db')(process.env.MONGODB_URL);
const urls = [
        'https://en.wikipedia.org/wiki/United_States_House_of_Representatives_elections,_2018',
        'https://en.wikipedia.org/wiki/United_States_Senate_elections,_2018',
    ];
const makeRaceCode = require('./utils').makeRaceCode;

Promise.all(urls.map(processPage)).then(function (results) {
    process.exit();
});

function processPage(url) {
    return request(url).then(
        html => {
            const $ = cheerio.load(html.replace(/<br\s*\/?>/g, '\n'));
            let races = [];
            $('table.wikitable').each((i, table) => races.push(...processTable($, $(table))));
            return Promise.all(
                races.map(
                    race => {
                        let names = race.candidates.map(c => c.name);
                        return db.find('sponsors', {code: race.code, name: {$in: names}}).then(cursor => cursor.toArray())
                    }
                )
            ).then(
                results => {
                    console.log(results.filter(r=>r.length).length);
                    let operations = races.map(
                        race => ({
                            updateMany: {
                                filter: {code: race.code},
                                update: {$set: race},
                                upsert: true,
                            }
                        })
                    );
                    return db.createIndex('races', {code: 1}, {unique: true})
                        .then(() => db.bulkWrite('races', operations))
                        .then(console.log);
                }
            );
        }
    );
}

function processTable($, $table) {
    let headerRows = 1;
    let text1 = $table.find('tr').eq(0).find('th').eq(0).text().replace(/\s+/g, ' ').trim();
    let text2 = $table.find('tr').eq(1).find('th').eq(0).text().trim();
    if (text1 === 'District' && text2 === 'Location') {
        headerRows = 2;
    }
    else if (text1 === 'State (linked to summaries below)' && text2 === 'Senator') {
        headerRows = 2;
    }
    else {
        return [];
    }
    let heads = [];
    let rowspans = [];
    let tableData = [];
    let expectedDistrict = 0;
    $table.find('tr').each(
        (rowIndex, row) => {
            let $row = $(row);
            let rowData = {};
            let columnIndex = 0;
            let inHeader = (rowIndex < headerRows);
            $row.find('th,td').each(
                (cellIndex, cell) => {
                    let $cell = $(cell);
                    let colspan = +$cell.attr('colspan') || 1;
                    let rowspan = +$cell.attr('rowspan') || 1;
                    let text = $(cell).text().trim();
                    while (rowspans[columnIndex]) {
                        rowspans[columnIndex]--;
                        columnIndex++;
                    }
                    while (colspan--) {
                        rowspans[columnIndex] = rowspan - 1;
                        if (inHeader) {
                            heads[columnIndex] = text.replace(/\s+/g, ' ').replace(/\s*\[[^\]]+\]/g, '');
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
                if (rowData.Location) {
                    expectedDistrict++;
                    let code = makeRaceCode(rowData.Location);
                    if (code.substr(-2) !== 'AL') {
                        assert.strictEqual(expectedDistrict, +code.substr(-2), `Expected ${expectedDistrict} for ${code}`);
                    }
                    tableData.push({
                        code,
                        pvi: rowData['2017 PVI'],
                        party: rowData.Party,
                        candidates: rowData.Candidates.split('\n').map(
                            text => {
                                let m = text.match(/^(.+?) \(([^)]+)\)/);
                                return {
                                    name: m[1],
                                    party: m[2],
                                }
                            }),
                    });
                }
                else if (rowData['State (linked to summaries below)']) {
                    let code = makeRaceCode(rowData['State (linked to summaries below)']);
                    tableData.push({
                        code,
                        party: rowData.Party,
                        candidates: rowData.Candidates.split('\n').map(
                            text => {
                                let m = text.match(/^(.+?) \(([^)]+)\)/);
                                return {
                                    name: m[1],
                                    party: m[2],
                                }
                            }),
                    });
                }
            }
        }
    );
    return tableData;
}
