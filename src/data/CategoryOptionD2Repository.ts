import _ from "lodash";
import { D2Api, MetadataPick, TypeReport } from "types/d2-api";
import { Async } from "domain/entities/Async";
import { CategoryOptionParams, CategoryOptionRepository } from "domain/repositories/CategoryOptionRepository";
import { CategoryOption, GroupPermission, PublicPermission } from "domain/entities/CategoryOption";
import { getId, Id } from "domain/entities/Base";
import { getInChunks } from "./dhis2-utils";
import { Stats } from "domain/entities/Stats";

export class CategoryOptionD2Repository implements CategoryOptionRepository {
    constructor(private api: D2Api) {}

    getAll(params: CategoryOptionParams): Async<CategoryOption[]> {
        return this.getCategoryOptions(params, []);
    }

    async saveAll(categoryOptions: CategoryOption[]): Async<Stats> {
        const catOptionsIdsToSave = categoryOptions.map(getId);
        const stats = await getInChunks<Stats>(catOptionsIdsToSave, async catOptionsIds => {
            const response = await this.api.metadata
                .get({
                    categoryOptions: {
                        fields: {
                            $owner: true,
                        },
                        filter: {
                            id: {
                                in: catOptionsIds,
                            },
                        },
                    },
                })
                .response();

            const catOptionsToSave = catOptionsIds.map(capOptionId => {
                const existingD2CatOption = response.data.categoryOptions.find(
                    d2CatOption => d2CatOption.id === capOptionId
                );
                const categoryOption = categoryOptions.find(co => co.id === capOptionId);
                if (!categoryOption) {
                    throw Error("Cannot find category option");
                }

                const permissionsGroupsByKey = this.buildUserGroupsFromPermissions(categoryOption);

                const newSharing = {
                    ...(existingD2CatOption ? existingD2CatOption.sharing : {}),
                    public: categoryOption.permissions.find(permission => permission.type === "public")
                        ?.value,
                    userGroups: permissionsGroupsByKey,
                };

                return {
                    ...(existingD2CatOption || {}),
                    id: categoryOption.id,
                    sharing: newSharing,
                };
            });

            const saveResponse = (await this.api.metadata
                .post({
                    categoryOptions: catOptionsToSave,
                })
                .getData()) as never as D2Response;

            const errorMessage = saveResponse.response.typeReports
                .flatMap(x => x.objectReports)
                .flatMap(x => x.errorReports)
                .map(x => x.message)
                .join("\n");

            return [
                {
                    recordsSkipped: saveResponse.status === "ERROR" ? catOptionsToSave.map(co => co.id) : [],
                    errorMessage,
                    created: saveResponse.response.stats.created,
                    ignored: saveResponse.response.stats.ignored,
                    updated: saveResponse.response.stats.updated,
                },
            ];
        });

        return stats.reduce(
            (acum, stat) => {
                return {
                    recordsSkipped: [...acum.recordsSkipped, ...stat.recordsSkipped],
                    errorMessage: `${acum.errorMessage}${stat.errorMessage}`,
                    created: acum.created + stat.created,
                    ignored: acum.ignored + stat.ignored,
                    updated: acum.updated + stat.updated,
                };
            },
            {
                recordsSkipped: [],
                errorMessage: "",
                created: 0,
                ignored: 0,
                updated: 0,
            }
        );
    }

    private buildUserGroupsFromPermissions(categoryOption: CategoryOption): Record<Id, D2IdAccess> {
        const groupPermissions = _(categoryOption.permissions)
            .map(permission => {
                if (permission.type !== "groups") return undefined;
                return {
                    displayName: permission.name,
                    access: permission.value,
                    id: permission.id,
                };
            })
            .compact()
            .value();

        const permissionsGroupsByKey = _.keyBy(groupPermissions, "id");
        return permissionsGroupsByKey;
    }

    private async getCategoryOptions(
        params: CategoryOptionParams,
        acum: CategoryOption[]
    ): Async<CategoryOption[]> {
        const d2Response = await this.getPaginatedCategoryOptions(params);
        const newRecords = [...acum, ...this.buildCategoryOption(d2Response.data.objects)];
        if (d2Response.data.pager.page >= d2Response.data.pager.pageCount) {
            return newRecords;
        } else {
            return this.getCategoryOptions({ ...params, page: params.page + 1 }, newRecords);
        }
    }

    private buildCategoryOption(result: D2CategoryOption[]) {
        return result.map((d2CategoryOption): CategoryOption => {
            const publicPermission: PublicPermission = {
                type: "public",
                value: d2CategoryOption.sharing.public,
            };

            const groupPermissionsValues = _.values(d2CategoryOption.sharing.userGroups) as D2IdAccess[];

            const groupPermissions = groupPermissionsValues.map(d2SharingGroup => {
                const groupPermission: GroupPermission = {
                    id: d2SharingGroup.id,
                    name: d2SharingGroup.displayName,
                    type: "groups",
                    value: d2SharingGroup.access,
                };
                return groupPermission;
            });

            return new CategoryOption({
                id: d2CategoryOption.id,
                name: d2CategoryOption.name,
                code: d2CategoryOption.code || "",
                permissions: [publicPermission, ...groupPermissions],
            });
        });
    }

    private async getPaginatedCategoryOptions(params: CategoryOptionParams) {
        const response = await this.api.models.categoryOptions
            .get({
                fields: categoryOptionFields,
                page: params.page,
                pageSize: 300,
            })
            .response();
        return response;
    }
}

const categoryOptionFields = {
    id: true,
    name: true,
    code: true,
    publicAccess: true,
    sharing: {
        public: true,
        userGroups: true,
    },
    userGroupAccesses: {
        id: true,
        userGroupUid: true,
        displayName: true,
        access: true,
    },
} as const;

type D2CategoryOption = MetadataPick<{
    categoryOptions: { fields: typeof categoryOptionFields };
}>["categoryOptions"][number];

type D2Response = {
    status: "OK" | "ERROR";
    response: {
        stats: {
            created: number;
            updated: number;
            deleted: number;
            ignored: number;
            total: number;
        };
        typeReports: TypeReport[];
    };
};

type D2IdAccess = {
    id: Id;
    access: string;
    displayName: string;
};
