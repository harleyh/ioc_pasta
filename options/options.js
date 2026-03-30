// Saves options to browser.storage
function saveOptions(e) {
    e.preventDefault();
    browser.storage.sync.set({
      backgroundColor: document.querySelector("#backgroundColor").value,
      enableFeature: document.querySelector("#enableFeature").checked
    });
  }
  
  // Restores select box and checkbox state using the preferences
  // stored in browser.storage.
  function restoreOptions() {
    function setCurrentChoice(result) {
      document.querySelector("#backgroundColor").value = result.backgroundColor || "#ffffff";
      document.querySelector("#enableFeature").checked = result.enableFeature || false;
    }
  
    function onError(error) {
      console.log(`Error: ${error}`);
    }
  
    let getting = browser.storage.sync.get(["backgroundColor", "enableFeature"]);
    getting.then(setCurrentChoice, onError);
  }
  
  document.addEventListener("DOMContentLoaded", restoreOptions);
  document.querySelector("form").addEventListener("submit", saveOptions);