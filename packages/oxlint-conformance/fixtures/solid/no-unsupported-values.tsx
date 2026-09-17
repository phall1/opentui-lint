/** @jsxImportSource @opentui/solid */
// Solid has no ErrorBoundary, so this is the case whose message differs most
// from React's — "There is no error boundary" instead of naming one.
const App = () => <box width={-1} />;
export default App;
