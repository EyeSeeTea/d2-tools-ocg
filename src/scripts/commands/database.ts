// Commands related to dhis2 database direct manipulation.
// The generated sql files can be run for example with: d2-docker run-sql <file>

import _ from "lodash";
import fs from "fs";
import { command, subcommands, positional, flag, option, optional, string } from "cmd-ts";
import { HierarchyLevel, OrgUnitPath } from "scripts/common";

export function getCommand() {
    const removeOrgUnitLevelCommand = command({
        name: "remove-orgunit-level",
        description: "Create a sql file that removes organisation units below a hierarchy level",
        args: {
            level: positional({
                type: HierarchyLevel,
                description: "Maximum hierarchy level to keep",
            }),
            outputFile: option({
                type: optional(string),
                long: "output-file",
                description: "Name of the output file that will contain the sql commands",
            }),
            overwrite: flag({
                long: "overwrite",
                description: "Overwrite ouput file if exists",
            }),
        },
        handler: async args => {
            const outputFile = args.outputFile ?? "remove_orgunits.sql";
            const sqlCommands = removeOrgs(`hierarchylevel > ${args.level}`);
            safeWrite(outputFile, sqlCommands, args.overwrite);
            process.exit(0);
        },
    });

    const removeOrgUnitChildrenCommand = command({
        name: "remove-orgunit-children",
        description: "Create a sql file that removes all children of an organisation unit",
        args: {
            path: positional({
                type: OrgUnitPath,
                description: "Path of the organisation unit to prune of its children",
            }),
            outputFile: option({
                type: optional(string),
                long: "output-file",
                description: "Name of the output file that will contain the sql commands",
            }),
            overwrite: flag({
                long: "overwrite",
                description: "Overwrite ouput file if exists",
            }),
        },
        handler: async args => {
            const outputFile = args.outputFile ?? "remove_orgunits.sql";
            const sqlCommands = removeOrgs(`path LIKE '${args.path}/%'`);
            safeWrite(outputFile, sqlCommands, args.overwrite);
            process.exit(0);
        },
    });

    return subcommands({
        name: "database",
        cmds: {
            "remove-orgunit-level": removeOrgUnitLevelCommand,
            "remove-orgunit-children": removeOrgUnitChildrenCommand,
        },
    });
}

// Write to outputFile the given string str, unless the file exists.
function safeWrite(outputFile: string, str: string, overwrite: boolean) {
    if (!fs.existsSync(outputFile) || overwrite) {
        fs.writeFileSync(outputFile, str);
        console.log(`Written: ${outputFile}`);
    } else {
        console.error(`ERROR. Output file already exists: ${outputFile}`);
        console.error("Use --overwrite if you want to overwrite it anyway.");
    }
}

// Return an SQL string that would remove all the organisation units that
// satisfy the given whereCondition.
function removeOrgs(whereCondition: string): string {
    return `
\\echo -- Finding all orgunits to delete...

CREATE MATERIALIZED VIEW orgs
    AS SELECT organisationunitid FROM organisationunit WHERE ${whereCondition};
CREATE UNIQUE INDEX idx_orgs ON orgs (organisationunitid);


\\echo -- Finding related data to delete...

CREATE MATERIALIZED VIEW rm_trackedentityinstance
    AS SELECT trackedentityinstanceid FROM trackedentityinstance WHERE
        organisationunitid IN (SELECT * FROM orgs);

CREATE MATERIALIZED VIEW rm_programinstance
    AS SELECT programinstanceid FROM programinstance WHERE
        organisationunitid IN (SELECT * FROM orgs);

-- The following would be very slow (but I am not sure why):
-- CREATE MATERIALIZED VIEW rm_programstageinstance
--     AS SELECT programstageinstanceid FROM programstageinstance WHERE
--         organisationunitid IN (SELECT * FROM orgs) OR
--         programinstanceid  IN (SELECT * FROM rm_programinstance);
-- So instead we do:
CREATE MATERIALIZED VIEW rm_programstageinstance_orgs
    AS SELECT programstageinstanceid FROM programstageinstance WHERE
        organisationunitid IN (SELECT * FROM orgs);
CREATE MATERIALIZED VIEW rm_programstageinstance_programinstance
    AS SELECT programstageinstanceid FROM programstageinstance WHERE
        programinstanceid IN (SELECT * FROM rm_programinstance);
CREATE MATERIALIZED VIEW rm_programstageinstance
    AS SELECT * FROM rm_programstageinstance_orgs
    UNION ALL SELECT * FROM rm_programstageinstance_programinstance;

CREATE MATERIALIZED VIEW rm_interpretation
    AS SELECT interpretationid FROM interpretation WHERE organisationunitid IN (SELECT * FROM orgs);

CREATE MATERIALIZED VIEW rm_programmessage
    AS SELECT id FROM programmessage WHERE
        organisationunitid      IN (SELECT * FROM orgs) OR
        trackedentityinstanceid IN (SELECT * FROM rm_trackedentityinstance) OR
        programstageinstanceid  IN (SELECT * FROM rm_programstageinstance) OR
        programinstanceid       IN (SELECT * FROM rm_programinstance);


\\echo -- Creating indices to speed up the slowest foreign key constraint checks...

CREATE INDEX IF NOT EXISTS idx_datavalue_organisationunitid                 ON datavalue                 (sourceid);
CREATE INDEX IF NOT EXISTS idx_datavalueaudit_organisationunitid            ON datavalueaudit            (organisationunitid);
CREATE INDEX IF NOT EXISTS idx_program_organisationunits_organisationunitid ON program_organisationunits (organisationunitid);
CREATE INDEX IF NOT EXISTS idx_orgunitgroup_organisationunitid              ON orgunitgroupmembers       (organisationunitid);
CREATE INDEX IF NOT EXISTS idx_programinstance_organisationunitid           ON programinstance           (organisationunitid);
CREATE INDEX IF NOT EXISTS idx_dataset_organisationunit                     ON datasetsource             (sourceid);


\\echo -- Deleting references to those orgunits in the data...
\\echo -- Some tables may not exist and give an error, but that is okay.

DELETE FROM programmessage_emailaddresses    WHERE programmessageemailaddressid     IN (SELECT * FROM rm_programmessage);
DELETE FROM programmessage_deliverychannels  WHERE programmessagedeliverychannelsid IN (SELECT * FROM rm_programmessage);
DELETE FROM programmessage                   WHERE id                               IN (SELECT * FROM rm_programmessage);

DELETE FROM programstageinstancecomments     WHERE programstageinstanceid  IN (SELECT * FROM rm_programstageinstance);
DELETE FROM programinstanceaudit             WHERE programinstanceid       IN (SELECT * FROM rm_programinstance);
DELETE FROM trackedentitydatavalueaudit      WHERE programstageinstanceid  IN (SELECT * FROM rm_programstageinstance);
DELETE FROM programstageinstance             WHERE programstageinstanceid  IN (SELECT * FROM rm_programstageinstance);

DELETE FROM programinstancecomments          WHERE programinstanceid       IN (SELECT * FROM rm_programinstance);
DELETE FROM programinstance                  WHERE programinstanceid       IN (SELECT * FROM rm_programinstance);

DELETE FROM trackedentityattributevalue      WHERE trackedentityinstanceid IN (SELECT * FROM rm_trackedentityinstance);
DELETE FROM trackedentityattributevalueaudit WHERE trackedentityinstanceid IN (SELECT * FROM rm_trackedentityinstance);
DELETE FROM trackedentityprogramowner        WHERE organisationunitid      IN (SELECT * FROM orgs);
DELETE FROM trackedentityinstance            WHERE trackedentityinstanceid IN (SELECT * FROM rm_trackedentityinstance);

DELETE FROM interpretationuseraccesses       WHERE interpretationid        IN (SELECT * FROM rm_interpretation);
DELETE FROM interpretation_comments          WHERE interpretationid        IN (SELECT * FROM rm_interpretation);
DELETE FROM intepretation_likedby            WHERE interpretationid        IN (SELECT * FROM rm_interpretation);
DELETE FROM interpretation                   WHERE interpretationid        IN (SELECT * FROM rm_interpretation);

DELETE FROM _datasetorganisationunitcategory     WHERE organisationunitid      IN (SELECT * FROM orgs);
DELETE FROM _organisationunitgroupsetstructure   WHERE organisationunitid      IN (SELECT * FROM orgs);
DELETE FROM _orgunitstructure                    WHERE organisationunitid      IN (SELECT * FROM orgs);
DELETE FROM categoryoption_organisationunits     WHERE organisationunitid      IN (SELECT * FROM orgs);
DELETE FROM chart_organisationunits              WHERE organisationunitid      IN (SELECT * FROM orgs);
DELETE FROM completedatasetregistration          WHERE sourceid                IN (SELECT * FROM orgs);
DELETE FROM configuration                        WHERE selfregistrationorgunit IN (SELECT * FROM orgs);
DELETE FROM dataapproval                         WHERE organisationunitid      IN (SELECT * FROM orgs);
DELETE FROM dataapprovalaudit                    WHERE organisationunitid      IN (SELECT * FROM orgs);
DELETE FROM datasetsource                        WHERE sourceid                IN (SELECT * FROM orgs);
DELETE FROM datavalue                            WHERE sourceid                IN (SELECT * FROM orgs);
DELETE FROM datavalueaudit                       WHERE organisationunitid      IN (SELECT * FROM orgs);
DELETE FROM eventchart_organisationunits         WHERE organisationunitid      IN (SELECT * FROM orgs);
DELETE FROM eventreport_organisationunits        WHERE organisationunitid      IN (SELECT * FROM orgs);
DELETE FROM eventvisualization_organisationunits WHERE organisationunitid      IN (SELECT * FROM orgs);
DELETE FROM lockexception                        WHERE organisationunitid      IN (SELECT * FROM orgs);
DELETE FROM mapview_organisationunits            WHERE organisationunitid      IN (SELECT * FROM orgs);
DELETE FROM minmaxdataelement                    WHERE sourceid                IN (SELECT * FROM orgs);
DELETE FROM organisationunitattributevalues      WHERE organisationunitid      IN (SELECT * FROM orgs);
DELETE FROM orgunitgroupmembers                  WHERE organisationunitid      IN (SELECT * FROM orgs);
DELETE FROM program_organisationunits            WHERE organisationunitid      IN (SELECT * FROM orgs);
DELETE FROM programownershiphistory              WHERE organisationunitid      IN (SELECT * FROM orgs);
DELETE FROM reporttable_organisationunits        WHERE organisationunitid      IN (SELECT * FROM orgs);
DELETE FROM userdatavieworgunits                 WHERE organisationunitid      IN (SELECT * FROM orgs);
DELETE FROM usermembership                       WHERE organisationunitid      IN (SELECT * FROM orgs);
DELETE FROM userteisearchorgunits                WHERE organisationunitid      IN (SELECT * FROM orgs);
DELETE FROM validationresult                     WHERE organisationunitid      IN (SELECT * FROM orgs);
DELETE FROM visualization_organisationunits      WHERE organisationunitid      IN (SELECT * FROM orgs);


\\echo -- Deleting orgunits themselves...

DELETE FROM organisationunit WHERE organisationunitid IN (SELECT * FROM orgs);


\\echo -- Cleaning up...

DROP MATERIALIZED VIEW orgs CASCADE;`;
}
// Maybe this is worth checking too:
// https://github.com/dhis2/dhis2-utils/blob/master/resources/sql/delete_orgunittree_with_data.sql
