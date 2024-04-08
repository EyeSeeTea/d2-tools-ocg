import { Id, Ref } from "./Base";

export type ProgramStage = {
    id: Id;
    dataElements: ProgramStageDataElement[];
};

export type ProgramStageDataElement = {
    id: Id;
    dataElement: Ref;
};
