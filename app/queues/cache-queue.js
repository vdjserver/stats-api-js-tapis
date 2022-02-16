'use strict';

//
// cache-queue.js
// Job queue for the statistics cache
//
// VDJServer Community Data Portal
// Statistics API service
// https://vdjserver.org
//
// Copyright (C) 2021 The University of Texas Southwestern Medical Center
//
// Author: Scott Christley <scott.christley@utsouthwestern.edu>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
//

var CacheQueue = {};
module.exports = CacheQueue;

// App
var tapisIO = require('vdj-tapis-js');
var tapisSettings = tapisIO.tapisSettings;
var webhookIO = require('../vendor/webhookIO');

// Server environment config
var config = require('../config/config');

var Queue = require('bull');

var triggerQueue = new Queue('Statistics cache trigger');
var createQueue = new Queue('Statistics cache create');
var checkQueue = new Queue('Statistics cache check');
var jobQueue = new Queue('Statistics cache job');
var finishQueue = new Queue('Statistics cache finish');

//
// Trigger the cache process
// check and create, if necessary, the statistics_cache metadata singleton.
// This is called by app initialization
//
CacheQueue.triggerCache = async function() {
    var context = 'CacheQueue.triggerCache';
    var msg = null;

    config.log.info(context, 'begin');

    if (! config.enable_cache) {
        msg = config.log.error(context, 'Cache is not enabled in configuration, cannot trigger');
        // TODO: delete any existing cache jobs
        webhookIO.postToSlack(msg);
        return Promise.reject(new Error(msg));
    }

    var stats_cache = await tapisIO.getStatisticsCache()
        .catch(function(error) {
            msg = config.log.error(context, 'error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return;
    }

    // create entry if doesn't exist
    if (stats_cache.length == 0) {
        config.log.info(context, 'creating statistics_cache metadata singleton', true);

        // create the stats_cache metadata singleton
        stats_cache = await tapisIO.createStatisticsCache()
            .catch(function(error) {
                msg = config.log.error(context, 'error' + error);
            });
        if (msg) {
            webhookIO.postToSlack(msg);
            return;
        }
    } else {
        stats_cache = stats_cache[0];
    }
    config.log.info(context, 'current enable_cache = ' + stats_cache['value']['enable_cache']);
    //console.log(stats_cache);

    // enable the cache
    config.log.info(context, 'enabling cache', true);
    stats_cache['value']['enable_cache'] = true;
    await tapisIO.updateMetadata(stats_cache['uuid'], stats_cache['name'], stats_cache['value'], null)
        .catch(function(error) {
            msg = config.log.error(context, 'error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return;
    }

    // trigger the create queue
    config.log.info(context, 'cache enabled, creating queue jobs', true);

    // submit to check every 3600secs/1hour
    //triggerQueue.add({stats_cache: stats_cache}, { repeat: { every: 3600000 }});

    // testing, every 2 mins
    triggerQueue.add({stats_cache: stats_cache}, { repeat: { every: 120000 }});

    // trigger the job queue
    // submit to check every 3600secs/1hour
    //checkQueue.add({stats_cache: stats_cache}, { repeat: { every: 3600000 }});

    // testing, every 2 mins
    checkQueue.add({stats_cache: stats_cache}, { repeat: { every: 120000 }});

    config.log.info(context, 'end');
}

// this should run periodically
triggerQueue.process(async (job) => {
    var context = 'triggerQueue';
    var msg = null;

    config.log.info(context, 'Triggering statistics cache queue');

    //console.log(job['data']);

    // nothing running so submit
    var stats_cache = await tapisIO.getStatisticsCache()
        .catch(function(error) {
            msg = config.log.error(context, 'error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }
    stats_cache = stats_cache[0];

    // verify cache is enabled
    if (stats_cache['value']['enable_cache']) {
        config.log.info(context, 'submitting statistics cache job', true);
        createQueue.add({stats_cache: stats_cache});
    } else {
        config.log.info(context, 'Statistics cache is not enabled', true);
    }

    config.log.info(context, 'end');
    return Promise.resolve();
});

// Statistics cache process
//
// top level job which gathers what is to be cached,
// creates/updates metadata entries for each cached item,
// then submits smaller individual jobs to generate cache contents
//
// 1. Create/update cache entries
// 2. Get next study/repertoire to be cached
// 3. do the caching
//
// we attempt to write in a re-entrant fashion
//
createQueue.process(async (job) => {
    var context = 'createQueue';
    var msg = null;

    config.log.info(context, 'begin statistics cache job');
    //console.log(job['data']);

    // get set of ADC repositories
    var repos = await tapisIO.getSystemADCRepositories()
        .catch(function(error) {
            msg = config.log.error(context, 'error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    if (!repos || repos.length != 1) {
        msg = config.log.error(context, 'tapisIO.getSystemADCRepositories invalid metadata: ' + repos);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    // create/update cache entries for each repository
    repos = repos[0]['value'][config.adcRepositoryEntry];
    //config.log.info(context, repos);
    //console.log(repos);

    for (var repository_id in repos) {
        // only if both download cache and statistics cache is enabled on repository
        if (! repos[repository_id]['enable_cache']) continue;
        if (! repos[repository_id]['enable_statistics_cache']) continue;

        config.log.info(context, 'Statistics cache create job for repository: ' + repository_id, true);

        // get the statistics cache study entries for the repository
        var stats_studies = await tapisIO.getStatisticsCacheStudyMetadata(repository_id)
            .catch(function(error) {
                msg = config.log.error(context, 'error' + error);
            });
        if (msg) {
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }
        config.log.info(context, stats_studies.length + ' statistics cache study entries for repository: ' + repository_id, true);

        // turn into dictionary keyed by study_id
        var stats_studies_dict = {};
        for (let i in stats_studies) {
            let study_id = stats_studies[i]['value']['study_id'];
            if (stats_studies_dict[study_id]) {
                msg = config.log.error(context, 'duplicate study_id: ' + study_id);
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            } else stats_studies_dict[study_id] = stats_studies[i];
        }

        // get the download cache study entries for the repository
        var cached_studies = await tapisIO.getStudyCacheEntries(repository_id)
            .catch(function(error) {
                msg = config.log.error(context, 'error' + error);
            });
        if (msg) {
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }
        //console.log(cached_studies);
        config.log.info(context, cached_studies.length + ' ADC download cache study entries for repository: ' + repository_id, true);

        // create study cache entries if necessary
        for (let i in cached_studies) {
            let study_id = cached_studies[i]['value']['study_id'];
            //console.log(study_id);
            // TODO: we should check if an existing study has been updated
            if (stats_studies_dict[study_id]) continue;
            
            // insert cache entry
            config.log.info(context, 'ADC study to be cached: ' + study_id, true);
            let cache_entry = await tapisIO.createStatisticsCacheStudyMetadata(repository_id, study_id, cached_studies[i]['uuid'], false)
                .catch(function(error) {
                    msg = config.log.error(context, 'error' + error);
                });
            if (msg) {
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }
            config.log.info(context, 'statistics cache entry created for ADC study: ' + study_id, true);
            //console.log(cache_entry);
        }

        // reload with any new entries
        stats_studies = await tapisIO.getStatisticsCacheStudyMetadata(repository_id)
            .catch(function(error) {
                msg = config.log.error(context, 'error' + error);
            });
        if (msg) {
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }
        config.log.info(context, stats_studies.length + ' statistics cache study entries for repository: ' + repository_id, true);

        // create repertoire cache entries if necessary
        for (let i in stats_studies) {
            if (! stats_studies[i]['value']['should_cache']) continue;
            if (stats_studies[i]['value']['is_cached']) continue;
            let study_id = stats_studies[i]['value']['study_id'];

            config.log.info(context, 'Create/Update statistics cache repertoire entries for study: ' + study_id, true);

            // get any cached repertoire entries for the study
            var cached_reps = await tapisIO.getRepertoireCacheEntries(repository_id, study_id, null, null, null)
                .catch(function(error) {
                    msg = config.log.error(context, 'error' + error);
                });
            if (msg) {
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }
            config.log.info(context, cached_reps.length + ' ADC download cache repertoire entries for study: ' + study_id, true);

            // create/update statistics cache entries
            for (let r in cached_reps) {
                var repertoire_id = cached_reps[r]['value']['repertoire_id'];
                var cache_uuid = cached_reps[r]['uuid'];

                // get existing statistics cache entry
                let stats_entry = await tapisIO.getStatisticsCacheRepertoireMetadata(repository_id, study_id, repertoire_id)
                    .catch(function(error) {
                        msg = config.log.error(context, 'error' + error);
                    });
                if (msg) {
                    webhookIO.postToSlack(msg);
                    return Promise.resolve();
                }
                //console.log(stats_entry);

                if (stats_entry.length == 0) {
                    // create cache entry
                    stats_entry = await tapisIO.createStatisticsCacheRepertoireMetadata(repository_id, study_id, repertoire_id, cache_uuid, true)
                        .catch(function(error) {
                            msg = config.log.error(context, 'error' + error);
                        });
                    if (msg) {
                        webhookIO.postToSlack(msg);
                        return Promise.resolve();
                    }
                    config.log.info(context, 'Created statistics cache repertoire entry ' + stats_entry['uuid'] + ' for repertoire: ' + repertoire_id, true);
                } else {
                    // existing entry
                    // TODO: we might want to update the existing entry
                    config.log.info(context, 'Existing statistics cache repertoire entry ' + stats_entry[0]['uuid'] + ' for repertoire: ' + repertoire_id, true);
                }
            }
        }
    }
    config.log.info(context, 'all cache entries updated');

    config.log.info(context, 'end');
    return Promise.resolve();
});

CacheQueue.pollJobs = async function() {
    var context = 'CacheQueue.pollJobs';
    var msg = null;

    config.log.info(context, 'begin');

    // get repertoires that need statistics with submitted jobs
    let stats_entries = await tapisIO.getStatisticsCacheRepertoireMetadata(null, null, null, true, false, null)
        .catch(function(error) {
            msg = config.log.error(context, 'error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    config.log.info(context, stats_entries.length + ' statistics cache repertoires entries needing statistics.', true);

    var with_jobs = [];
    for (let i in stats_entries) {
        let entry = stats_entries[i];
        if (entry['value']['statistics_job_id']) with_jobs.push(entry);
    }

    config.log.info(context, with_jobs.length + ' statistics cache repertoires entries have submitted jobs, checking job statuses.', true);

    if (with_jobs.length == 0) {
        config.log.info(context, 'No statistics jobs so clearing jobs_submitted flag.', true);

        // if no entries with jobs, can clear jobs_submitted flag on statistics cache singleton
        var stats_cache = await tapisIO.getStatisticsCache()
            .catch(function(error) {
                msg = config.log.error(context, 'error' + error);
            });
        if (msg) {
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }
        stats_cache = stats_cache[0];

        stats_cache['value']['jobs_submitted'] = false;
        await tapisIO.updateMetadata(stats_cache['uuid'], stats_cache['name'], stats_cache['value'], null)
            .catch(function(error) {
                msg = config.log.error(context, 'error' + error);
            });
        if (msg) {
            webhookIO.postToSlack(msg);
            return;
        }
    } else {
        for (let i in with_jobs) {
            let entry = with_jobs[i];
            let job_entry = await tapisIO.getJobOutput(entry['value']['statistics_job_id'])
            .catch(function(error) {
                    msg = config.log.error(context, 'error' + error);
                });
            if (msg) {
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }

            config.log.info(context, 'job ' + entry['value']['statistics_job_id'] + ' has status: '
                + job_entry['status'] + ' for statistics cache repertoires entry: '
                + entry['uuid'], true);

            // TODO: trigger notification for finished jobs
        }
    }

    config.log.info(context, 'end');
    return Promise.resolve();
}

// this should run periodically to check if statistics jobs are to be submitted
checkQueue.process(async (job) => {
    var context = 'checkQueue';
    var msg = null;

    config.log.info(context, 'begin');

    // get statistics cache singleton
    var stats_cache = await tapisIO.getStatisticsCache()
        .catch(function(error) {
            msg = config.log.error(context, 'error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }
    stats_cache = stats_cache[0];

    // verify cache is enabled
    if (!stats_cache['value']['enable_cache']) {
        config.log.info(context, 'Statistics cache is not enabled', true);
    } else {
        // check if jobs are submitted
        if (stats_cache['value']['jobs_submitted']) {
            config.log.info(context, 'Statistics jobs are already submitted', true);
            await CacheQueue.pollJobs();
        } else {
            config.log.info(context, 'Statistics jobs are not submitted, submit job queue', true);
            jobQueue.add({stats_cache: stats_cache});
        }
    }

    config.log.info(context, 'end');
    return Promise.resolve();
});

// submit a set of statistics jobs
jobQueue.process(async (job) => {
    var context = 'jobQueue';
    var msg = null;
    var stats_cache = job['data']['stats_cache'];
    var tapis_path = 'agave://' + tapisSettings.storageSystem + '//community/cache/';

    config.log.info(context, 'begin');

    // get repertoires that need statistics (max 5)
    let stats_entries = await tapisIO.getStatisticsCacheRepertoireMetadata(null, null, null, true, false, 5)
        .catch(function(error) {
            msg = config.log.error(context, 'error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    if (stats_entries.length == 0) {
        config.log.info(context, 'No statistics jobs need to be submitted', true);
    } else {
        // update statistics cache singleton to indicate jobs are submitted
        stats_cache['value']['jobs_submitted'] = true;
        await tapisIO.updateMetadata(stats_cache['uuid'], stats_cache['name'], stats_cache['value'], null)
            .catch(function(error) {
                msg = config.log.error(context, 'error' + error);
            });
        if (msg) {
            webhookIO.postToSlack(msg);
            return;
        }

        // submit jobs
        for (let i in stats_entries) {
            let entry = stats_entries[i];
            let repository_id = entry['value']['repository_id'];
            let study_id = entry['value']['study_id'];
            let repertoire_id = entry['value']['repertoire_id'];

            // get the statistics cache study entry
            var stats_study = await tapisIO.getStatisticsCacheStudyMetadata(repository_id, study_id)
                .catch(function(error) {
                    msg = config.log.error(context, 'error' + error);
                });
            if (msg) {
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }

            if (!stats_study || stats_study.length != 1) {
                msg = config.log.error(context, 'Incorrect number of statistics cache entries for study: ' + study_id);
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }
            stats_study = stats_study[0];
            var download_cache_id = stats_study['value']['download_cache_id'];

            config.log.info(context, 'creating statistics cache directory: ' + download_cache_id, true);
            await tapisIO.createCommunityCacheDirectory('statistics', download_cache_id)
                .catch(function(error) {
                    msg = config.log.error(context, 'error' + error);
                });
            if (msg) {
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }

            config.log.info(context, 'creating job archive directory for repertoire: ' + repertoire_id, true);
            await tapisIO.createCommunityCacheDirectory(repertoire_id, download_cache_id + '/statistics')
                .catch(function(error) {
                    msg = config.log.error(context, 'error' + error);
                });
            if (msg) {
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }

            // TODO: should have similar environment_config.js that GUI uses
            var notify = {
                url: tapisSettings.notifyHost
                    + '/irplus/v1/stats/notify/' + entry['uuid']
                    + '?status=${JOB_STATUS}'
                    + '&event=${EVENT}'
                    + '&error=${JOB_ERROR}',
                event: '*',
                persistent: true,
                policy: {
                    saveOnFailure: true
                }
            };
            var job_data = {
                name: "statistics cache",
                appId: config.statistics_app,
                batchQueue: "skx-normal",
                maxRunTime: "04:00:00",
                nodeCount: 1,
                archive: true,
                archiveSystem: tapisSettings.storageSystem,
                archivePath: '/community/cache/' + download_cache_id + '/statistics/' + repertoire_id,
                inputs: {
                    metadata_file: tapis_path + download_cache_id + '/repertoires.airr.json',
                    airr_tsv_file: tapis_path + download_cache_id + '/' + repertoire_id + '.airr.tsv.gz',
                },
                parameters: {
                    creator: "statistics_cache",
                    file_type: "rearrangement"
                },
                notifications: [ notify ]
            };

            console.log(job_data);
            var job_entry = await tapisIO.launchJob(job_data)
                .catch(function(error) {
                    msg = config.log.error(context, 'error' + error);
                });
            if (msg) {
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }
            config.log.info(context, 'submitted statistics job: ' + job_entry['id'], true);

            console.log(job_entry);
            // update with job id
            entry['value']['statistics_job_id'] = job_entry['id'];
            await tapisIO.updateMetadata(entry['uuid'], entry['name'], entry['value'], null)
                .catch(function(error) {
                    msg = config.log.error(context, 'error' + error);
                });
            if (msg) {
                webhookIO.postToSlack(msg);
                return;
            }
        }
    }

    config.log.info(context, 'end');
    return Promise.resolve();
});
