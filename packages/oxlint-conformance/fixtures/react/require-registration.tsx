/** @jsxImportSource @opentui/react */
// <qr-code> is never in the default catalogue — @opentui/qrcode/react adds it
// only once registerQRCode() runs, which this file deliberately never calls.
const App = () => <qr-code value="hi" />;
export default App;
