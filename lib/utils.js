const usRegions = require('us-regions');

module.exports = {
    makeRaceCode(state, district) {
        if (!district) {
            const m = state.match(/^([\w ]+)(?:\s+(\d\d?|at-large|\(Class \d\)))?$/);
            if (m) {
                state = m[1];
                district = /Class/.test(m[2]) ? 'Sen-S' : m[2];
            }
        }
        const stateCode = usRegions.postalAbbr(state);
        if (!stateCode) {
            throw new Error('Unknown state: ' + state);
        }
        return stateCode + '-' +
            (district ? (district.match(/at-large/i) ? 'AL' : district.padStart(2, '0')) : 'Sen');
    },
};
