#!/usr/bin/env node

const assert = require('assert');
const cheerio = require('cheerio');
const yaml = require('js-yaml');
const request = require('./request');
const db = require('./db')('mongodb://localhost:27017', 'dc-statehood-congress');
const urls = [
        'https://en.wikipedia.org/wiki/United_States_House_of_Representatives_elections,_2018',
        'https://en.wikipedia.org/wiki/United_States_Senate_elections,_2018',
    ];
const normalizeState = require('us-states-normalize');

Promise.all(urls.map(processPage)).then(function (results) {
    process.exit();
});

function processPage(url) {
    return request(url).then(
        html => {
            const $ = cheerio.load(html.replace(/<br\s*\/?>/g, '\n'));
            let districts = [];
            $('table.wikitable').each((i, table) => districts.push(...processTable($, $(table))));
            return db.insertMany('districts', districts).then(console.log);
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
    $table.find('tr').each(
        (rowIndex, row) => {
            let $row = $(row);
            let rowData = {};
            let columnIndex = 0;
            let inHeader = (rowIndex < headerRows);
            if (/Redistricted from the/.test($row.find('th,td').eq(0).text())) {
                return; // skip row (Pennsylvania weirdness)
            }
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
                    let district = makeRaceCode(rowData.Location);
                    tableData.push({
                        district,
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
                    let district = makeRaceCode(rowData['State (linked to summaries below)']);
                    tableData.push({
                        district,
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

function makeRaceCode(text) {
    const m = text.match(/^([\w ]+)(?:\s+(\d\d?|at-large|\(Class \d\)))?$/);
    if (!m) {
        throw new Error(`Unrecognized race ${text}`);
    }
    return normalizeState(m[1]) + '-' + (m[2] ? (m[2] === 'at-large' ? 'AL' : m[2].padStart(2, '0')) : 'Sen');
}