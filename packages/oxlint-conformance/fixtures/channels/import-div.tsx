// No pragma and no settings block anywhere: the `@opentui/react` import below
// is the only thing that can attribute this file to a framework. It is what
// the root README's Oxlint section promises is enough, so readme-example.test
// lints this file with the README's config exactly as published.
import { render } from "@opentui/react";

const App = () => <div>hi</div>;

render(<App />);
