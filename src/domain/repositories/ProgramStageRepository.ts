import { Id } from "domain/entities/Base";
import { ProgramStage } from "domain/entities/ProgramStage";

export interface ProgramStageRepository {
    getById(id: Id): Promise<ProgramStage>;
    save(programStage: ProgramStage): Promise<void>;
}
