const psl_url = "https://publicsuffix.org/list/public_suffix_list.dat";

class DomainNode {
    constructor(value) {
        this.value = value;
        this.children = {};
        this.isEndOfDomain = false;
    }
}

class PSLTrie {
    constructor() {
        this.root = new DomainNode(null)
    }

    insert(domain) {
        let current = this.root;
        let domain_parts = domain.split(".").reverse()

        for (let domain_part of domain_parts) {
            if(current.children[domain_part] === undefined) {
                current.children[domain_part] = new DomainNode(domain_part)
            }
            current = current.children[domain_part];
        }

        current.isEndOfDomain = true;
    }

    getRegisteredDomain(domainName) {
        const domainParts = domainName.split(".").reverse();
        let current = this.root;
        let matchDepth = 0;
        for (let i = 0; i < domainParts.length; i++) {
            const domainPart = domainParts[i];

            if (current.children[domainPart]) {
                current = current.children[domainPart];
                matchDepth = i + 1;
            } else if (current.children["*"]) {
                matchDepth = i + 1;
                break;
            } else {
                break;
            }
        }
        if (matchDepth === 0 || matchDepth >= domainParts.length) return null;

        return domainParts.slice(0, matchDepth + 1).reverse().join(".");
    }

    search(domain) {
        let current = this.root;
        let reversed_domain_parts = domain.split(".").reverse();
        for (let domain_part of reversed_domain_parts) {
            if (current.children[domain_part] === undefined) {
                return false;
            }
            current = current.children[domain_part]
        }
        return current.isEndOfDomain; 
    }
    
    async loadPSL() {
        const url = browser.runtime.getURL("data/public_suffix_list.dat");
        const resp = await fetch(url);
        let raw_psl = await resp.text();
        
        for (let entry of raw_psl.split("\n")) {
            if (!entry || entry.startsWith("//") || entry.startsWith("*")) {
                continue;
            }
            this.insert(entry.toLowerCase())
        }
    }
}

if (typeof module !== "undefined") {
    module.exports = { PSLTrie };
}