// Debug logging, off by default. It includes everything visitors type and
// run, so only enable it (DEMONIC_DEBUG=1) while debugging.
const enabled = /^(1|true|yes)$/i.test(process.env.DEMONIC_DEBUG || '');

module.exports = enabled ? (...args) => console.log('DEBUG:', ...args) : () => {};
