/** @jsxImportSource @opentui/solid */
// on:click is real Solid event syntax and must stay silent; className is a
// plain web prop and must still be flagged. Both live in one file so the
// negative and positive cases can't drift apart.
const App = () => <box on:click={() => {}} className="flex-1" />
export default App
