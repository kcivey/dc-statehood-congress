#!/usr/bin/env node

const cheerio = require('cheerio');
const yaml = require('js-yaml');
const request = require('./request');
const urls = [
        'https://en.wikipedia.org/wiki/United_States_House_of_Representatives_elections,_2018',
        'https://en.wikipedia.org/wiki/United_States_Senate_elections,_2018',
    ];
const normalizeState = require('us-states-normalize');
let races = {};

Promise.all(urls.map(processPage)).then(() => console.log(yaml.safeDump(races)));

function processPage(url) {
    return request(url).then(
        html => {
            const $ = cheerio.load(html.replace(/<br\s*\/?>/g, '\n'));
            $('table.wikitable').each(
                (i, table) => processTable($, $(table))
            );
        }
    );
}

function processTable($, $table) {
    let headerRows = 1;
    let text1 = $table.find('tr').eq(0).find('th').eq(0).text().trim();
    let text2 = $table.find('tr').eq(1).find('th').eq(0).text().trim();
    //console.log([text1, text2]);
    if (text1 === 'District') {
        if (text2 === 'Location') {
            headerRows = 2;
        }
        else {
            //console.log(processTable($, $table));
            //process.exit();
            return;
        }
    }
    else if (text1 === 'State') {
        //console.log(processTable($, $table));
        //process.exit();
        return;
    }
    else {
        return;
    }
    let heads = [];
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
                    let text = $(cell).text().trim();
                    while (colspan--) {
                        if (inHeader) {
                            heads[columnIndex++] = text.replace(/\s+/g, ' ').replace(/\s*\[[^\]]+\]/g, '');
                        }
                        else {
                            rowData[heads[columnIndex++]] = text;
                        }
                    }
                }
            );
            if (!inHeader) {
                if (rowData.Location) {
                    let m = rowData.Location.match(/^([\w ]+)\s+(\d\d?|at-large)$/);
                    let district = normalizeState(m[1]) + '-' + (m[2] === 'at-large' ? 1 : m[2]);
                    races[district] = {
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
                    };
                    tableData.push(races[district]);
                }
                else {
                    tableData.push(rowData);
                }
            }
        }
    );
    return tableData;
}
