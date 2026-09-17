/** @jsxImportSource @opentui/react */
// A typo close enough for suggestElement() to guess <box>, which
// no-unknown-elements only ever offers as a `suggest`, never applies as a
// `fix` — a near-miss could equally be an unregistered custom renderable.
const App = () => <boxx />;
export default App;
