import { Id } from "./Base";

export type HcvSettings = {
    dataElement: {
        id: Id;
        remove: boolean;
        dataElementsToUpdate: HcvSettingsDataElements[];
    };
};

export type HcvSettingsDataElements = {
    id: Id;
    condition: string;
    value: string;
};
