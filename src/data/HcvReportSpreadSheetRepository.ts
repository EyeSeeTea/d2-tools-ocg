import _ from "lodash";
import { createObjectCsvWriter } from "csv-writer";
import { Async } from "domain/entities/Async";
import { ProgramEvent } from "domain/entities/ProgramEvent";
import { HcvExportOptions, HcvReportRepository } from "domain/repositories/HcvReportRepository";
import { Path } from "domain/entities/Base";

export class HcvReportSpreadSheetRepository implements HcvReportRepository {
    constructor(private path: Path) {}
    async saveReport(events: ProgramEvent[], options: HcvExportOptions): Async<void> {
        if (!this.path) return;

        const csvWriter = createObjectCsvWriter({ path: this.path, header: csvHeaders });

        const csvData = _(events)
            .map(event => {
                const dataValue = event.dataValues.find(
                    dataValue => options.settings.dataElement.id === dataValue.dataElementId
                );
                if (!dataValue) return undefined;
                const columnsWithValues = _(options.settings.dataElement.dataElementsToUpdate)
                    .map(dataElement => {
                        const dataValue = event.dataValues.find(
                            dataValue => dataValue.dataElementId === dataElement.id
                        );
                        if (!dataValue) return undefined;
                        return {
                            [dataElement.condition]:
                                dataElement.id === dataValue.dataElementId ? dataValue.value : "",
                        };
                    })
                    .compact()
                    .value();

                const columns = _(columnsWithValues)
                    .map(column => {
                        const key = Object.keys(column)[0];
                        if (!key) throw Error(`Column not found: ${key}`);
                        const value = column[key];
                        return value !== undefined ? [key, value] : undefined;
                    })
                    .compact()
                    .fromPairs()
                    .value();

                return { event: event.id, dataElement: dataValue.value, ...columns };
            })
            .compact()
            .value();

        await csvWriter.writeRecords(csvData);
    }
}

const csvHeaders = [
    {
        id: "event",
        title: "Event",
    },
    {
        id: "dataElement",
        title: "HCV treatment received",
    },
    {
        id: "sof",
        title: "SOF",
    },
    {
        id: "dac",
        title: "DAC",
    },
    {
        id: "vel",
        title: "VEL",
    },
    {
        id: "other",
        title: "OTHER",
    },
];
