#!/usr/bin/env node

const cheerio = require('cheerio');
const request = require('./request');
const url = 'https://en.wikipedia.org/wiki/United_States_House_of_Representatives_elections,_2018';
const normalizeState = require('us-states-normalize');

request(url).then(processHtml);

function processHtml(html) {
    const $ = cheerio.load(html.replace(/<br\s*\/?>/g, '\n'));
    $('table.wikitable').each(
        (i, table) => {
            let $table = $(table);
            let text1 = $table.find('tr').eq(0).find('th').eq(0).text().trim();
            let text2 = $table.find('tr').eq(1).find('th').eq(0).text().trim();
            if (text1 === 'District' && text2 === 'Location') {
                let tableData = processTable($, $table);
            }
        }
    );
}

function processTable($, $table) {
    let heads = [];
    let tableData = [];
    let skipRow = false;
    $table.find('tr').each(
        (rowIndex, row) => {
            let $row = $(row);
            let rowData = {};
            let columnIndex = 0;
            let inHeader = (rowIndex < 2);
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
                            heads[columnIndex++] = text.replace(/\s+/g, ' ');
                        }
                        else {
                            rowData[heads[columnIndex++]] = text;
                        }
                    }
                }
            );
            if (!inHeader) {
                let m = rowData.Location.match(/^([\w ]+)\s+(\d\d?|at-large)$/);
                tableData.push({
                    district: normalizeState(m[1]) + '-' + (m[2] === 'at-large' ? 1 : m[2]),
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
                console.log(tableData[tableData.length - 1]);
            }
        }
    );
    return tableData;
}