import { D2Api } from "types/d2-api";
import { ProgramStageRepository } from "domain/repositories/ProgramStageRepository";
import { ProgramStage } from "domain/entities/ProgramStage";
import { writeFile } from "jsonfile";

export class ProgramStageD2Repository implements ProgramStageRepository {
    constructor(private api: D2Api) {}

    async getById(id: string): Promise<ProgramStage> {
        const programStage = await this.getProgramStageById(id);

        return {
            id: programStage.id,
            dataElements: programStage.programStageDataElements.map(psDe => ({
                id: psDe.id,
                dataElement: { id: psDe.dataElement.id },
            })),
        };
    }

    private async getProgramStageById(id: string) {
        const d2Response = await this.api.models.programStages
            .get({
                fields: { id: true, programStageDataElements: { id: true, dataElement: true } },
                filter: { id: { eq: id } },
            })
            .getData();
        const d2ProgramStage = d2Response.objects[0];
        if (!d2ProgramStage) {
            throw new Error(`ProgramStage with id ${id} not found`);
        }
        return d2ProgramStage;
    }

    async save(programStage: ProgramStage): Promise<void> {
        const d2Response = await this.api.models.programStages
            .get({
                fields: { $owner: true },
                filter: { id: { eq: programStage.id } },
            })
            .getData();

        const d2ProgramStage = d2Response.objects[0];
        if (!d2ProgramStage) {
            throw new Error(`ProgramStage with id ${programStage.id} not found`);
        }

        const programStageToSave = {
            ...d2ProgramStage,
            programStageDataElements: programStage.dataElements.map(dataElementStage => {
                const existingDataElement = d2ProgramStage.programStageDataElements.find(
                    psDe => psDe.id === dataElementStage.id
                );
                return {
                    ...(existingDataElement || {}),
                    dataElement: { id: dataElementStage.dataElement.id },
                };
            }),
        };
        await writeFile("d2ProgramStage.json", { programStages: [programStageToSave] });
        const response = await this.api.metadata.post({ programStages: [programStageToSave] }).getData();

        await writeFile("psresponse.json", JSON.stringify(response, null, 2));
    }
}
