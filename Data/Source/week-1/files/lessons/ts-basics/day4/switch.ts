const browserName: string = 'webkit';
let realBrowser: string;

switch (browserName) {
  case 'chromium':
    realBrowser = 'Chrome / Edge';
    break;                          // stop here — otherwise the next case runs too!
  case 'firefox':
    realBrowser = 'Firefox';
    break;
  case 'webkit':
    realBrowser = 'Safari';
    break;
  default:                          // none of the cases matched
    realBrowser = 'Unknown';
}

console.log(`${browserName} is like ${realBrowser}`);
