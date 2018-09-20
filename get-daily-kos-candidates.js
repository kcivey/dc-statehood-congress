#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const assert = require('assert');
const readline = require('readline');
const {google} = require('googleapis');
const _ = require('underscore');
const apiKey = process.env.GOOGLE_API_KEY;
const racePropertiesBySheet = {
        House: [
            'district',
            'code',
            'clinton2016',
            'trump2016',
            'obama2012',
            'romney2012',
            'incumbentParty',
            'raceRating',
        ],
        Senate: [
            'state',
            'class',
            'incumbentParty',
            'raceRating',
        ],
    };
const candidateProperties = [
        'party',
        'status',
        'firstName',
        'lastName',
        'phoneticPronunciation',
        'ipaPronunciation',
        'birthYear',
        'gender',
        'raceEthnicity',
        'religion',
        'Lgbtq',
    ];

processData().then(results => { console.log('Done') });

function processData() {
    const sheets = google.sheets({version: 'v4', auth: apiKey});
    return Promise.all(Object.keys(racePropertiesBySheet).map(sheetName => {
        const raceProperties = racePropertiesBySheet[sheetName];
        sheets.spreadsheets.values.get({
            spreadsheetId: '1peOepPqFLcThlNGJpJeUC4BkztRDwyP179SU2wwD5-w',
            range: sheetName,
        }).then(res => {
            const rows = res.data.values;
            const sheetData = [];
            rows.forEach((row, rowIndex) => {
                if (rowIndex < 2) {
                    return;
                }
                const rowData = _.object(
                    raceProperties,
                    row.slice(0, raceProperties.length)
                );
                rowData.candidates = [];
                let colIndex = raceProperties.length;
                while (colIndex < row.length) {
                    const candidate = _.object(
                        candidateProperties,
                        row.slice(colIndex, colIndex + candidateProperties.length)
                    );
                    if (candidate.status !== 'None') {
                        rowData.candidates.push(removeEmptyProperties(candidate));
                    }
                    colIndex += candidateProperties.length;
                }
                removeEmptyProperties(rowData);
                console.log(rowData);
                sheetData.push(rowData);
            });
            return sheetData;
        });
    }));
}

function removeEmptyProperties(obj) {
    Object.keys(obj).forEach(key => {
        const value = obj[key];
        if (value == null || value === '') {
            delete obj[key];
        }
    });
    return obj;
}
