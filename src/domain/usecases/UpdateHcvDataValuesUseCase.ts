import _ from "lodash";
import { Async } from "domain/entities/Async";
import { Id } from "domain/entities/Base";
import { Result } from "domain/entities/Result";
import logger from "utils/log";
import { ProgramEventsRepository } from "domain/repositories/ProgramEventsRepository";
import { EventDataValue, ProgramEvent } from "domain/entities/ProgramEvent";
import { HcvSettings } from "domain/entities/HcvSettings";
import { Maybe } from "utils/ts-utils";
import { ProgramStageRepository } from "domain/repositories/ProgramStageRepository";
import { ProgramStage, ProgramStageDataElement } from "domain/entities/ProgramStage";
import { HcvReportRepository } from "domain/repositories/HcvReportRepository";

export class UpdateHcvDataValuesUseCase {
    constructor(
        private programEventsRepository: ProgramEventsRepository,
        private programStageRepository: ProgramStageRepository,
        private exportRepository: HcvReportRepository
    ) {}

    async execute(options: HcvDataValuesOptions): Async<Result> {
        const { post, programId, programStageId, rootOrgUnit, settings } = options;
        const programStage = await this.programStageRepository.getById(programStageId);
        const eventMetadata = await this.programEventsRepository.get({
            orgUnitsIds: [rootOrgUnit],
            orgUnitMode: "DESCENDANTS",
            programStagesIds: [programStage.id],
            programIds: [programId],
        });

        logger.debug(`Total events fetched: ${eventMetadata.length}`);

        const parentEvents = this.getParentEvents(eventMetadata, settings);
        const eventsToUpdate = this.eventsToUpdate(parentEvents, settings);
        logger.debug(`Events to update: ${eventsToUpdate.length}`);

        await this.exportRepository.saveReport(eventsToUpdate, { settings: settings });

        if (post) {
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
            .map((event): Maybe<ProgramEvent> => {
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
                    storedBy: parentDataValue.storedBy,
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
    settings: HcvSettings;
};
