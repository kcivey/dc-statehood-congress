module.exports = {
    makeRaceCode(state, district) {
        let code = state;
        if (!district) {
            const m = state.match(/^([\w ]+)(?:\s+(\d\d?|at-large|\(Class \d\)))?$/);
            if (m) {
                code = m[1];
                district = /Class/.test(m[2]) ? '' : m[2];
            }
        }
        return code + '-' +
            (district ? (district.match(/at-large/i) ? 'AL' : district.padStart(2, '0')) : 'Sen');
    },
};
