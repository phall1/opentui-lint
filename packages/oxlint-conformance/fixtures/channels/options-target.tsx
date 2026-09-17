/** @jsxImportSource @opentui/react */
// <sparkline> is not in the default catalogue and nothing in this file
// registers it — normally that is exactly what no-unknown-elements reports.
// options.test.ts turns it off with the rule's own `allow` option.
const App = () => <sparkline />;
export default App;
