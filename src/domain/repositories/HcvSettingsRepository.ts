import { HcvSettings } from "domain/entities/HcvSettings";

export interface HcvSettingsRepository {
    get(path: string): Promise<HcvSettings>;
}
