import { Async } from "domain/entities/Async";
import { Path } from "domain/entities/Base";
import { HcvSettings } from "domain/entities/HcvSettings";
import { readFile } from "jsonfile";
import { array, boolean, Codec, string } from "purify-ts";

const HcvSettingsCodec = Codec.interface({
    dataElement: Codec.interface({
        id: string,
        remove: boolean,
        dataElementsToUpdate: array(
            Codec.interface({
                id: string,
                condition: string,
                value: string,
            })
        ),
    }),
});

export async function buildSettings(path: Path): Async<HcvSettings> {
    const settings = await readFile(path, { encoding: "utf-8" });
    return new Promise(resolve => {
        return HcvSettingsCodec.decode(settings).caseOf({
            Left: err => {
                throw Error(err);
            },
            Right: res => {
                return resolve(res);
            },
        });
    });
}
