/** @jsxImportSource @opentui/react */
// no-unknown-elements offers a real `fix` here (div -> box has exactly one
// right answer), not a `suggest` — copied to a temp dir before --fix runs so
// this checked-in fixture is never mutated by the test that exercises it.
const App = () => (
  <div>
    <text>hi</text>
  </div>
);
export default App;
