const normalizeState = require('us-states-normalize');

module.exports = {
    makeRaceCode(state, district) {
        if (!district) {
            let m = state.match(/^([\w ]+)(?:\s+(\d\d?|at-large|\(Class \d\)))?$/);
            if (m) {
                state = m[1];
                district = /Class/.test(m[2]) ? '' : m[2];
            }
        }
        return normalizeState(state) + '-' + (district ? (district === 'at-large' ? 'AL' : district.padStart(2, '0')) : 'Sen');
    }
};
