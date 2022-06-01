import _ from "lodash";
import { Async } from "domain/entities/Async";
import { Id } from "domain/entities/Base";
import { ProgramExport } from "domain/entities/ProgramExport";
import { ProgramsRepository } from "domain/repositories/ProgramsRepository";
import { D2Api } from "types/d2-api";
import log from "utils/log";
import { runMetadata } from "./dhis2-utils";

type MetadataRes = { date: string } & { [k: string]: Array<{ id: string }> };

export class ProgramsD2Repository implements ProgramsRepository {
    constructor(private api: D2Api) {}

    async export(options: { ids: Id[] }): Async<ProgramExport> {
        const { api } = this;
        const programIds = options.ids;

        const responses = await promiseMap(programIds, programId =>
            api.get<MetadataRes>(`/programs/${programId}/metadata.json`).getData()
        );

        const keys = _(responses).flatMap(_.keys).uniq().difference(["date"]).value();
        const metadata = _(keys)
            .map(key => {
                const value = _(responses)
                    .flatMap(res => res[key] || [])
                    .uniqBy(obj => obj.id)
                    .value();

                return [key, value];
            })
            .fromPairs()
            .value();

        const events = await this.getFromTracker("events", programIds);
        const enrollments = await this.getFromTracker("enrollments", programIds);
        const trackedEntities = await this.getFromTracker("trackedEntities", programIds);

        return {
            metadata,
            data: { events, enrollments, trackedEntities },
        };
    }

    async import(programExport: ProgramExport): Async<void> {
        log.info("Import metadata");
        const _metadataRes = await runMetadata(this.api.metadata.post(programExport.metadata));

        log.info("Import data: enrollments, trackedEntities");
        const data1 = _.pick(programExport.data, ["enrollments", "trackedEntities"]);
        const _data1Res = await this.postTracker(data1);

        for (const events of _.chunk(programExport.data.events, 1000)) {
            log.info("Import data: events");
            const _data2Res = await this.postTracker({ events });
        }
    }

    async postTracker(data: object): Async<TrackerResponse> {
        // TODO: Implement in d2-api -> POST api.tracker.post
        const res = await this.api.post<TrackerResponse>("/tracker", { async: false }, data).getData();
        console.debug(res.status);

        if (res.status !== "OK") {
            console.error(JSON.stringify(res.typeReports, null, 4));
            throw new Error("Error on post");
        } else {
            return res;
        }
    }

    async getFromTracker(apiPath: string, programIds: string[]): Promise<object[]> {
        const output = [];

        for (const programId of programIds) {
            let page = 1;
            let dataRemaining = true;

            while (dataRemaining) {
                // TODO: Implement in d2-api -> GET api.tracker.{events,enrollments,trackedEntities}
                const { instances } = await this.api
                    .get<{ instances: object[] }>(`/tracker/${apiPath}`, {
                        page,
                        pageSize: 10e3,
                        ouMode: "ALL",
                        fields: "*",
                        program: programId,
                    })
                    .getData();

                if (instances.length === 0) {
                    dataRemaining = false;
                } else {
                    output.push(...instances);
                    page++;
                }
            }
        }

        return output;
    }
}

type TrackerResponse = { status: string; typeReports: object[] };

function promiseMap<T, S>(inputValues: T[], mapper: (value: T) => Promise<S>): Promise<S[]> {
    const reducer = (acc$: Promise<S[]>, inputValue: T): Promise<S[]> =>
        acc$.then((acc: S[]) =>
            mapper(inputValue).then(result => {
                acc.push(result);
                return acc;
            })
        );
    return inputValues.reduce(reducer, Promise.resolve([]));
}
