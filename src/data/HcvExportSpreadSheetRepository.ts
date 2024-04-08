import _ from "lodash";
import { createObjectCsvWriter } from "csv-writer";
import { Async } from "domain/entities/Async";
import { ProgramEvent } from "domain/entities/ProgramEvent";
import { HcvExportOptions, HcvExportRepository } from "domain/repositories/HcvExportRepository";

export class HcvExportSpreadSheetRepository implements HcvExportRepository {
    async saveReport(events: ProgramEvent[], options: HcvExportOptions): Async<void> {
        const csvWriter = createObjectCsvWriter({
            path: options.csvPath,
            header: [
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
            ],
        });

        const csvData = _(events)
            .map(event => {
                const dataValue = event.dataValues.find(
                    dataValue => options.settings.dataElement.id === dataValue.dataElementId
                );
                if (!dataValue) return undefined;
                const keys = _(options.settings.dataElement.dataElementsToUpdate)
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

                const columns = keys.reduce((acc, curr) => {
                    const key = Object.keys(curr)[0];
                    if (!key) throw Error("Key not found");
                    const value = curr[key];
                    if (typeof value === "string") {
                        acc[key] = value;
                    }
                    return acc;
                });

                return { event: event.id, dataElement: dataValue.value, ...columns };
            })
            .compact()
            .value();

        // console.log("columns", csvData);

        await csvWriter.writeRecords(csvData);
    }
}
