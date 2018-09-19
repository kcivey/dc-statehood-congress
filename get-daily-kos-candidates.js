#!/usr/bin/env node

const fs = require('fs');
const assert = require('assert');
const readline = require('readline');
const {google} = require('googleapis');
const _ = require('underscore');
const raceProperties = [
        'district',
        'code',
        'clinton2016',
        'trump2016',
        'obama2012',
        'romney2012',
        'incumbentParty',
        'raceRating',
    ];
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

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
const TOKEN_PATH = 'token.json';

// Load client secrets from a local file.
fs.readFile('credentials.json', (err, content) => {
    if (err) return console.log('Error loading client secret file:', err);
    // Authorize a client with credentials, then call the Google Sheets API.
    authorize(JSON.parse(content), processData);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
    const {client_secret, client_id, redirect_uris} = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) return getNewToken(oAuth2Client, callback);
        oAuth2Client.setCredentials(JSON.parse(token));
        callback(oAuth2Client);
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getNewToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    rl.question('Enter the code from that page here: ', (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
            if (err) return console.error('Error while trying to retrieve access token', err);
            oAuth2Client.setCredentials(token);
            // Store the token to disk for later program executions
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) console.error(err);
                console.log('Token stored to', TOKEN_PATH);
            });
            callback(oAuth2Client);
        });
    });
}

function processData(auth) {
    const sheets = google.sheets({version: 'v4', auth});
    sheets.spreadsheets.values.get({
        spreadsheetId: '1peOepPqFLcThlNGJpJeUC4BkztRDwyP179SU2wwD5-w',
        range: 'House',
    }).then(res => {
        const rows = res.data.values;
        assert(rows.length, 'No data found');
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
    });
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
