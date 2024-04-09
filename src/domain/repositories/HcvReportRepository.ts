import { Async } from "domain/entities/Async";
import { HcvSettings } from "domain/entities/HcvSettings";
import { ProgramEvent } from "domain/entities/ProgramEvent";

export interface HcvReportRepository {
    saveReport(events: ProgramEvent[], options: HcvExportOptions): Async<void>;
}

export type HcvExportOptions = { settings: HcvSettings };
