// background.js

// Store found IOCs from all pages
let detectedIOCs = {};

const defaultOptions = {
    usePSL: true,
    useTrancoBlocklist: false,
    trancoTopN: 1000,
    customBlocklist: new Set()
};


// Initialize when the extension is installed or updated
browser.runtime.onInstalled.addListener(() => {
  // Create context menu items for extraction
  browser.contextMenus.create({
    id: "extract-iocs",
    title: "Extract IOCs from selection",
    contexts: ["selection"]
  });
  
  browser.contextMenus.create({
    id: "copy-ioc",
    title: "Copy IOC",
    contexts: ["link"],
    visible: false
  });
  
  browser.contextMenus.create({
    id: "send-to-opencti",
    title: "Send to OpenCTI",
    contexts: ["link"],
    visible: false
  });
  
  // Initialize badge
  updateBadge();
});

// Listen for messages from content scripts
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "iocs_found") {
    // Store IOCs for the current tab
    const tabId = sender.tab.id;
    detectedIOCs[tabId] = message.data;
    
    // Update the badge to show number of IOCs
    updateBadge(tabId);
    
    // Notify any open popups that IOCs have been updated
    browser.runtime.sendMessage({
      action: "iocs_updated",
      tabId: tabId
    }).catch(error => {
      // This will fail if no popups are open, which is fine
      console.log("No popups open to update");
    });
    
    return Promise.resolve({success: true});
  }
  
  if (message.action === "get_iocs") {
    // Return IOCs for requested tab
    const tabId = message.tabId;
    return Promise.resolve({
      success: true,
      data: detectedIOCs[tabId] || {}
    });
  }
  
  if (message.action === "scan_page") {
    // Forward the scan request to the active tab
    return forwardMessageToActiveTab(message);
  }
  
  if (message.action === "copy_ioc") {
    // Handle copy to clipboard
    const text = message.text;
    
    // Create a temporary textarea element to copy text
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    
    return Promise.resolve({success: true});
  }
  
  return false; // Not handled
});

// Handle context menu clicks
browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "extract-iocs") {
    // Extract IOCs from the selected text
    browser.tabs.sendMessage(tab.id, {
      action: "get_selection"
    }).then(response => {
      if (response && response.data) {
        // Show a notification with the number of IOCs found
        const count = countIOCs(response.data);
        
        if (count > 0) {
          browser.notifications.create({
            type: "basic",
            iconUrl: browser.runtime.getURL("icons/icon-48.png"),
            title: "IOCs Found",
            message: `Found ${count} indicators in the selected text`
          });
          
          // Store these IOCs (merge with existing)
          if (!detectedIOCs[tab.id]) {
            detectedIOCs[tab.id] = {};
          }
          
          // Merge with existing IOCs
          for (const [type, data] of Object.entries(response.data)) {
            if (!detectedIOCs[tab.id][type]) {
              detectedIOCs[tab.id][type] = data;
            } else {
              // Merge values arrays, ensuring no duplicates
              const existingValues = new Set(detectedIOCs[tab.id][type].values);
              data.values.forEach(value => existingValues.add(value));
              detectedIOCs[tab.id][type].values = [...existingValues];
            }
          }
          
          // Update badge
          updateBadge(tab.id);
        } else {
          browser.notifications.create({
            type: "basic",
            iconUrl: browser.runtime.getURL("icons/icon-48.png"),
            title: "No IOCs Found",
            message: "No indicators were found in the selected text"
          });
        }
      }
    }).catch(error => {
      console.error("Error extracting IOCs from selection:", error);
    });
  }
});

// When a tab is updated (e.g., navigated to a new page)
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    // Check if auto-scanning is enabled
    browser.storage.local.get("settings").then(data => {
      if (data.settings && data.settings.autoScan === "always") {
        // Tell content script to scan the page
        browser.tabs.sendMessage(tabId, {
          action: "scan_page"
        }).catch(error => {
          // Content script might not be loaded yet, which is fine
          console.log("Content script not ready yet");
        });
      }
    });
  }
});

// When a tab is closed, clean up stored IOCs
browser.tabs.onRemoved.addListener((tabId) => {
  if (detectedIOCs[tabId]) {
    delete detectedIOCs[tabId];
  }
});

// Helper function to count total IOCs
function countIOCs(iocs) {
  let count = 0;
  for (const type in iocs) {
    count += iocs[type].values.length;
  }
  return count;
}

// Helper function to update the extension badge
function updateBadge(tabId) {
  if (tabId) {
    // Update badge for specific tab
    const count = detectedIOCs[tabId] ? countIOCs(detectedIOCs[tabId]) : 0;
    
    if (count > 0) {
      // Display count on badge
      browser.browserAction.setBadgeText({
        text: count.toString(),
        tabId: tabId
      });
      
      browser.browserAction.setBadgeBackgroundColor({
        color: "#0060DF",
        tabId: tabId
      });
    } else {
      // Clear badge
      browser.browserAction.setBadgeText({
        text: "",
        tabId: tabId
      });
    }
  } else {
    // Get active tab and update its badge
    browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
      if (tabs.length > 0) {
        updateBadge(tabs[0].id);
      }
    });
  }
}

// Helper function to forward a message to the active tab
async function forwardMessageToActiveTab(message) {
  try {
    const tabs = await browser.tabs.query({active: true, currentWindow: true});
    if (tabs.length === 0) return {success: false, error: "No active tab"};
    
    // Check if we can send a message to the content script
    try {
        return await browser.tabs.sendMessage(tabs[0].id, message);
      } catch (error) {
        // Content script isn't loaded, inject it dynamically
        console.log("Content script not loaded, injecting dynamically");
        
        // Inject the content script
        await browser.tabs.executeScript(tabs[0].id, {
          file: "content/content-script.js"
        });
        
        // Wait a moment for it to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Try sending the message again
        return await browser.tabs.sendMessage(tabs[0].id, message);
      }
  } catch (error) {
    console.error("Error forwarding message:", error);
    console.error(new Error().stack);
    return {success: false, error: error.message};
  }
}

// Helper for OpenCTI integration
// This assumes you're using one of the credential storage methods discussed earlier
async function getOpenCTICredentials() {
  try {
    // This implementation will depend on which storage method you chose
    
    // Example for simple storage approach:
    const data = await browser.storage.local.get("opencti_credentials");
    if (data.opencti_credentials) {
      return {
        success: true,
        credentials: data.opencti_credentials
      };
    }
    
    return {
      success: false,
      error: "No credentials found"
    };
    
    // If using native messaging for credential storage, you would:
    // return sendNativeMessage("retrieve", { service: "opencti" });
  } catch (error) {
    console.error("Error getting OpenCTI credentials:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

// background.js
let trie = null;
let iocsByTab = {};

async function init() {
    trie = new PSLTrie();
    await trie.loadPSL();
    console.log("PSL trie loaded");
}

init();

browser.runtime.onMessage.addListener((message, sender) => {

    if (message.action === "iocs_found") {
        return filterIOCs(message.data, trie).then(filtered => {
            // Store filtered results keyed by tab
            iocsByTab[sender.tab.id] = filtered;
            // Notify popup that results are ready
            browser.runtime.sendMessage({ action: "iocs_updated" });
        });
    }

    if (message.action === "get_iocs") {
        return Promise.resolve({
            success: true,
            data: iocsByTab[message.tabId] || {}
        });
    }

    if (message.action === "scan_page") {
        // Forward scan request to the active tab's content script
        return browser.tabs.query({ active: true, currentWindow: true })
            .then(tabs => browser.tabs.sendMessage(tabs[0].id, { action: "scan_page" }));
    }
});