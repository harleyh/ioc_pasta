// background.js

// Store found IOCs from all tabs
let detectedIOCs = {};
let trie = null;

// Initialize PSL trie and context menus on install/update
browser.runtime.onInstalled.addListener(async () => {
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

    updateBadge();
});

// Load PSL trie on startup
async function init() {
    try {
        trie = new PSLTrie();
        await trie.loadPSL();
        console.log("PSL trie loaded");
    } catch (error) {
        console.error("Failed to load PSL trie:", error);
    }
}

init();

// Single onMessage listener
browser.runtime.onMessage.addListener((message, sender) => {

    if (message.action === "iocs_found") {
        const tabId = sender.tab.id;

        if (!trie) {
            console.error("Trie not ready, storing unfiltered IOCs");
            detectedIOCs[tabId] = serializeIOCs(message.data);
            updateBadge(tabId);
            browser.runtime.sendMessage({ action: "iocs_updated", tabId }).catch(() => {});
            return Promise.resolve({ success: true });
        }

        return filterIOCs(message.data, trie).then(filtered => {
            detectedIOCs[tabId] = filtered; // already serialized by filterIOCs
            updateBadge(tabId);
            browser.runtime.sendMessage({ action: "iocs_updated", tabId }).catch(() => {
                console.log("No popups open to update");
            });
            return { success: true };
        });
    }

    if (message.action === "get_iocs") {
        return Promise.resolve({
            success: true,
            data: detectedIOCs[message.tabId] || {}
        });
    }

    if (message.action === "scan_page") {
        return forwardMessageToActiveTab(message);
    }

    if (message.action === "copy_ioc") {
        const textarea = document.createElement('textarea');
        textarea.value = message.text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        return Promise.resolve({ success: true });
    }

    if (message.action === "content_script_loaded") {
        console.log("Content script loaded in tab:", sender.tab?.id);
        return Promise.resolve({ success: true });
    }

    return false; // unhandled
});

// Handle context menu clicks
browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "extract-iocs") {
        browser.tabs.sendMessage(tab.id, {
            action: "get_selection"
        }).then(async response => {
            if (response && response.data) {
                const filtered = trie
                    ? await filterIOCs(response.data, trie)
                    : serializeIOCs(response.data);

                const count = countIOCs(filtered);

                if (count > 0) {
                    browser.notifications.create({
                        type: "basic",
                        iconUrl: browser.runtime.getURL("icons/icon_48x48.png"),
                        title: "IOCs Found",
                        message: `Found ${count} indicators in the selected text`
                    });

                    // Merge with existing IOCs for this tab
                    if (!detectedIOCs[tab.id]) {
                        detectedIOCs[tab.id] = filtered;
                    } else {
                        for (const [type, data] of Object.entries(filtered)) {
                            if (!detectedIOCs[tab.id][type]) {
                                detectedIOCs[tab.id][type] = data;
                            } else {
                                const merged = new Set([
                                    ...detectedIOCs[tab.id][type].values,
                                    ...data.values
                                ]);
                                detectedIOCs[tab.id][type].values = [...merged];
                            }
                        }
                    }

                    updateBadge(tab.id);
                } else {
                    browser.notifications.create({
                        type: "basic",
                        iconUrl: browser.runtime.getURL("icons/icon_48x48.png"),
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

// Auto-scan on page load if enabled
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete") {
        browser.storage.local.get("settings").then(data => {
            if (data.settings && data.settings.autoScan === "always") {
                browser.tabs.sendMessage(tabId, { action: "scan_page" }).catch(() => {
                    console.log("Content script not ready yet");
                });
            }
        });
    }
});

// Clean up IOCs when tab is closed
browser.tabs.onRemoved.addListener((tabId) => {
    delete detectedIOCs[tabId];
});

// Count total IOCs across all types
function countIOCs(iocs) {
    let count = 0;
    for (const type in iocs) {
        if (iocs[type].values) count += iocs[type].values.length;
    }
    return count;
}

// Update extension badge for a tab
function updateBadge(tabId) {
    if (tabId) {
        const count = detectedIOCs[tabId] ? countIOCs(detectedIOCs[tabId]) : 0;
        browser.browserAction.setBadgeText({
            text: count > 0 ? count.toString() : "",
            tabId
        });
        if (count > 0) {
            browser.browserAction.setBadgeBackgroundColor({ color: "#0060DF", tabId });
        }
    } else {
        browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
            if (tabs.length > 0) updateBadge(tabs[0].id);
        });
    }
}

// Forward a message to the active tab's content script
async function forwardMessageToActiveTab(message) {
    try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs.length === 0) return { success: false, error: "No active tab" };

        try {
            return await browser.tabs.sendMessage(tabs[0].id, message);
        } catch (error) {
            console.log("Content script not loaded, injecting dynamically");
            await browser.tabs.executeScript(tabs[0].id, { file: "utils/ioc-patterns.js" });
            await browser.tabs.executeScript(tabs[0].id, { file: "content/content-script.js" });
            await new Promise(resolve => setTimeout(resolve, 100));
            return await browser.tabs.sendMessage(tabs[0].id, message);
        }
    } catch (error) {
        console.error("Error forwarding message:", error);
        return { success: false, error: error.message };
    }
}

// Get OpenCTI credentials from storage
async function getOpenCTICredentials() {
    try {
        const data = await browser.storage.local.get("opencti_credentials");
        if (data.opencti_credentials) {
            return { success: true, credentials: data.opencti_credentials };
        }
        return { success: false, error: "No credentials found" };
    } catch (error) {
        console.error("Error getting OpenCTI credentials:", error);
        return { success: false, error: error.message };
    }
}