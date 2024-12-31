type ConfigSection = Map<string, string>

export class ConfigParser {
    private values: Map<string, ConfigSection>;

    constructor() {
        this.values = new Map<string, ConfigSection>();
    }

    parse(data: string) {
        let activeSection: ConfigSection = new Map<string, string>();
        this.values.set("", activeSection);
        const configLines = data.split("\r\n");
        for (let i = 0; i < configLines.length; i++) {
            if (configLines[i][0] === '[') {
                const newSectionName = configLines[i].substring(1, configLines[i].length - 2);
                if (this.values.has(newSectionName)) {
                    throw new Error(`Duplicate config section name ${newSectionName}`);
                }
                activeSection = new Map<string, string>();
                this.values.set(newSectionName, activeSection);
                continue;
            }

            const keyValue = configLines[i].split('=');
            if (keyValue[1] === '[') {
                // TODO: Array parsing support.
                while (i < configLines.length && configLines[i] !== ']') {
                    i++;
                }
                continue;
            }
            activeSection.set(keyValue[0], keyValue[1]);
        }
    }

    getSection(name: string): ConfigSection | null {
        return this.values.has(name) ? this.values.get(name)! : null;
    }
}
