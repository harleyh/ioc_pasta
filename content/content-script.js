//import { extractIOCs } from "../utils/ioc-patterns";
//mport { sendMessage } from "../utils/browser-api";

function scanPage() {
    console.log("Scanning for IOCs...");
    const pageText = document.body.innerText;
    const iocs = extractIOCs(pageText);
    console.log("Found IOCs: ", iocs);

    // Send found IoCs to the background script
    browser.runtime.sendMessage({
        action: "iocs_found",
        data: iocs
    }).catch(error => { 
        console.error("Error sending IOCs to background: ", error);
    });

    return { success: true };
}


// Listen for messages from the background script
browser.runtime.onMessage.addListener((message) => {
    if (message.action === "scan_page") {
        console.log("Received scan_page message...");
        const result = scanPage();
        return Promise.resolve(result);
    }

    if (message.action === "get_selection") {
        const selection = window.getSelection().toString();
        console.log("Got selection text, length:", selection.length);
        const iocs = extractIOCs(selection);
        return Promise.resolve({
            success: true,
            data: iocs
        });
    }
});

// Scan the page when content script loads if auto-scan is enabled
browser.storage.local.get("settings").then(data => {
    if (data.settings && data.settings.autoScan === "always") {
        console.log("Auto-scanning page on load");
        scanPage();
    }
}).catch(error => {
    console.error("Error checking auto-scan setting:", error);
});

// Signal to background script that content script is loaded
browser.runtime.sendMessage({
    action: "content_script_loaded"
}).catch(error => {
    // This might fail if the background script isn't ready yet, which is fine
    console.log("Background script not ready yet");
});
