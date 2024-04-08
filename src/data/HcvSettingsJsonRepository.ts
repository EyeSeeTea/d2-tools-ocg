import { HcvSettings } from "domain/entities/HcvSettings";
import { HcvSettingsRepository } from "domain/repositories/HcvSettingsRepository";
import { readFileSync } from "jsonfile";

export class HcvSettingsJsonRepository implements HcvSettingsRepository {
    get(path: string): Promise<HcvSettings> {
        return readFileSync(path, { encoding: "utf-8" });
    }
}
