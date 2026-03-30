export function sendMessage(message) {
    if (typeof browser !== "undefined") {
      // Firefox supports `browser`
      return browser.runtime.sendMessage(message);
    } else if (typeof chrome !== "undefined") {
      // Chrome uses `chrome`
      return chrome.runtime.sendMessage(message);
    } else {
      console.warn("Unsupported browser for messaging.");
    }
  }
  