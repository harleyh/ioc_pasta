const defaultOptions = {
    usePSL: true,
    useTrancoBlocklist: false,
    trancoTopN: 1000,
    customBlocklist: new Set()
};

const iocPatterns = {
    // File Hashes
    md5 : {
        regex: /\b[a-fA-F0-9]{32}\b/g,
        name: "md5"
    },
    
    sha1: {
        regex: /\b[a-fA-F0-9]{40}\b/g,
        name: "sha1"
    },

    sha256: {
        regex: /\b[a-fA-F0-9]{64}\b/g,
        name: "sha256"
    },

    // Network Indicators
    ipv4: {
        regex: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
        name: "ipv4"
    },

    ipv6: {
        regex: new RegExp(
            '(?:' +
            '(?:[0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|' +                  // 1:2:3:4:5:6:7:8
            '(?:[0-9a-fA-F]{1,4}:){1,7}:|' +                                 // 1:: or 1:2:3:4:5:6:7::e
            '(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|' +                 // 1::8 or 1:2:3:4:5:6::8
            '(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|' +          // 1::7:8 or 1:2:3:4:5::7:8
            '(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|' +          // 1::6:7:8 or 1:2:3:4::6:7:8
            '(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|' +          // 1::5:6:7:8 or 1:2:3::5:6:7:8
            '(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|' +          // 1::4:5:6:7:8 or 1:2::4:5:6:7:8
            '[0-9a-fA-F]{1,4}:(?:(?::[0-9a-fA-F]{1,4}){1,6})|' +               // 1::3:4:5:6:7:8
            ':(?:(?::[0-9a-fA-F]{1,4}){1,7}|:)|' +                             // ::2:3:4:5:6:7:8 or ::
            'fe80:(?::[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|' +             // fe80::7:8%eth0 (link-local IPv6 addresses with zone index)
            '::(ffff(?::0{1,4}){0,1}:){0,1}' +                               // ::255.255.255.255 or ::ffff:255.255.255.255 or ::ffff:0:255.255.255.255 (IPv4-mapped IPv6 addresses)
            '(?:(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])\\.){3,3}' +
            '(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])|' +
            '(?:[0-9a-fA-F]{1,4}:){1,4}:' +                                  // 2001:db8:3:4::192.168.0.1 (IPv4-embedded IPv6 addresses)
            '(?:(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])\\.){3,3}' +
            '(?:25[0-5]|(?:2[0-4]|1{0,1}[0-9]){0,1}[0-9])' +
          ')', 'g'
        ),
        name: "ipv6"
    },

    domain: {
        //regex: /\b(?!(?:\d{1,3}\[?\.\]?){1,3}\d{1,3}\b)(?:(xn--)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\[?\.\]?)+(?!(?:exe|dll|bat|cmd|bin|ps1|msi|vbs|js|py|php|pl|rb|go|cs|cpp|c|h|swift|kt|ts|jsx|tsx|html|htm|css|scss|sass|less|xml|json|yaml|yml|ini|conf|cfg|config|db|sqlite|sql|mdf|bak|backup|old|log|txt|pdf|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|pages|numbers|key|rtf|csv|tsv|zip|rar|tar|gz|7z|bz2|iso|dmg|img|apk|app|deb|rpm|jar|war|ear|class|o|obj|lib|so|dylib|a|pdb|idb|pyd|pyc|pyo|p5m|jpg|jpeg|png|gif|bmp|tiff|tif|webp|svg|ico|psd|ai|eps|raw|mp3|wav|ogg|flac|aac|wma|m4a|mp4|avi|mov|wmv|flv|mkv|webm|mpg|mpeg|m4v|3gp|dat|tmp)(?:\b|$))(xn--)?[a-z0-9][a-z0-9-]{0,61}[a-z0-9]\b/g,
        regex: /\b((?=[a-z0-9-]{1,63}\[?\.\]?)(xn--)?[a-z0-9]+(-[a-z0-9]+)*\[?\.\]?)+[a-z]{2,63}\b/g,
        name: "domain"
    }
};



// Extract IOCs
function extractIOCs(text) {
    const results = {};

    for (const [type,pattern] of Object.entries(iocPatterns)) {
        let match;
        let values;
        values = new Set();
        pattern.regex.lastIndex = 0;
        while (( match = pattern.regex.exec(text)) !== null) {
            //console.log('Got a match: ', match[0]);
            const charBefore = text[match.index - 1];
            const charAfter = text[match.index + 1];
            if (charAfter === '(') {
                continue;
            }
            if (type === "domain") {
                // refang
                let ioc = refangIOC(match[0]);
                values.add(ioc);
            } else {
                values.add(match[0]);
            }
        }
        results[type] = {
            name: pattern.name,
            values: values
        };
    }
    return results;
}

async function filterIOCs(iocs, trie, options = defaultOptions) {
    iocs = filterDomains(iocs, trie);

    return serializeIOCs(iocs);  // convert Sets to arrays before returning
}

function filterDomains(iocs, trie) {
    console.log("Domain candidates before filter:", [...iocs.domain.values]);
    iocs.domain.values = new Set(
        [...iocs.domain.values].filter(candidate => {
            return trie.getRegisteredDomain(candidate) !== null;
        })
    );

    console.log("Domains after filter:", [...iocs.domain.values]);
    return iocs;
}

function serializeIOCs(iocs) {
    const serialized = {};
    for (const [type, data] of Object.entries(iocs)) {
        serialized[type] = {
            name: data.name,
            values: [...data.values]  // Set → Array
        };
    }
    return serialized;
}

function refangIOC(ioc) {
    return ioc.replace(/\[\.\]/g, '.').toLowerCase();
}

//module.exports = { extractIOCs} ;

