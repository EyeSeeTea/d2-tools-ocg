import _ from "lodash";
import { Async } from "domain/entities/Async";
import { Id } from "domain/entities/Base";
import { Result } from "domain/entities/Result";
import logger from "utils/log";
import { ProgramEventsRepository } from "domain/repositories/ProgramEventsRepository";
import { EventDataValue, ProgramEvent } from "domain/entities/ProgramEvent";
import { HcvSettingsRepository } from "domain/repositories/HcvSettingsRepository";
import { HcvSettings } from "domain/entities/HcvSettings";
import { Maybe } from "utils/ts-utils";
import { ProgramStageRepository } from "domain/repositories/ProgramStageRepository";
import { ProgramStage, ProgramStageDataElement } from "domain/entities/ProgramStage";
import { HcvExportRepository } from "domain/repositories/HcvExportRepository";

export class UpdateHcvDataValuesUseCase {
    constructor(
        private programEventsRepository: ProgramEventsRepository,
        private hcvSettingsRepository: HcvSettingsRepository,
        private programStageRepository: ProgramStageRepository,
        private exportRepository: HcvExportRepository
    ) {}

    async execute(options: HcvDataValuesOptions): Async<Result> {
        const programStage = await this.programStageRepository.getById(options.programStageId);
        const eventMetadata = await this.programEventsRepository.get({
            orgUnitsIds: [options.rootOrgUnit],
            orgUnitMode: "DESCENDANTS",
            programStagesIds: [programStage.id],
            programIds: [options.programId],
        });

        logger.debug(`Total events fetched: ${eventMetadata.length}`);

        const settings = await this.hcvSettingsRepository.get(options.settingsPath);

        const parentEvents = this.getParentEvents(eventMetadata, settings);
        const eventsToUpdate = this.eventsToUpdate(parentEvents, settings);
        logger.debug(`Events to update: ${eventsToUpdate.length}`);

        if (options.csvPath) {
            await this.exportRepository.saveReport(eventsToUpdate, {
                csvPath: options.csvPath,
                settings: settings,
            });
        }

        if (options.post) {
            logger.debug("Updating events...");
            const result = await this.programEventsRepository.save(eventsToUpdate);
            logger.debug("Events updated");

            if (settings.dataElement.remove) {
                const programStageToUpdate = this.removeParentDataElementFromProgramStage(
                    programStage,
                    settings
                );
                logger.debug(
                    `Removing dataElement ${settings.dataElement.id} from program stage ${programStage.id}...`
                );
                await this.programStageRepository.save(programStageToUpdate);
                logger.debug("DataElement removed");
            }

            return result;
        } else {
            return { type: "success" };
        }
    }

    private removeParentDataElementFromProgramStage(
        programStage: ProgramStage,
        settings: HcvSettings
    ): ProgramStage {
        const programStageWithoutParentDataElement = _(programStage.dataElements)
            .map((programStageDataElement): Maybe<ProgramStageDataElement> => {
                if (programStageDataElement.dataElement.id === settings.dataElement.id) return undefined;
                return programStageDataElement;
            })
            .compact()
            .value();

        const programStageToUpdate: ProgramStage = {
            ...programStage,
            dataElements: programStageWithoutParentDataElement,
        };
        return programStageToUpdate;
    }

    private eventsToUpdate(events: ProgramEvent[], settings: HcvSettings): ProgramEvent[] {
        return _(events)
            .map(event => {
                const parentDataValue = event.dataValues.find(
                    dataValue => dataValue.dataElementId === settings.dataElement.id
                );

                if (!parentDataValue) return undefined;

                return {
                    ...event,
                    dataValues: this.checkDataValueCondition(event, settings, parentDataValue),
                };
            })
            .compact()
            .value();
    }

    private checkDataValueCondition(
        event: ProgramEvent,
        settings: HcvSettings,
        parentDataValue: EventDataValue
    ): EventDataValue[] {
        const dataElementsToUpdate = _(settings.dataElement.dataElementsToUpdate)
            .map((dataElementToUpdate): Maybe<EventDataValue> => {
                return {
                    dataElementId: dataElementToUpdate.id,
                    value:
                        dataElementToUpdate.condition === parentDataValue.value
                            ? dataElementToUpdate.value
                            : "",
                    storedBy: "",
                    lastUpdated: new Date().toISOString(),
                };
            })
            .compact()
            .value();
        return _(dataElementsToUpdate).unionBy(event.dataValues, "dataElementId").value();
    }

    private getParentEvents(events: ProgramEvent[], settings: HcvSettings): ProgramEvent[] {
        return _(events)
            .map(event => {
                const parentDataValue = event.dataValues.find(
                    dataValue => dataValue.dataElementId === settings.dataElement.id
                );
                if (!parentDataValue) return undefined;
                return event;
            })
            .compact()
            .value();
    }
}

export type HcvDataValuesOptions = {
    post: boolean;
    programId: Id;
    programStageId: Id;
    rootOrgUnit: Id;
    settingsPath: string;
    csvPath: string;
};
