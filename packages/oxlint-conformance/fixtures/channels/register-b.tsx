/** @jsxImportSource @opentui/react */
// Same rule, same run, but this file never calls registerQRCode() itself —
// state.test.ts checks that require-registration's per-file bookkeeping
// (the `called` set in rules/require-registration.ts) does not leak from
// register-a.tsx, which is linted in the same oxlint process.
const App = () => <qr-code value="b" />;
export default App;
